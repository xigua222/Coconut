/**
 * 应用骨架(coconut UI):侧栏(工作区 + 近期访问) + 主面板(顶栏 / 内容 / 右目录)。
 * 全局键位:⌘K 搜索、⌘\ 侧栏、⌘S/W/O/N/,、esc 关闭浮层。
 * 内容滚动 → 阅读进度 + 目录当前节。
 */
import { useEffect, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { EditorPane } from "./components/EditorPane";
import { StatusBar } from "./components/StatusBar";
import { TocPanel } from "./components/TocPanel";
import { WelcomePage } from "./components/WelcomePage";
import { RecentsPage } from "./components/RecentsPage";
import { SearchOverlay } from "./components/SearchOverlay";
import { FindBar } from "./components/FindBar";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { ConfirmModal } from "./components/ConfirmModal";
import { tabStore } from "./lib/tabs/tabStore";
import { settingsStore } from "./lib/settings/settingsStore";
import { findUI } from "./lib/editor/plugins/findUI";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { DragDropEvent } from "@tauri-apps/api/webview";
import type { Event } from "@tauri-apps/api/event";
import { useStoreVersion } from "./lib/react/reactive";
import { LiveActivity, useLiveActivity } from "./components/interior/live-activity";
import { agentActivity } from "./lib/files/agentActivity";
import { useT } from "./lib/i18n";
import { isMarkdownPath } from "./lib/files/paths";

export function App() {
  useStoreVersion(tabStore);
  useStoreVersion(findUI);
  useStoreVersion(settingsStore);
  const tab = tabStore.activeTab ?? null;
  const session = tab?.session ?? null;
  useStoreVersion(session);
  const t = useT();
  const sidebarVisible = settingsStore.settings.sidebarVisible;

  /** 内容滚动 → 阅读进度 + 目录当前节 */
  const contentRef = useRef<HTMLDivElement>(null);
  /** 关闭请求处理中标志:防止重复点击红按钮/⌘W 叠加挂起的确认链 */
  const closing = useRef(false);

  // 窗口标题跟随活动 tab
  const title = session?.title ?? (tab && !session ? t("recentOpened") : "");
  const dirty = session?.dirty ?? false;
  const activeId = tabStore.activeId;
  useEffect(() => {
    const win = getCurrentWindow();
    void win.setTitle(session ? `${title}${dirty ? " •" : ""} — coconut` : title ? `${title} — coconut` : "coconut");
  }, [title, dirty, activeId, session]);

  /**
   * 滚动锚定用的参照块:视口顶部那个顶层块 + 它距视口顶的距离。
   * WebKit 没有实现 scroll anchoring(只有 Chrome/Firefox 有),而正文里
   * 代码块会在进出视口时挂载/卸载 CodeMirror、图片解码后才占位,这些"上方
   * 内容突然变高变矮"的事件会把读者当前看的位置直接顶跑。
   */
  const anchor = useRef<{ el: HTMLElement; top: number } | null>(null);

  function captureAnchor(sc: HTMLElement) {
    const pm = sc.querySelector<HTMLElement>(".ProseMirror");
    const blocks = pm?.children as HTMLCollectionOf<HTMLElement> | undefined;
    if (!blocks?.length) {
      anchor.current = null;
      return;
    }
    // 二分找"第一个还没滚出视口顶部的块":长文档也只读 log n 次布局
    const top = sc.getBoundingClientRect().top;
    let lo = 0;
    let hi = blocks.length - 1;
    let found: HTMLElement | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const el = blocks[mid];
      if (el.getBoundingClientRect().bottom > top + 4) {
        found = el;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    anchor.current = found ? { el: found, top: found.getBoundingClientRect().top - top } : null;
  }

  /** 滚动测量帧节流:scroll 事件可能高于帧率,而每次测量都要读一批元素的
   *  rect(强制同步布局)并触发全树重渲染。用时间戳而不是"已排帧"标志:
   *  标志一旦因丢帧卡住,阅读进度就永久失灵。 */
  const lastMeasure = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onContentScroll() {
    const now = performance.now();
    if (trailing.current) clearTimeout(trailing.current);
    if (now - lastMeasure.current >= 16) {
      lastMeasure.current = now;
      measureScroll();
      return;
    }
    // 补一次收尾测量,保证停下时进度/目录/锚点停在最终位置
    trailing.current = setTimeout(() => {
      trailing.current = null;
      lastMeasure.current = performance.now();
      measureScroll();
    }, 16);
  }

  function measureScroll() {
    const sc = contentRef.current;
    if (!sc) return;
    captureAnchor(sc);
    const travel = sc.scrollHeight - sc.clientHeight;
    tabStore.progress = travel <= 0 ? 1 : sc.scrollTop / travel;

    const heads = sc.querySelectorAll<HTMLElement>(
      ".ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6",
    );
    if (!heads.length) {
      tabStore.activeToc = -1;
      return;
    }
    const probe = sc.getBoundingClientRect().top + 88;
    let idx = 0;
    for (let i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top <= probe + 1) idx = i;
    }
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 12) {
      idx = heads.length - 1;
    }
    tabStore.activeToc = idx;
  }

  /** ⌘F:打开/关闭当前文档的文内搜索 */
  function toggleFind() {
    const controller = tabStore.activeTab?.session?.editor?.find;
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
          settingsStore.update("sidebarVisible", !settingsStore.settings.sidebarVisible);
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
          tabStore.activeTab?.session?.toggleMode();
        } else if (k === "n") {
          e.preventDefault();
          void tabStore.newTab();
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

  // 拖放文件进窗口 → 打开 Markdown(忽略目录与其它类型)
  function onDragDrop(event: Event<DragDropEvent>) {
    if (event.payload.type !== "drop") return;
    for (const path of event.payload.paths) {
      if (isMarkdownPath(path)) void tabStore.openPath(path);
    }
  }

  useEffect(() => {
    const win = getCurrentWindow();
    const webview = getCurrentWebview();
    const unlistenClose = win.onCloseRequested(async (event) => {
      // Tauri 在 handler 结束后若未 preventDefault 会调 destroy()。
      // 未保存确认期间先拦住,确认通过后显式 destroy,避免缺权限时红灯点了没反应。
      event.preventDefault();
      if (closing.current) return;
      closing.current = true;
      try {
        if (await tabStore.handleCloseRequest()) {
          await win.destroy();
        }
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

  useEffect(() => {
    if (!session || session.mode !== "wysiwyg") return;
    const id = requestAnimationFrame(() => onContentScroll());
    return () => cancelAnimationFrame(id);
  }, [session?.path, session?.mode, tabStore.activeId]);

  // 自建 scroll anchoring:正文高度一变就把锚点块按回原来的屏幕位置。
  // 浏览器自带锚定时(Chrome/Firefox)它已经补过了,这里算出的偏差是 0,
  // 不会重复补偿。
  useEffect(() => {
    const sc = contentRef.current;
    const body = sc?.firstElementChild;
    if (!sc || !body || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const a = anchor.current;
      if (!a || !a.el.isConnected || sc.scrollTop <= 0) return;
      const drift = a.el.getBoundingClientRect().top - sc.getBoundingClientRect().top - a.top;
      if (Math.abs(drift) >= 1) sc.scrollTop += drift;
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [session]);

  return (
    <>
      <div className={sidebarVisible ? "app" : "app sidebar-collapsed"}>
        <div className="app-shell">
          <Sidebar />

          <div className="main-panel">
            <TopBar />
            <AgentLive />
            <div className="main-body">
              <div className="content" ref={contentRef} onScroll={onContentScroll}>
                {!tab ? <WelcomePage /> : session ? <EditorPane /> : <RecentsPage />}
                {findUI.get().open && <FindBar />}
              </div>
              <TocPanel />
            </div>
            {session && <StatusBar />}
          </div>
        </div>
      </div>

      <SearchOverlay />
      <SettingsDrawer />
      <ConfirmModal />
    </>
  );
}

/** Agent 写入指示:interior LiveActivity(紧凑药丸,悬停展开) */
function AgentLive() {
  useStoreVersion(agentActivity);
  const t = useT();
  const { activity, start, succeed, dismiss } = useLiveActivity({ linger: 4000 });
  const state = agentActivity.get().state;
  const prev = useRef(state);

  useEffect(() => {
    if (state === "writing" && prev.current !== "writing") {
      start({ title: t("agentWriting"), detail: t("agentWritingDetail") });
    } else if (state === "done" && prev.current === "writing") {
      succeed({ title: t("agentDone"), detail: t("agentDoneDetail") });
    }
    prev.current = state;
  }, [state, start, succeed]);

  return (
    <div className="agent-live">
      <LiveActivity
        activity={activity}
        onDismiss={dismiss}
        width={260}
        label={t("agentActivity")}
        dismissLabel={t("close")}
      />
    </div>
  );
}
