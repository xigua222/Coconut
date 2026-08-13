import type { ConfirmChoice, Tab } from "./types";
import { DocumentSession } from "../files/document";
import { push as pushRecent } from "../files/recent";
import { pickFiles } from "../../ipc/dialogs";
import { uid } from "../utils/platform";
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
  /** 设置抽屉可见(原生菜单"设置…"触发) */
  settingsOpen = false;
  /** 搜索浮层(⌘K) */
  searchOpen = false;
  /** 侧栏展开 */
  sidebarVisible = true;
  /** 阅读进度 0-1(顶栏进度条) */
  progress = 0;
  /** 当前活动大纲标题索引(TOC 游标) */
  activeToc = -1;

  #confirmResolve: ((c: ConfirmChoice) => void) | null = null;

  get activeTab(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null;
  }

  // ---------- 打开 / 新建 ----------

  /** 已打开则激活,否则新建 tab */
  async openPath(path: string): Promise<void> {
    const existing = this.tabs.find((t) => t.session.path === path);
    if (existing) {
      this.activate(existing.id);
      return;
    }
    const session = await DocumentSession.open(path);
    this.#addTab(session);
    void pushRecent(path);
  }

  newTab(): void {
    this.#addTab(DocumentSession.unnamed());
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
    this.notify();
  }

  activate(id: string): void {
    if (this.tabs.some((t) => t.id === id)) {
      this.activeId = id;
      this.notify();
    }
  }

  /** 拖拽排序 */
  moveTab(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= this.tabs.length || to >= this.tabs.length) return;
    const [tab] = this.tabs.splice(from, 1);
    this.tabs.splice(to, 0, tab);
    this.notify();
  }

  // ---------- 关闭(含未保存确认) ----------

  async close(id: string): Promise<void> {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.session.dirty) {
      const choice = await this.#confirm(tab.session);
      if (choice === "cancel") return;
      if (choice === "save") {
        await tab.session.save();
        if (tab.session.dirty) return; // 保存失败/用户取消另存 → 不关闭
      }
    }
    this.#remove(id);
  }

  #remove(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    this.tabs[idx].session.dispose();
    this.tabs.splice(idx, 1);
    if (this.activeId === id) {
      this.activeId = this.tabs[idx]?.id ?? this.tabs[idx - 1]?.id ?? null;
    }
    this.notify();
  }

  // ---------- 保存 ----------

  async saveActive(): Promise<void> {
    await this.activeTab?.session.save();
  }

  async saveAsActive(): Promise<void> {
    await this.activeTab?.session.saveAs();
  }

  async saveAllDirty(): Promise<void> {
    for (const t of this.tabs) {
      if (t.session.dirty) await t.session.save();
    }
  }

  /** 大纲点击跳转 */
  scrollToActive(slug: string): void {
    this.activeTab?.session.editor?.scrollToHeading(slug);
  }

  // ---------- 窗口关闭拦截 ----------

  /**
   * 返回 true 表示可以关闭窗口。
   * 存在 dirty tab 时逐个弹确认(保存 / 放弃 / 取消)。
   */
  async handleCloseRequest(): Promise<boolean> {
    const dirty = this.tabs.filter((t) => t.session.dirty);
    for (const tab of dirty) {
      const choice = await this.#confirm(tab.session);
      if (choice === "cancel") return false;
      if (choice === "save") {
        await tab.session.save();
        if (tab.session.dirty) return false;
      }
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
