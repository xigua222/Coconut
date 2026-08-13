<script lang="ts">
  /**
   * 编辑器窗格:持有 Crepe 实例,随 activeTab 切换做 create/destroy。
   * 滚动/进度由外层 .content 容器负责(App.svelte 统一监听)。
   * 文档始终可编辑,无阅读/编辑模式之分。
   *
   * 关键约束:
   * - Crepe 挂载到独立的 editor-host 子元素 —— 挂载/卸载会 innerHTML
   *   清空挂载点,绝不能碰 Svelte 管理的节点(横幅);
   * - 挂载 effect 绝不能读 session 的响应式字段(md),否则每次输入
   *   回显都会重建编辑器(丢焦点/光标回顶/退格异常),所有挂载期
   *   读取一律包在 untrack 里。
   */
  import { untrack } from "svelte";
  import { createEditor, type EditorHandle } from "../lib/editor/createEditor";
  import type { DocumentSession } from "../lib/files/document.svelte";
  import { tabStore } from "../lib/tabs/tabStore.svelte";
  import { findUI } from "../lib/editor/plugins/findUI.svelte";
  import { debounce } from "../lib/utils/debounce";
  import { exportCurrentHtml, exportCurrentPdf } from "../lib/files/export";
  import { openInVscode, showInFolder } from "../ipc/commands";
  import { isMac, isWindows } from "../lib/utils/platform";
  import ConflictBanner from "./ConflictBanner.svelte";
  import NormalizeNotice from "./NormalizeNotice.svelte";

  let editorHost = $state<HTMLDivElement | null>(null);

  let session = $derived(tabStore.activeTab?.session ?? null);
  let boundSession: DocumentSession | null = null;
  let handle: EditorHandle | null = null;
  /** 挂载令牌:异步创建期间 tab 切换则作废 */
  let mountToken = 0;

  /** 右键上下文菜单:编辑器内弹出原生菜单(常用操作外放) */
  async function onContextMenu(e: MouseEvent): Promise<void> {
    const s = boundSession;
    if (!s) return;
    // 源码模式 textarea 用系统默认菜单(复制/粘贴原生即可)
    if (s.mode === "source") return;
    e.preventDefault();
    try {
      const { Menu, MenuItem } = await import("@tauri-apps/api/menu");
      const { LogicalPosition } = await import("@tauri-apps/api/dpi");
      const target = tabStore.activeTab?.session;
      const run = (fn: () => void) => () => {
        if (tabStore.activeTab?.session === target) fn();
      };
      const items: Awaited<ReturnType<typeof MenuItem.new>>[] = [];
      const hasSelection = (window.getSelection()?.toString().length ?? 0) > 0;
      if (hasSelection) {
        items.push(
          await MenuItem.new({
            text: "复制",
            id: "copy",
            accelerator: "CmdOrCtrl+C",
            action: run(() => document.execCommand("copy")), // 走 richCopy 富文本拦截
          }),
        );
      }
      items.push(
        await MenuItem.new({
          text: "粘贴",
          id: "paste",
          accelerator: "CmdOrCtrl+V",
          action: run(() => document.execCommand("paste")),
        }),
      );
      items.push(
        await MenuItem.new({
          text: "查找…",
          id: "find",
          accelerator: "CmdOrCtrl+F",
          action: run(() => target?.editor?.find.open()),
        }),
      );
      items.push(
        await MenuItem.new({
          text: "全选",
          id: "select-all",
          accelerator: "CmdOrCtrl+A",
          action: run(() => target?.editor?.selectAll()),
        }),
      );
      items.push(
        await MenuItem.new({
          text: "源码模式",
          id: "toggle-source",
          accelerator: "CmdOrCtrl+E",
          action: run(() => target?.toggleMode()),
        }),
      );
      items.push(
        await MenuItem.new({
          text: "导出 HTML…",
          id: "export-html",
          action: run(() => target && void exportCurrentHtml(target)),
        }),
      );
      items.push(
        await MenuItem.new({
          text: "导出 PDF…",
          id: "export-pdf",
          action: run(() => target && void exportCurrentPdf(target)),
        }),
      );
      if (s.path) {
        items.push(
          await MenuItem.new({
            text: isMac ? "在访达中显示" : isWindows ? "在资源管理器中显示" : "在文件管理器中显示",
            id: "show-in-finder",
            action: run(() => target?.path && void showInFolder(target.path)),
          }),
        );
        items.push(
          await MenuItem.new({
            text: "在 VS Code 中打开",
            id: "open-in-vscode",
            action: run(() => target?.path && void openInVscode(target.path).catch(() => {})),
          }),
        );
      }
      const menu = await Menu.new({ items });
      await menu.popup(new LogicalPosition(e.clientX, e.clientY));
    } catch {
      // mock/浏览器环境无原生菜单:静默(默认右键行为已被 preventDefault 拦掉,可接受)
    }
  }

  // markdown 变化 → 刷新派生状态(400ms 防抖;
  // crepe 内部 markdownUpdated 本身已带 200ms 防抖)
  const onMd = debounce((s: DocumentSession, md: string) => {
    s.onContent(md);
  }, 400);

  function teardown() {
    // 编辑器销毁(切 tab/重挂)时关闭文内搜索浮层
    findUI.open = false;
    if (handle) {
      handle.destroy();
      handle = null;
    }
    if (boundSession) {
      boundSession.detachEditor();
      boundSession = null;
    }
    if (editorHost) editorHost.innerHTML = "";
  }

  async function mountEditor(s: DocumentSession, token: number) {
    teardown();
    if (!editorHost) return;
    boundSession = s;
    editorHost.innerHTML = "";
    const root = document.createElement("div");
    root.className = "crepe";
    editorHost.appendChild(root);

    const h = await createEditor({
      root,
      initialValue: s.md,
      onMarkdownChange: (md) => onMd(s, md),
      onUserInput: () => s.markUserInput(),
      // 初始文档入树后的首次序列化 → 无损判定(与保存写盘口径一致)
      onInitialSerialized: (md) => s.setLosslessFromSerialized(md),
      // 本地图片显示:以文档所在目录为基准解析相对路径
      imageBaseDir: s.path ? s.path.replace(/[/\\][^/\\]+$/, "") : null,
    });
    if (token !== mountToken) {
      h.destroy();
      return;
    }
    handle = h;
    s.attachEditor(h);
    s.enableUserInput();
  }

  $effect(() => {
    // 只追踪 session 身份 + 编辑模式(切模式时重挂);挂载过程本身用
    // untrack 隔离,避免读到 s.md 后随内容变化反复重建编辑器
    const s = session;
    const mode = s?.mode;
    const token = ++mountToken;
    untrack(() => {
      if (!s) {
        teardown();
        return;
      }
      if (s.mode === "source") {
        // 源码模式:销毁 Crepe,渲染 textarea(内容由 toggleMode 已 flush)
        teardown();
        return;
      }
      void mountEditor(s, token);
    });
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor-pane" oncontextmenu={(e) => void onContextMenu(e)}>
  {#if session?.mode === "source"}
    <div class="source-pane">
      <textarea
        spellcheck="false"
        bind:value={session.sourceText}
        oninput={(e) => session.onSourceInput(e.currentTarget.value)}
        onkeydown={(e) => {
          // Tab 插入两个空格(与常见源码编辑器习惯一致)
          if (e.key === "Tab") {
            e.preventDefault();
            const ta = e.currentTarget;
            const start = ta.selectionStart ?? ta.value.length;
            const end = ta.selectionEnd ?? ta.value.length;
            const next = ta.value.slice(0, start) + "  " + ta.value.slice(end);
            session.onSourceInput(next);
            requestAnimationFrame(() => {
              ta.selectionStart = ta.selectionEnd = start + 2;
            });
          }
        }}
      ></textarea>
    </div>
  {:else}
    <div class="editor-host" bind:this={editorHost}></div>
  {/if}

  <div class="overlays">
    {#if session?.conflict}
      <ConflictBanner {session} />
    {/if}
    {#if session && !session.lossless}
      <NormalizeNotice {session} />
    {/if}
    {#if session?.error}
      <div class="banner error">
        <span>保存失败:{session.error}</span>
        <button class="btn" onclick={() => (session!.error = null)}>知道了</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .editor-pane {
    position: relative;
    height: 100%;
    background: var(--panel);
  }

  .editor-host {
    height: 100%;
  }

  .source-pane {
    height: 100%;
    padding: 18px 24px;
    background: var(--panel);
  }

  .source-pane textarea {
    width: 100%;
    height: 100%;
    resize: none;
    border: none;
    outline: none;
    background: transparent;
    color: var(--ink);
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 13.5px;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .overlays {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(560px, 90%);
  }

  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 14px;
    border-radius: var(--r-card);
    background: var(--panel);
    border: 1px solid var(--line2);
    box-shadow: var(--shadow-md);
    font-size: 13px;
    color: var(--ink);
    animation: rd-pop var(--dur-move) var(--ease-out);
  }

  .banner.error {
    border-color: var(--acc);
    color: var(--acc);
  }
</style>
