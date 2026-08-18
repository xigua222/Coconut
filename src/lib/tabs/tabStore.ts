import type { ConfirmChoice, Tab } from "./types";
import { LIBRARY_TAB_ID } from "./types";
import { DocumentSession } from "../files/document";
import { push as pushRecent } from "../files/recent";
import { treeStore } from "../files/treeStore";
import { pickFiles } from "../../ipc/dialogs";
import { uid } from "../utils/platform";
import { normalizePath, rewritePrefix, samePath, isInside } from "../files/paths";
import { settingsStore } from "../settings/settingsStore";
import { ReactiveStore } from "../react/reactive";

/**
 * 全应用唯一可变状态中心(React 版:ReactiveStore)。
 * 窗口关闭拦截也在此:存在 dirty tab 时 preventDefault 并逐个走确认流程。
 */
class TabStore extends ReactiveStore {
  tabs: Tab[] = [];
  activeId: string | null = null;
  /** 待确认关闭的会话(有未保存修改),由 ConfirmModal 消费 */
  pendingClose: DocumentSession | null = null;

  // 以下热字段用访问器属性:任何直接赋值(组件里 store.field = x 的写法,
  // 自 Svelte $state 时代保留)都会自动 notify,保证 React 订阅者重渲染。

  /** 设置抽屉可见(原生菜单"设置…"触发) */
  #_settingsOpen = false;
  get settingsOpen(): boolean {
    return this.#_settingsOpen;
  }
  set settingsOpen(v: boolean) {
    if (this.#_settingsOpen !== v) {
      this.#_settingsOpen = v;
      this.notify();
    }
  }

  /** 搜索浮层(⌘K) */
  #_searchOpen = false;
  get searchOpen(): boolean {
    return this.#_searchOpen;
  }
  set searchOpen(v: boolean) {
    if (this.#_searchOpen !== v) {
      this.#_searchOpen = v;
      this.notify();
    }
  }


  /** 阅读进度 0-1(大纲进度条) */
  #_progress = 0;
  get progress(): number {
    return this.#_progress;
  }
  set progress(v: number) {
    if (this.#_progress !== v) {
      this.#_progress = v;
      this.notify();
    }
  }

  /** 当前活动大纲标题索引(TOC 游标) */
  #_activeToc = -1;
  get activeToc(): number {
    return this.#_activeToc;
  }
  set activeToc(v: number) {
    if (this.#_activeToc !== v) {
      this.#_activeToc = v;
      this.notify();
    }
  }

  #confirmResolve: ((c: ConfirmChoice) => void) | null = null;

  get activeTab(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null;
  }

  // ---------- 打开 / 新建 ----------

  /**
   * 打开文件。已打开则激活。
   * replace:侧栏点选时换掉当前这篇(未保存的不换,以免丢掉修改)。
   * 系统关联 / ⌘O / 拖放仍会新开标签。
   */
  async openPath(path: string, opts?: { replace?: boolean }): Promise<void> {
    path = normalizePath(path);
    const existing = this.tabs.find((t) => t.session?.path && samePath(t.session.path, path));
    if (existing) {
      this.activate(existing.id);
      const recents = await pushRecent(path);
      treeStore.adoptFile(path, recents);
      return;
    }
    const session = await DocumentSession.open(path);
    const active = this.activeTab;
    if (opts?.replace && active?.session && !active.session.dirty) {
      const old = active.session;
      active.session = session;
      old.dispose();
      this.notify();
    } else {
      this.#addTab(session);
    }
    const recents = await pushRecent(path);
    treeStore.adoptFile(path, recents);
  }

