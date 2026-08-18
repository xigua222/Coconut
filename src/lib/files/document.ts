import type { EditorHandle } from "../editor/createEditor";
import { ConflictError, readDocument, writeDocument } from "../../ipc/commands";
import { pickSavePath } from "../../ipc/dialogs";
import { sameAfterNormalize } from "../editor/roundtrip";
import { watchFile } from "./watcher";
import { push as pushRecent } from "./recent";
import { markDone, markWriting } from "./agentActivity";
import { settingsStore } from "../settings/settingsStore";
import { basename } from "../utils/platform";
import { debounce } from "../utils/debounce";
import { t } from "../i18n/runtime";
import { ReactiveStore } from "../react/reactive";

/**
 * 单个打开文档的生命周期模型。
 * 状态:path(null=未命名)、md、savedMtime、dirty、encoding、lossless。
 * 原则:没有用户输入事件,绝不写盘。
 * React 版:extends ReactiveStore,每次字段变更后 notify()。
 */
export class DocumentSession extends ReactiveStore {
  path: string | null = null;
  title = t("untitled");
  /** 最新内容(编辑器防抖后回写,供大纲/状态栏派生) */
  md = "";
  /** 编辑模式:wysiwyg=所见即所得(Crepe);source=源码(textarea) */
  mode: "wysiwyg" | "source" = "wysiwyg";
  /** 源码模式下 textarea 的当前值 */
  sourceText = "";
  /** 磁盘编码;非 UTF-8 时保存将转为 UTF-8 */
  encoding = "UTF-8";
  dirty = false;
  saving = false;
  /** 文件被外部修改且本会话有未保存修改 */
  conflict = false;
  /** roundtrip 无损性:false 时提示"保存后格式会被重排" */
  lossless = true;
  error: string | null = null;

  #savedMtime: number | null = null;
  #editor: EditorHandle | null = null;
  #stopWatch: (() => void) | null = null;
  #watchPaused = false;
  /** 编辑器挂载完成后才允许置脏(拦截创建期的初始回显事件) */
  #userInputEnabled = false;
  /** 上次成功写盘/读盘的内容,用来判断是否真有未保存差异 */
  #savedMd = "";
  #autosave = debounce(() => void this.#saveInternal(true), 1500);

  /** 从磁盘打开已存在的文件 */
  static async open(path: string): Promise<DocumentSession> {
    const session = new DocumentSession();
    session.path = path;
    await session.#loadFromDisk();
    session.#startWatch();
    return session;
  }

  /** 在默认工作区新建空文档并立刻落盘 */
  static async create(path: string): Promise<DocumentSession> {
    await writeDocument(path, "", null);
    return DocumentSession.open(path);
  }

  /** 新建未命名空文档(无工作区时的回退) */
  static unnamed(): DocumentSession {
    return new DocumentSession();
  }

  // ---------- 编辑器生命周期绑定 ----------

  /** EditorPane 创建完编辑器后调用 */
  attachEditor(handle: EditorHandle): void {
    this.#editor = handle;
  }

  /** EditorPane 销毁编辑器时调用(不销毁 handle 本身) */
  detachEditor(): void {
    this.#editor = null;
  }

  /** 挂载完成后启用脏标记(首次初始回显不算输入) */
  enableUserInput(): void {
    this.#userInputEnabled = true;
  }

  /**
   * 用真实编辑器的序列化结果判定无损性(口径与保存写盘完全一致)。
   * 调用时机:编辑器挂载后、内容重载(setMarkdown)后。
   */
  reevalLossless(): void {
    const md = this.#editor?.getMarkdown();
    if (md == null) return;
    this.lossless = sameAfterNormalize(md, this.md);
    this.notify();
  }

  /**
   * 编辑器初始序列化完成时的无损判定(Crepe 的 defaultValue 异步入树,
   * 挂载瞬间 getMarkdown 还不可靠,须用首次回显结果比对原文)。
   */
  setLosslessFromSerialized(serialized: string): void {
    this.lossless = sameAfterNormalize(serialized, this.md);
    this.notify();
  }

  get editor(): EditorHandle | null {
    return this.#editor;
  }

  /**
   * 切换编辑模式(⌘E / 视图菜单)。
   * → source:先把编辑器当前内容 flush 到 md/sourceText(400ms 防抖
   *   可能滞后),再销毁编辑器由 EditorPane 渲染 textarea;
   * → wysiwyg:EditorPane 会用当前 md 重建 Crepe。
   */
  toggleMode(): void {
    if (this.mode === "wysiwyg") {
      // getMarkdown 空串时不能覆盖磁盘原文,否则切源码只剩一行
      const editorMd = this.#editor?.getMarkdown();
      const next = editorMd || this.md;
      this.md = next;
      this.sourceText = next;
      this.mode = "source";
    } else {
      this.md = this.sourceText || this.md;
      this.mode = "wysiwyg";
    }
    this.notify();
  }

  /** 源码模式输入(EditorPane textarea) */
  onSourceInput(value: string): void {
    this.sourceText = value;
    this.md = value;
    this.markUserInput();
  }

  /** 任意 markdown 变化(防抖后调用),刷新派生状态 */
  onContent(md: string): void {
    this.md = md;
    this.notify();
  }

