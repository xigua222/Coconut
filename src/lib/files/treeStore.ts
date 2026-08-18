/**
 * 工作区:默认工作区 + 用户自建工作区用真实目录树;
 * 近期打开(recent.json,含工作区内)钉在侧栏底部,点开按文件列表展示。
 */
import { settingsStore } from "../settings/settingsStore";
import { scanDirectory, renamePath, trashPath, ensureDefaultWorkspace, type DirEntry } from "../../ipc/commands";
import { pickFolder } from "../../ipc/dialogs";
import { watch } from "@tauri-apps/plugin-fs";
import { tabStore } from "../tabs/tabStore";
import { debounce } from "../utils/debounce";
import { markDone, markWriting } from "./agentActivity";
import { ReactiveStore } from "../react/reactive";
import {
  list as listRecentOpened,
  remove as removeRecentOpened,
  removeUnder as removeRecentUnder,
  rewritePrefix as rewriteRecent,
} from "./recent";
import { t } from "../i18n/runtime";
import {
  dirname,
  findContainingPlace,
  folderName,
  isInside,
  joinPath,
  rewritePrefix,
  samePath,
  uniquePaths,
} from "./paths";

export const RECENT_ROOT_ID = "__coconut_recent__";

export type LibraryNode = {
  id: string;
  label: string;
  children?: LibraryNode[];
};

export type WorkspaceSection = {
  id: string;
  kind: "default" | "workspace" | "recent";
  label: string;
  root: string | null;
  nodes: LibraryNode[];
};

function entriesToTree(entries: DirEntry[]): LibraryNode[] {
  const root: LibraryNode[] = [];
  const stack: { depth: number; node: LibraryNode }[] = [];
  for (const e of entries) {
    const node: LibraryNode = {
      id: e.path,
      label: e.name,
      children: e.is_dir ? [] : undefined,
    };
    while (stack.length && stack[stack.length - 1].depth >= e.depth) stack.pop();
    if (!stack.length) root.push(node);
    else {
      const parent = stack[stack.length - 1].node;
      (parent.children ??= []).push(node);
    }
    if (e.is_dir) stack.push({ depth: e.depth, node });
  }
  return root;
}

class TreeStore extends ReactiveStore {
  placeTrees: { root: string; entries: DirEntry[] }[] = [];
  expanded = new Set<string>();
  /** 收起的区块:工作区 id / 近期访问.默认工作区展开,近期访问收起 */
  collapsed = new Set<string>([RECENT_ROOT_ID]);
  /** recent.json 里全部最近打开(含工作区内),侧栏底部列表用 */
  recentOpened: string[] = [];
  loading = false;
  error: string | null = null;
  #revealPath: string | null = null;
  #stopWatches: (() => void)[] = [];
  #boot: Promise<void> | null = null;
  #pendingNew = new Set<string>();

  get defaultWorkspace(): string | null {
    return settingsStore.settings.defaultWorkspace;
  }

  get extraWorkspaces(): string[] {
    return settingsStore.settings.workspaces;
  }

  get workspaceRoots(): string[] {
    const def = this.defaultWorkspace;
    return uniquePaths(def ? [def, ...this.extraWorkspaces] : this.extraWorkspaces);
  }

  get recentAccess(): string[] {
    return this.#outsideWorkspaces(settingsStore.settings.recentAccess);
  }

  get recentNodes(): LibraryNode[] {
    return this.recentOpened.map((p) => ({ id: p, label: folderName(p) }));
  }

  isSectionOpen(id: string): boolean {
    return !this.collapsed.has(id);
  }

  toggleSection(id: string): void {
    const next = new Set(this.collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.collapsed = next;
    this.notify();
  }

  openSection(id: string): void {
    if (!this.collapsed.has(id)) return;
    const next = new Set(this.collapsed);
    next.delete(id);
    this.collapsed = next;
    this.notify();
  }

  #isWorkspaceDoc(path: string, roots = this.workspaceRoots): boolean {
    if (findContainingPlace(path, roots)) return true;
    for (const { root, entries } of this.placeTrees) {
      if (roots.length && !roots.some((r) => samePath(r, root))) continue;
      if (entries.some((e) => !e.is_dir && samePath(e.path, path))) return true;
    }
    return false;
  }