  /**
   * 启动时重开上次退出时的标签。文件被删/改名的静默跳过(之后 #touch 会把
   * 它从设置里剔掉)。这里不写 recents:恢复不算一次「访问」,否则每次启动
   * 都会把近期访问的顺序搅乱一遍。
   */
  async restoreSession(): Promise<void> {
    // 命令行/双击带进来的文件优先,不覆盖
    if (this.tabs.length) return;
    const { openTabs, activeTab } = settingsStore.settings;
    let last: Tab | null = null;
    for (const path of openTabs) {
      try {
        const tab: Tab = { id: uid(), session: await DocumentSession.open(path) };
        this.tabs.push(tab);
        if (activeTab && samePath(path, activeTab)) last = tab;
      } catch {
        // 文件已不在磁盘上:跳过
      }
    }
    if (!this.tabs.length) return;
    this.activeId = (last ?? this.tabs[this.tabs.length - 1]).id;
    this.#touch();
  }

  /** 打开「最近打开」标签:列出全部近期打开过的 Markdown */
  openLibrary(): void {
    const existing = this.tabs.find((t) => t.id === LIBRARY_TAB_ID);
    if (existing) {
      this.activate(existing.id);
      return;
    }
    this.tabs.push({ id: LIBRARY_TAB_ID, session: null });
    this.activeId = LIBRARY_TAB_ID;
    this.#touch();
  }

  /** 在默认工作区新建 Markdown */
  async newTab(): Promise<void> {
    await treeStore.bootstrap();
    const path = treeStore.allocUntitled();
    const session = await DocumentSession.create(path);
    this.#addTab(session);
    const recents = await pushRecent(path);
    treeStore.adoptFile(path, recents);
    void treeStore.refresh();
  }

  /** 打开文件对话框(多选) */
  async openFiles(): Promise<void> {
    const files = await pickFiles();
    for (const f of files) void this.openPath(f);
  }