  /** 真实输入事件 → 脏标记 + 调度自动保存。
   *  序列化结果与已保存内容归一化后相同则不算脏(空文档 trailing 换行、
   *  打完又改回去),避免关标签时对「其实没改」弹确认。 */
  markUserInput(): void {
    if (!this.#userInputEnabled) return;
    const current =
      this.mode === "source" ? this.sourceText : (this.#editor?.getMarkdown() ?? this.md);
    if (sameAfterNormalize(current, this.#savedMd)) {
      if (this.dirty) {
        this.dirty = false;
        this.#autosave.cancel();
        this.notify();
      }
      return;
    }
    this.dirty = true;
    if (settingsStore.settings.autoSave) this.#autosave();
    this.notify();
  }

  // ---------- 保存 ----------

  /** 手动保存(Cmd/Ctrl+S):立即执行并取消挂起的自动保存 */
  async save(): Promise<void> {
    this.#autosave.cancel();
    if (!this.path) {
      await this.saveAs();
      return;
    }
    if (!this.dirty && !this.error) return;
    await this.#saveInternal(false, false);
  }

  /** 另存为 */
  async saveAs(): Promise<void> {
    const base = !this.path
      ? t("untitled")
      : this.title.replace(/\.(md|markdown|mdown|mkd|mdx)$/i, "");
    const picked = await pickSavePath(`${base}.md`, settingsStore.settings.defaultWorkspace);
    if (!picked) return;
    await this.#saveInternal(false, true, picked);
  }

  /** 冲突时"保留当前版本(覆盖)":忽略 mtime 校验强制写 */
  async keepLocal(): Promise<void> {
    if (!this.path) return;
    this.conflict = false;
    await this.#saveInternal(false, false, undefined, true);
  }

  /** 冲突时"重新加载磁盘版本" */
  async reloadFromDisk(): Promise<void> {
    this.#watchPaused = true;
    try {
      await this.#loadFromDisk();
      if (this.mode === "source") this.sourceText = this.md;
      else this.#editor?.setMarkdown(this.md);
      this.reevalLossless();
      this.conflict = false;
      this.dirty = false;
      this.error = null;
    } finally {
      this.#watchPaused = false;
      this.notify();
    }
  }

  /**
   * 统一写盘路径。
   * automatic=true:自动保存(不弹另存为对话框,失败仅标记 conflict)
   * force=true:跳过 mtime 校验
   */
  async #saveInternal(
    automatic: boolean,
    saveAs = false,
    targetPath?: string,
    force = false,
  ): Promise<void> {
    const path = targetPath ?? this.path;
    if (!path) return; // 自动保存不弹对话框;手动路径由 save() 处理
    if (this.saving) return;
    // 源码模式下编辑器不存在,直接写 textarea 内容
    const content = this.mode === "source" ? this.sourceText : this.#editor?.getMarkdown();
    if (content == null) return;

    this.saving = true;
    this.error = null;
    this.#watchPaused = true;
    try {
      const res = await writeDocument(path, content, force ? null : this.#savedMtime);
      this.#savedMtime = res.mtime;
      this.path = path;
      this.title = basename(path);
      this.encoding = "UTF-8";
      this.dirty = false;
      this.conflict = false;
      this.#savedMd = content;
      if (saveAs) {
        this.#startWatch();
        void pushRecent(path);
      }
    } catch (e) {
      if (e instanceof ConflictError) {
        this.conflict = true;
      } else {
        this.error = e instanceof Error ? e.message : String(e);
        if (automatic && this.error) {
          // 自动保存失败:保留脏标记,状态栏可看到错误
        }
      }
    } finally {
      this.saving = false;
      this.#watchPaused = false;
      this.notify();
    }
  }

  // ---------- 磁盘加载与外部变更 ----------

  async #loadFromDisk(): Promise<void> {
    if (!this.path) return;
    const res = await readDocument(this.path);
    this.md = res.content;
    this.sourceText = res.content;
    this.#savedMd = res.content;
    this.encoding = res.encoding;
    this.#savedMtime = res.mtime;
    this.title = basename(this.path);
    // 无损性判定需要编辑器在场(序列化口径与写盘一致),
    // 由 EditorPane 挂载后 / #onExternalChange 重载后调用 reevalLossless
    this.notify();
  }

  #startWatch(): void {
    this.#stopWatch?.();
    if (!this.path) return;
    this.#stopWatch = watchFile(this.path, () => void this.#onExternalChange());
  }

  async #onExternalChange(): Promise<void> {
    if (this.#watchPaused || !this.path) return;
    // Agent 等外部进程正在写 → 标题栏指示器点亮
    markWriting();
    try {
      const res = await readDocument(this.path);
      // 自写事件:mtime 与已保存的一致 → 忽略
      if (res.mtime === this.#savedMtime) return;
      if (!this.dirty) {
        // 无未保存修改 → 静默重新加载
        this.md = res.content;
        this.#savedMd = res.content;
        this.#savedMtime = res.mtime;
        this.encoding = res.encoding;
        if (this.mode === "source") this.sourceText = res.content;
        else this.#editor?.setMarkdown(res.content);
        this.reevalLossless();
        markDone();
        this.notify();
      } else {
        // 有未保存修改 → 冲突横幅,让用户二选一
        this.conflict = true;
        markDone();
        this.notify();
      }
    } catch {
      // 文件被删除等极端情况,忽略
      markDone();
    }
  }

  /** 磁盘上的文件被改名后,跟着换路径并重挂监视 */
  retarget(path: string): void {
    if (this.path === path) return;
    this.path = path;
    this.title = basename(path);
    this.#startWatch();
    this.notify();
  }

  /** 关闭 tab 时释放 watcher 等资源 */
  dispose(): void {
    this.#stopWatch?.();
    this.#stopWatch = null;
    this.#autosave.cancel();
    this.#userInputEnabled = false;
  }
}
