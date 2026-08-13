/**
 * 应用骨架(coconut UI):侧栏文库 + 主面板(顶栏 / 内容 / 右目录)。
 * 全局键位:⌘K 搜索、⌘\ 侧栏、⌘S/W/O/N/,、esc 关闭浮层。
 * 内容滚动 → 阅读进度 + 目录联动。
 */
import { useEffect, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { EditorPane } from "./components/EditorPane";
import { StatusBar } from "./components/StatusBar";
import { TocPanel } from "./components/TocPanel";
import { WelcomePage } from "./components/WelcomePage";
import { SearchOverlay } from "./components/SearchOverlay";
import { FindBar } from "./components/FindBar";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { ConfirmModal } from "./components/ConfirmModal";
import { tabStore } from "./lib/tabs/tabStore";
import { findUI } from "./lib/editor/plugins/findUI";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { DragDropEvent } from "@tauri-apps/api/webview";
import type { Event } from "@tauri-apps/api/event";
import { extractOutline, slugify } from "./lib/outline/extractOutline";
import { useStoreVersion } from "./lib/react/reactive";
import { useHideOnScroll } from "./components/interior/hide-on-scroll";
import { ReadingProgress } from "./components/interior/reading-progress";
import { countStats } from "./lib/utils/count";

export function App() {
  useStoreVersion(tabStore);
  useStoreVersion(findUI);
  const session = tabStore.activeTab?.session ?? null;
  useStoreVersion(session);

  /** 内容滚动 → 顶栏隐藏/复现(hide-on-scroll)与阅读进度共用同一滚动容器 */
  const hideScroll = useHideOnScroll<HTMLDivElement>({});
  const contentRef = hideScroll.ref;
  const spyRaf = useRef(0);
  /** 关闭请求处理中标志:防止重复点击红按钮/⌘W 叠加挂起的确认链 */
  const closing = useRef(false);

  // 窗口标题跟随活动 tab
  const title = session?.title ?? "";
  const dirty = session?.dirty ?? false;
  const activeId = tabStore.activeId;
  useEffect(() => {
    const win = getCurrentWindow();
    void win.setTitle(session ? `${title}${dirty ? " •" : ""} — coconut` : "coconut");
  }, [title, dirty, activeId, session]);

  // 内容滚动:阅读进度 + 目录游标(raf 节流)
  function onContentScroll() {
    if (spyRaf.current) return;
    spyRaf.current = requestAnimationFrame(() => {
      spyRaf.current = 0;
      const sc = contentRef.current;
      if (!sc) return;
      const p = sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight);
      tabStore.progress = p;
      // spy:最后一个进入视野(<130px)的标题 → 目录游标
      const active = tabStore.activeTab?.session;
      if (!active) return;
      const items = extractOutline(active.md);
      const headings = Array.from(
        sc.querySelectorAll<HTMLElement>(
          ".ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6",
        ),
      );
      const slugToEl = new Map<string, HTMLElement>();
      for (const h of headings) {
        const s = slugify(h.textContent ?? "");
        if (s && !slugToEl.has(s)) slugToEl.set(s, h);
      }
      const scTop = sc.getBoundingClientRect().top;
      let idx = -1;
      items.forEach((item, i) => {
        const el = slugToEl.get(item.slug);
        if (el && el.getBoundingClientRect().top - scTop < 130) idx = i;
      });
      tabStore.activeToc = idx;
    });
  }

  /** ⌘F:打开/关闭当前文档的文内搜索 */
  function toggleFind() {
    const controller = tabStore.activeTab?.session.editor?.find;
    if (!controller) return;
    if (findUI.get().open) controller.close();
    else controller.open();
  }

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // CodeMirror 代码块内 ⌘F 交给代码块自身的搜索
      if ((e.target as HTMLElement | null)?.closest?.(".cm-editor")) return;
      if (e.metaKey || e.ctrlKey) {
        if (k === "k") {
          e.preventDefault();
          tabStore.searchOpen = !tabStore.searchOpen;
        } else if (k === "f") {
          e.preventDefault();
          toggleFind();
        } else if (e.key === "\\") {
          e.preventDefault();
          tabStore.sidebarVisible = !tabStore.sidebarVisible;
        } else if (k === "s") {
          e.preventDefault();
          if (e.shiftKey) void tabStore.saveAsActive();
          else void tabStore.saveActive();
        } else if (k === "w") {
          e.preventDefault();
          if (tabStore.activeId) void tabStore.close(tabStore.activeId);
        } else if (k === "o") {
          e.preventDefault();
          void tabStore.openFiles();
        } else if (k === "e") {
          e.preventDefault();
          tabStore.activeTab?.session.toggleMode();
        } else if (k === "n") {
          e.preventDefault();
          tabStore.newTab();
        } else if (k === ",") {
          e.preventDefault();
          tabStore.settingsOpen = true;
        }
      } else if (e.key === "Escape") {
        if (tabStore.searchOpen) tabStore.searchOpen = false;
        else if (findUI.get().open) findUI.set({ open: false });
        else if (tabStore.settingsOpen) tabStore.settingsOpen = false;
        else if (tabStore.pendingClose) tabStore.resolveConfirm("cancel");
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  // 拖放文件进窗口 → 打开
  function onDragDrop(event: Event<DragDropEvent>) {
    if (event.payload.type === "drop") {
      for (const path of event.payload.paths) {
        void tabStore.openPath(path);
      }
    }
  }

  useEffect(() => {
    const win = getCurrentWindow();
    const webview = getCurrentWebview();
    const unlistenClose = win.onCloseRequested(async (event) => {
      // 串行化:确认流程进行中忽略重复的关闭请求,
      // 否则每个请求都会再挂一个 await 确认的链,窗口永远关不掉
      if (closing.current) {
        event.preventDefault();
        return;
      }
      closing.current = true;
      try {
        const canClose = await tabStore.handleCloseRequest();
        if (!canClose) event.preventDefault();
      } finally {
        closing.current = false;
      }
    });
    const unlistenDrag = webview.onDragDropEvent(onDragDrop);
    return () => {
      void unlistenClose.then((u) => u());
      void unlistenDrag.then((u) => u());
    };
  }, []);

  return (
    <>
      <div className="app">
        <Sidebar />

        <div className="main-panel">
          <TopBar hidden={hideScroll.hidden} />
          <div className="main-body">
            <div className="content" ref={contentRef} onScroll={onContentScroll}>
              {session?.mode === "wysiwyg" && (
                <div className="reading-progress-wrap">
                  <ReadingProgress
                    scroller={contentRef}
                    words={countStats(session.md).words}
                    label="阅读进度"
                    doneLabel="已读完"
                  />
                </div>
              )}
              {session ? <EditorPane /> : <WelcomePage />}
              {findUI.get().open && <FindBar />}
            </div>
            <TocPanel />
          </div>
          {session && <StatusBar />}
        </div>
      </div>

      <SearchOverlay />
      <SettingsDrawer />
      <ConfirmModal />
    </>
  );
}
