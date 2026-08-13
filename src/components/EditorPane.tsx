/**
 * 编辑器窗格:持有 Crepe 实例,随 activeTab 切换做 create/destroy。
 * 滚动/进度由外层 .content 容器负责(App 统一监听)。
 * 文档始终可编辑,无阅读/编辑模式之分。
 *
 * 关键约束(自 Svelte 版 1:1 复刻):
 * - Crepe 挂载到独立的 editor-host 子元素 —— 挂载/卸载会 innerHTML
 *   清空挂载点,绝不能碰 React 管理的节点(横幅);
 * - 挂载 effect 绝不能追踪 session 的响应式内容字段(md),否则每次输入
 *   回显都会重建编辑器(丢焦点/光标回顶/退格异常) —— React 里对应
 *   useEffect 依赖数组只放 session 身份 + mode,挂载期读取直接走字段。
 */
import { useEffect, useRef } from "react";
import { createEditor, type EditorHandle } from "../lib/editor/createEditor";
import type { DocumentSession } from "../lib/files/document";
import { tabStore } from "../lib/tabs/tabStore";
import { findUI } from "../lib/editor/plugins/findUI";
import { debounce } from "../lib/utils/debounce";
import { exportCurrentHtml, exportCurrentPdf } from "../lib/files/export";
import { openInVscode, showInFolder } from "../ipc/commands";
import { isMac, isWindows } from "../lib/utils/platform";
import { useStoreVersion } from "../lib/react/reactive";
import { ConflictBanner } from "./ConflictBanner";
import { NormalizeNotice } from "./NormalizeNotice";

export function EditorPane() {
  useStoreVersion(tabStore);
  const session = tabStore.activeTab?.session ?? null;
  useStoreVersion(session);

  const editorHostRef = useRef<HTMLDivElement | null>(null);
  /** 当前已绑定的会话(区别于渲染中的 session,供事件回调读最新值) */
  const boundSessionRef = useRef<DocumentSession | null>(null);
  const handleRef = useRef<EditorHandle | null>(null);
  /** 挂载令牌:异步创建期间 tab 切换则作废 */
  const mountTokenRef = useRef(0);

  // markdown 变化 → 刷新派生状态(400ms 防抖;
  // crepe 内部 markdownUpdated 本身已带 200ms 防抖)
  const onMdRef = useRef(
    debounce((s: DocumentSession, md: string) => {
      s.onContent(md);
    }, 400),
  );

  function teardown() {
    // 编辑器销毁(切 tab/重挂)时关闭文内搜索浮层
    findUI.set({ open: false });
    if (handleRef.current) {
      handleRef.current.destroy();
      handleRef.current = null;
    }
    if (boundSessionRef.current) {
      boundSessionRef.current.detachEditor();
      boundSessionRef.current = null;
    }
    if (editorHostRef.current) editorHostRef.current.innerHTML = "";
  }

  async function mountEditor(s: DocumentSession, token: number) {
    teardown();
    const host = editorHostRef.current;
    if (!host) return;
    boundSessionRef.current = s;
    host.innerHTML = "";
    const root = document.createElement("div");
    root.className = "crepe";
    host.appendChild(root);

    const h = await createEditor({
      root,
      initialValue: s.md,
      onMarkdownChange: (md) => onMdRef.current(s, md),
      onUserInput: () => s.markUserInput(),
      // 初始文档入树后的首次序列化 → 无损判定(与保存写盘口径一致)
      onInitialSerialized: (md) => s.setLosslessFromSerialized(md),
      // 本地图片显示:以文档所在目录为基准解析相对路径
      imageBaseDir: s.path ? s.path.replace(/[/\\][^/\\]+$/, "") : null,
    });
    if (token !== mountTokenRef.current) {
      h.destroy();
      return;
    }
    handleRef.current = h;
    s.attachEditor(h);
    s.enableUserInput();
  }

  // 挂载/销毁:只追踪 session 身份 + 编辑模式(切模式时重挂)。
  // 依赖数组里绝不出现 s.md 等响应式内容字段 —— 这就是 untrack 的等价物:
  // 输入回显只触发重渲染,不会重建编辑器。
  const mode = session?.mode ?? null;
  useEffect(() => {
    const token = ++mountTokenRef.current;
    const s = session;
    if (!s || s.mode === "source") {
      // 无会话 / 源码模式:销毁 Crepe,textarea 由下方 JSX 渲染
      teardown();
      return;
    }
    void mountEditor(s, token);
    return () => {
      // 清理:作废在途挂载 + 销毁已完成编辑器(下一次运行会重建)
      mountTokenRef.current++;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意不追踪会话内容字段
  }, [session, mode]);

  /** 右键上下文菜单:编辑器内弹出原生菜单(常用操作外放) */
  async function onContextMenu(e: React.MouseEvent): Promise<void> {
    const s = boundSessionRef.current;
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

  return (
    <div className="editor-pane" onContextMenu={(e) => void onContextMenu(e)}>
      {session?.mode === "source" ? (
        <div className="source-pane">
          <textarea
            spellCheck={false}
            value={session.sourceText}
            onChange={(e) => session.onSourceInput(e.currentTarget.value)}
            onKeyDown={(e) => {
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
          />
        </div>
      ) : (
        <div className="editor-host" ref={editorHostRef} />
      )}

      <div className="overlays">
        {session?.conflict && <ConflictBanner session={session} />}
        {session && !session.lossless && <NormalizeNotice session={session} />}
        {session?.error && (
          <div className="banner error">
            <span>保存失败:{session.error}</span>
            <button
              className="btn"
              onClick={() => {
                session.error = null;
                session.notify();
              }}>
              知道了
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