  #outsideWorkspaces(files: string[], roots = this.workspaceRoots): string[] {
    return files.filter((f) => !this.#isWorkspaceDoc(f, roots));
  }

  get sections(): WorkspaceSection[] {
    const out: WorkspaceSection[] = [];
    const def = this.defaultWorkspace;
    if (def) {
      const tree = this.placeTrees.find((t) => samePath(t.root, def));
      out.push({
        id: def,
        kind: "default",
        label: folderName(def),
        root: def,
        nodes: tree ? entriesToTree(tree.entries) : [],
      });
    }
    for (const root of this.extraWorkspaces) {
      const tree = this.placeTrees.find((t) => samePath(t.root, root));
      out.push({
        id: root,
        kind: "workspace",
        label: folderName(root),
        root,
        nodes: tree ? entriesToTree(tree.entries) : [],
      });
    }
    return out;
  }

  get libraryFiles(): { path: string; name: string; source: string }[] {
    const out: { path: string; name: string; source: string }[] = [];
    const def = this.defaultWorkspace;
    for (const { root, entries } of this.placeTrees) {
      const source = def && samePath(root, def) ? t("defaultWorkspace") : folderName(root);
      for (const e of entries) {
        if (!e.is_dir) out.push({ path: e.path, name: e.name, source });
      }
    }
    for (const p of this.recentAccess) {
      out.push({ path: p, name: folderName(p), source: t("recentOpened") });
    }
    return out;
  }

  get fileCount(): number {
    return this.libraryFiles.length;
  }

  isFile(id: string): boolean {
    if (this.recentOpened.some((p) => samePath(p, id))) return true;
    if (this.recentAccess.some((p) => samePath(p, id))) return true;
    for (const { entries } of this.placeTrees) {
      const e = entries.find((x) => samePath(x.path, id));
      if (e) return !e.is_dir;
    }
    return false;
  }

  isRecent(id: string): boolean {
    return (
      this.recentOpened.some((p) => samePath(p, id)) ||
      this.recentAccess.some((p) => samePath(p, id))
    );
  }

  isWorkspaceRoot(id: string): boolean {
    return this.workspaceRoots.some((p) => samePath(p, id));
  }

  isDefaultWorkspace(id: string): boolean {
    return !!this.defaultWorkspace && samePath(this.defaultWorkspace, id);
  }

