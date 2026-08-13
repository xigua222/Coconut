/**
 * 文件列表面板状态:浏览所选目录(含子目录)的 Markdown 文件,
 * Agent 新建/删除文件后自动刷新(watch 根目录 + 防抖 rescan)。
 *
 * 根目录持久化在 settings.folderRoot;树数据(扁平 + depth)来自
 * Rust scan_directory 命令;watch 用 fs 插件(需 capabilities scope)。
 */
import { settingsStore } from "../settings/settingsStore.svelte";
import { scanDirectory, type DirEntry } from "../../ipc/commands";
import { pickFolder } from "../../ipc/dialogs";
import { watch } from "@tauri-apps/plugin-fs";
import { tabStore } from "../tabs/tabStore.svelte";
import { debounce } from "../utils/debounce";
import { markDone, markWriting } from "./agentActivity.svelte";

class TreeStore {
  /** 当前根目录(派生自设置) */
  root = $derived(settingsStore.settings.folderRoot);
  entries = $state<DirEntry[]>([]);
  /** 展开的目录路径集合 */
  expanded = $state<Set<string>>(new Set());
  loading = $state(false);
  error = $state<string | null>(null);

  /** 可见条目:根目录 + 展开目录下的后代 */
  visible = $derived.by(() => {
    const root = this.root;
    if (!root) return [];
    const out: DirEntry[] = [];
    for (const e of this.entries) {
      if (e.depth === 0 || this.isAncestorVisible(e)) out.push(e);
    }
    return out;
  });

  #stopWatch: (() => void) | null = null;
  /** 重扫描防抖(watch 事件可能密集);扫描完成即指示器 done */
  #rescan = debounce(() => {
    void this.#doScan().finally(() => markDone());
  }, 600);

  /** 判断条目是否应显示:父目录链都在展开集里 */
  isAncestorVisible(entry: DirEntry): boolean {
    const parent = this.#parentOf(entry.path);
    if (!parent) return false;
    return this.expanded.has(parent) && this.isAncestorVisibleByPath(parent);
  }

  isAncestorVisibleByPath(path: string): boolean {
    const e = this.entries.find((x) => x.path === path);
    if (!e || e.depth === 0) return true;
    const parent = this.#parentOf(e.path);
    if (!parent) return false;
    return this.expanded.has(parent) && this.isAncestorVisibleByPath(parent);
  }

  #parentOf(path: string): string | null {
    // 从条目表找 path 的父目录:depth-1 且 path 前缀匹配(分隔符统一为正斜杠,兼容 Windows)
    const norm = (p: string) => p.replace(/\\/g, "/");
    const self = this.entries.find((x) => x.path === path);
    if (!self || self.depth === 0) return null;
    const np = norm(path);
    let best: DirEntry | null = null;
    for (const e of this.entries) {
      if (e.is_dir && e.depth === self.depth - 1 && np.startsWith(norm(e.path) + "/")) {
        if (!best || e.path.length > best.path.length) best = e;
      }
    }
    return best?.path ?? null;
  }

  /** 选择目录作为根(文件列表面板入口) */
  async pickRoot(): Promise<void> {
    const picked = await pickFolder();
    if (!picked) return;
    settingsStore.update("folderRoot", picked);
    this.expanded = new Set();
    await this.refresh();
  }

  /** 切换目录展开态(点击目录行) */
  toggleDir(path: string): void {
    const next = new Set(this.expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this.expanded = next;
  }

  /** 打开文件:复用统一打开通道(tab 复用/最近文件) */
  openFile(path: string): void {
    void tabStore.openPath(path);
  }

  /** 手动刷新(重扫 + 重启 watch) */
  async refresh(): Promise<void> {
    await this.#doScan();
    this.#restartWatch();
  }

  async #doScan(): Promise<void> {
    const root = this.root;
    if (!root) return;
    this.loading = true;
    this.error = null;
    try {
      const entries = await scanDirectory(root);
      // 保留仍在展开集中的目录(文件可能被删)
      const paths = new Set(entries.map((e) => e.path));
      this.expanded = new Set([...this.expanded].filter((p) => paths.has(p)));
      this.entries = entries;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  #restartWatch(): void {
    const root = this.root;
    this.#stopWatch?.();
    this.#stopWatch = null;
    if (!root) return;
    void watch(root, () => {
      // Agent 等外部进程正在写 → 指示器点亮;防抖后重扫
      markWriting();
      this.#rescan();
    }).then((unlisten) => {
      this.#stopWatch = unlisten;
    });
  }

  /** 根目录变化时重新扫描(settings.folderRoot 变更) */
  watchRoot(): void {
    // 由 Sidebar 的 effect 调用;此处防抖防重复
    void this.refresh();
  }
}

export const treeStore = new TreeStore();