  #addTab(session: DocumentSession): void {
    const tab: Tab = { id: uid(), session };
    this.tabs.push(tab);
    this.activeId = tab.id;
    this.#touch();
  }

  /** 标签集合/活动标签变化后统一走这里:通知订阅者 + 记下会话供下次启动恢复 */
  #touch(): void {
    this.#syncSession();
    this.notify();
  }

  #syncSession(): void {
    if (!settingsStore.ready) return;
    const openTabs = this.tabs
      .map((tab) => tab.session?.path)
      .filter((p): p is string => !!p);
    const activeTab = this.activeTab?.session?.path ?? null;
    const saved = settingsStore.settings;
    const same =
      activeTab === saved.activeTab &&
      openTabs.length === saved.openTabs.length &&
      openTabs.every((p, i) => p === saved.openTabs[i]);
    if (!same) settingsStore.patch({ openTabs, activeTab });
  }

  /** 磁盘改名后,已打开标签跟着换路径 */
  rewritePaths(from: string, to: string): void {
    let changed = false;
    for (const tab of this.tabs) {
      const p = tab.session?.path;
      if (!p) continue;
      const next = rewritePrefix(p, from, to);
      if (next !== p) {
        tab.session?.retarget(next);
        changed = true;
      }
    }
    if (changed) this.#touch();
  }

  /** 文件已从磁盘消失:关掉对应标签,不走未保存确认 */
  closeMatching(path: string): void {
    const ids = this.tabs
      .filter((tab) => {
        const p = tab.session?.path;
        return p ? samePath(p, path) || isInside(p, path) : false;
      })
      .map((tab) => tab.id);
    for (const id of ids) this.#remove(id);
  }

  activate(id: string): void {
    if (this.tabs.some((t) => t.id === id)) {
      this.activeId = id;
      this.#touch();
    }
  }

  /** 循环切换标签(上一个/下一个) */
  activateRelative(delta: number): void {
    const n = this.tabs.length;
    if (n < 2) return;
    const idx = Math.max(0, this.tabs.findIndex((t) => t.id === this.activeId));
    this.activate(this.tabs[(((idx + delta) % n) + n) % n].id);
  }

  /** 拖拽排序 */
  moveTab(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= this.tabs.length || to >= this.tabs.length) return;
    const [tab] = this.tabs.splice(from, 1);
    this.tabs.splice(to, 0, tab);
    this.#touch();
  }

  reorder(ids: string[]): void {
    if (ids.length !== this.tabs.length) return;
    const byId = new Map(this.tabs.map((tab) => [tab.id, tab]));
    const next: Tab[] = [];
    for (const id of ids) {
      const tab = byId.get(id);
      if (!tab) return;
      next.push(tab);
    }
    this.tabs = next;
    this.#touch();
  }

  // ---------- 关闭(含未保存确认) ----------

  /** 返回 false 表示用户在未保存确认里选了取消 */
  async close(id: string): Promise<boolean> {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return true;
    if (tab.session && !(await this.#settleDirty(tab.session))) return false;
    this.#remove(id);
    return true;
  }

  /** 关闭其它标签 */
  async closeOthers(keepId: string): Promise<void> {
    await this.#closeSeq(this.tabs.filter((t) => t.id !== keepId).map((t) => t.id));
  }

  /** 关闭某个标签右侧的全部标签 */
  async closeToRight(fromId: string): Promise<void> {
    const idx = this.tabs.findIndex((t) => t.id === fromId);
    if (idx >= 0) await this.#closeSeq(this.tabs.slice(idx + 1).map((t) => t.id));
  }

  async closeAll(): Promise<void> {
    await this.#closeSeq(this.tabs.map((t) => t.id));
  }

  /** 批量关闭:任一个在确认框里被取消,后面的就都不关了 */
  async #closeSeq(ids: string[]): Promise<void> {
    for (const id of ids) {
      if (!(await this.close(id))) return;
    }
  }

  #remove(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    this.tabs[idx].session?.dispose();
    this.tabs.splice(idx, 1);
    if (this.activeId === id) {
      this.activeId = this.tabs[idx]?.id ?? this.tabs[idx - 1]?.id ?? null;
    }
    this.#touch();
  }

  // ---------- 保存 ----------

  async saveActive(): Promise<void> {
    const tab = this.activeTab;
    await tab?.session?.save();
    if (tab?.session?.path) treeStore.adoptFile(tab.session.path);
  }

  async saveAsActive(): Promise<void> {
    const tab = this.activeTab;
    await tab?.session?.saveAs();
    if (tab?.session?.path) {
      const recents = await pushRecent(tab.session.path);
      treeStore.adoptFile(tab.session.path, recents);
    }
  }

  async saveAllDirty(): Promise<void> {
    for (const t of this.tabs) {
      if (t.session?.dirty) await t.session.save();
    }
  }

  /** 大纲点击跳转 */
  scrollToActive(slug: string): void {
    this.activeTab?.session?.editor?.scrollToHeading(slug);
  }

  // ---------- 窗口关闭拦截 ----------

  /**
   * 返回 true 表示可以关闭窗口。
   * 自动保存开启且已有路径 → 静默落盘;否则才逐个弹确认。
   */
  async handleCloseRequest(): Promise<boolean> {
    for (const tab of this.tabs) {
      if (!tab.session) continue;
      if (!(await this.#settleDirty(tab.session))) return false;
    }
    return true;
  }

  /** 自动保存开着且有路径时直接写盘,不弹窗;失败或未开自动保存才确认。 */
  async #settleDirty(session: DocumentSession): Promise<boolean> {
    if (!session.dirty) return true;
    if (settingsStore.settings.autoSave && session.path) {
      await session.save();
      if (!session.dirty) return true;
    }
    const choice = await this.#confirm(session);
    if (choice === "cancel") return false;
    if (choice === "save") {
      await session.save();
      return !session.dirty;
    }
    return true;
  }

  #confirm(session: DocumentSession): Promise<ConfirmChoice> {
    this.pendingClose = session;
    this.notify();
    return new Promise((resolve) => {
      this.#confirmResolve = resolve;
    });
  }

  resolveConfirm(choice: ConfirmChoice): void {
    this.pendingClose = null;
    this.#confirmResolve?.(choice);
    this.#confirmResolve = null;
    this.notify();
  }
}

export const tabStore = new TabStore();