  #pruneRecentAccess(roots = this.workspaceRoots): void {
    const next = this.#outsideWorkspaces(settingsStore.settings.recentAccess, roots);
    if (next.length !== settingsStore.settings.recentAccess.length) {
      settingsStore.update("recentAccess", next);
    }
  }

  async bootstrap(): Promise<void> {
    this.#boot ??= this.#doBootstrap();
    return this.#boot;
  }

  async #doBootstrap(): Promise<void> {
    if (!settingsStore.settings.defaultWorkspace) {
      try {
        const path = await ensureDefaultWorkspace();
        settingsStore.patch({ defaultWorkspace: path });
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
        this.notify();
      }
    }
    await this.refresh();
    this.#pruneRecentAccess();
    await this.#syncRecentOpened();
  }

  async #syncRecentOpened(): Promise<void> {
    try {
      this.recentOpened = await listRecentOpened();
      this.notify();
    } catch {
      /* recent.json 读失败时保留内存列表 */
    }
  }

  async addWorkspace(explicit?: string | null): Promise<void> {
    const picked = explicit ?? (await pickFolder());
    if (!picked) return;
    const def = settingsStore.settings.defaultWorkspace;
    if (def && samePath(def, picked)) {
      this.expanded = new Set([...this.expanded]);
      this.notify();
      return;
    }
    const workspaces = uniquePaths([...settingsStore.settings.workspaces, picked]);
    const roots = uniquePaths(def ? [def, ...workspaces] : workspaces);
    const recentAccess = this.#outsideWorkspaces(settingsStore.settings.recentAccess, roots);
    this.expanded = new Set([...this.expanded]);
    settingsStore.patch({ workspaces, recentAccess });
    if (!settingsStore.settings.sidebarVisible) {
      settingsStore.update("sidebarVisible", true);
    }
    this.notify();
  }

  async changeDefaultWorkspace(): Promise<void> {
    const picked = await pickFolder();
    if (!picked) return;
    const workspaces = settingsStore.settings.workspaces.filter((p) => !samePath(p, picked));
    const roots = uniquePaths([picked, ...workspaces]);
    const recentAccess = this.#outsideWorkspaces(settingsStore.settings.recentAccess, roots);
    settingsStore.patch({ defaultWorkspace: picked, workspaces, recentAccess });
    this.notify();
  }

  removeWorkspace(path: string): void {
    if (this.isDefaultWorkspace(path)) return;
    const workspaces = settingsStore.settings.workspaces.filter((p) => !samePath(p, path));
    settingsStore.patch({ workspaces });
    this.placeTrees = this.placeTrees.filter((t) => !samePath(t.root, path));
    const collapsed = new Set(this.collapsed);
    collapsed.delete(path);
    this.collapsed = collapsed;
    this.notify();
  }

  /** 打开任意 md:工作区内展开对应树;同时记入近期打开列表 */
  adoptFile(path: string, recents?: string[]): void {
    this.#revealPath = path;
    this.#pruneRecentAccess();
    this.recentOpened = (recents ?? uniquePaths([path, ...this.recentOpened])).slice(0, 20);
    if (this.#isWorkspaceDoc(path)) {
      this.#expandToFile(path);
    } else {
      const recentAccess = uniquePaths([path, ...this.recentAccess]);
      if (
        recentAccess.length !== settingsStore.settings.recentAccess.length ||
        (this.recentAccess[0] && !samePath(this.recentAccess[0], path))
      ) {
        settingsStore.update("recentAccess", recentAccess);
      }
      this.#expandToFile(path);
    }
    this.notify();
  }

  forgetFile(path: string): void {
    settingsStore.update(
      "recentAccess",
      settingsStore.settings.recentAccess.filter((p) => !samePath(p, path)),
    );
    this.recentOpened = this.recentOpened.filter((p) => !samePath(p, path));
    this.notify();
    void removeRecentOpened(path);
  }

  revealForFile(path: string): void {
    this.adoptFile(path);
  }

  allocUntitled(): string {
    const dir = this.defaultWorkspace;
    if (!dir) throw new Error(t("workspaceNotReady"));
    const used = (path: string) =>
      this.libraryFiles.some((f) => samePath(f.path, path)) || this.#pendingNew.has(path);
    const tryName = (name: string) => {
      const path = joinPath(dir, name);
      if (used(path)) return null;
      this.#pendingNew.add(path);
      return path;
    };
    const first = tryName(t("untitledFile"));
    if (first) return first;
    for (let i = 2; i < 1000; i++) {
      const next = tryName(t("untitledFileN", { n: i }));
      if (next) return next;
    }
    const fallback = joinPath(dir, t("untitledFileN", { n: Date.now() }));
    this.#pendingNew.add(fallback);
    return fallback;
  }

  #expandToFile(path: string): void {
    const next = new Set(this.expanded);
    const containing = findContainingPlace(path, this.workspaceRoots);
    if (containing) {
      const collapsed = new Set(this.collapsed);
      collapsed.delete(containing);
      this.collapsed = collapsed;
      const norm = (p: string) => p.replace(/\\/g, "/");
      const target = norm(path);
      const tree = this.placeTrees.find((t) => samePath(t.root, containing));
      if (tree) {
        for (const e of tree.entries) {
          if (e.is_dir && target.startsWith(`${norm(e.path)}/`)) next.add(e.path);
        }
      }
    }
    this.expanded = next;
  }

  openFile(path: string): void {
    void tabStore.openPath(path, { replace: true });
  }

  canRename(path: string): boolean {
    return path !== RECENT_ROOT_ID && path.length > 0 && !this.isWorkspaceRoot(path);
  }

  async rename(path: string, nextName: string): Promise<boolean> {
    if (!this.canRename(path)) return false;
    const oldName = folderName(path);
    let name = nextName.trim();
    if (!name || name === oldName) return false;
    if (this.isFile(path) && /\.(md|markdown|mdown|mkd|mdx)$/i.test(oldName) && !/\.[^./\\]+$/.test(name)) {
      name = `${name}.md`;
    }
    try {
      const to = await renamePath(path, name);
      this.#rewriteAll(path, to);
      await this.refresh();
      this.error = null;
      this.notify();
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.notify();
      return false;
    }
  }

  /** 移到废纸篓;工作区根不能删。已打开的标签会一起关掉。 */
  async trash(path: string): Promise<boolean> {
    if (!this.canRename(path)) return false;
    try {
      await trashPath(path);
      this.#forgetUnder(path);
      tabStore.closeMatching(path);
      await this.refresh();
      this.error = null;
      this.notify();
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.notify();
      return false;
    }
  }

  #forgetUnder(path: string): void {
    const gone = (p: string) => samePath(p, path) || isInside(p, path);
    settingsStore.update(
      "recentAccess",
      settingsStore.settings.recentAccess.filter((p) => !gone(p)),
    );
    this.recentOpened = this.recentOpened.filter((p) => !gone(p));
    this.expanded = new Set([...this.expanded].filter((p) => !gone(p)));
    void removeRecentUnder(path);
  }

  #rewriteAll(from: string, to: string): void {
    let defaultWorkspace = settingsStore.settings.defaultWorkspace;
    if (defaultWorkspace) defaultWorkspace = rewritePrefix(defaultWorkspace, from, to);
    const workspaces = this.extraWorkspaces.map((p) => rewritePrefix(p, from, to));
    const recentAccess = this.recentAccess.map((p) => rewritePrefix(p, from, to));
    settingsStore.patch({ defaultWorkspace, workspaces, recentAccess });
    this.recentOpened = this.recentOpened.map((p) => rewritePrefix(p, from, to));
    this.expanded = new Set([...this.expanded].map((p) => rewritePrefix(p, from, to)));
    this.collapsed = new Set([...this.collapsed].map((p) => rewritePrefix(p, from, to)));
    this.placeTrees = this.placeTrees.map((t) => ({
      root: rewritePrefix(t.root, from, to),
      entries: t.entries.map((e) => ({ ...e, path: rewritePrefix(e.path, from, to) })),
    }));
    tabStore.rewritePaths(from, to);
    void rewriteRecent(from, to);
  }

  async refresh(): Promise<void> {
    await this.#doScan();
    this.#restartWatch();
  }

  async #doScan(): Promise<void> {
    const roots = this.workspaceRoots;
    if (!roots.length) {
      this.placeTrees = [];
      this.loading = false;
      if (this.#revealPath) this.#expandToFile(this.#revealPath);
      this.notify();
      return;
    }
    this.loading = true;
    this.error = null;
    this.notify();
    const trees: { root: string; entries: DirEntry[] }[] = [];
    try {
      for (const root of roots) {
        try {
          trees.push({ root, entries: await scanDirectory(root) });
        } catch (e) {
          this.error = e instanceof Error ? e.message : String(e);
          trees.push({ root, entries: [] });
        }
      }
      this.placeTrees = trees;
      this.#pendingNew.clear();
      this.#pruneRecentAccess();
      await this.#syncRecentOpened();
      const keep = new Set<string>([...this.recentAccess.map(dirname)]);
      for (const { entries } of trees) {
        for (const e of entries) keep.add(e.path);
      }
      const next = new Set([...this.expanded].filter((p) => keep.has(p)));
      this.expanded = next;
      if (this.#revealPath) this.#expandToFile(this.#revealPath);
    } finally {
      this.loading = false;
      this.notify();
    }
  }

  #restartWatch(): void {
    for (const stop of this.#stopWatches) stop();
    this.#stopWatches = [];
    for (const root of this.workspaceRoots) {
      void watch(root, () => {
        markWriting();
        this.#rescan();
      }).then((unlisten) => {
        this.#stopWatches.push(unlisten);
      });
    }
  }

  #rescan = debounce(() => {
    void this.#doScan().finally(() => markDone());
  }, 600);
}

export const treeStore = new TreeStore();
