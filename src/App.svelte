<script lang="ts">
  /**
   * 应用骨架(coconut UI):侧栏文库 + 主面板(顶栏 / 内容 / 右目录)。
   * 全局键位:⌘K 搜索、⌘\ 侧栏、⌘S/W/O/N/,、esc 关闭浮层。
   * 内容滚动 → 阅读进度 + 目录联动。
   */
  import { onMount } from "svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import TopBar from "./components/TopBar.svelte";
  import EditorPane from "./components/EditorPane.svelte";
  import StatusBar from "./components/StatusBar.svelte";
  import TocPanel from "./components/TocPanel.svelte";
  import WelcomePage from "./components/WelcomePage.svelte";
  import SearchOverlay from "./components/SearchOverlay.svelte";
  import FindBar from "./components/FindBar.svelte";
  import SettingsDrawer from "./components/SettingsDrawer.svelte";
  import ConfirmModal from "./components/ConfirmModal.svelte";
  import { tabStore } from "./lib/tabs/tabStore.svelte";
  import { findUI } from "./lib/editor/plugins/findUI.svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import type { DragDropEvent } from "@tauri-apps/api/webview";
  import type { Event } from "@tauri-apps/api/event";
  import { extractOutline, slugify } from "./lib/outline/extractOutline";

  let contentEl: HTMLDivElement;
  let spyRaf = 0;
  /** 关闭请求处理中标志:防止重复点击红按钮/⌘W 叠加挂起的确认链 */
  let closing = false;

  const win = getCurrentWindow();
  const webview = getCurrentWebview();

  // 窗口标题跟随活动 tab
  $effect(() => {
    const tab = tabStore.activeTab;
    void win.setTitle(tab ? `${tab.session.title}${tab.session.dirty ? " •" : ""} — coconut` : "coconut");
  });

  // 内容滚动:阅读进度 + 目录游标(raf 节流)
  function onContentScroll() {
    if (spyRaf) return;
    spyRaf = requestAnimationFrame(() => {
      spyRaf = 0;
      const sc = contentEl;
      if (!sc) return;
      const p = sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight);
      tabStore.progress = p;
      // spy:最后一个进入视野(<130px)的标题 → 目录游标
      const session = tabStore.activeTab?.session;
      if (!session) return;
      const items = extractOutline(session.md);
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

  function onKeydown(e: KeyboardEvent) {
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
      else if (findUI.open) findUI.open = false;
      else if (tabStore.settingsOpen) tabStore.settingsOpen = false;
      else if (tabStore.pendingClose) tabStore.resolveConfirm("cancel");
    }
  }

  /** ⌘F:打开/关闭当前文档的文内搜索 */
  function toggleFind() {
    const controller = tabStore.activeTab?.session.editor?.find;
    if (!controller) return;
    if (findUI.open) controller.close();
    else controller.open();
  }

  // 拖放文件进窗口 → 打开
  function onDragDrop(event: Event<DragDropEvent>) {
    if (event.payload.type === "drop") {
      for (const path of event.payload.paths) {
        void tabStore.openPath(path);
      }
    }
  }

  onMount(() => {
    const unlistenClose = win.onCloseRequested(async (event) => {
      // 串行化:确认流程进行中忽略重复的关闭请求,
      // 否则每个请求都会再挂一个 await 确认的链,窗口永远关不掉
      if (closing) {
        event.preventDefault();
        return;
      }
      closing = true;
      try {
        const canClose = await tabStore.handleCloseRequest();
        if (!canClose) event.preventDefault();
      } finally {
        closing = false;
      }
    });
    const unlistenDrag = webview.onDragDropEvent(onDragDrop);
    return () => {
      void unlistenClose.then((u) => u());
      void unlistenDrag.then((u) => u());
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <Sidebar />

  <div class="main-panel">
    <TopBar />
    <div class="main-body">
      <div class="content" bind:this={contentEl} onscroll={onContentScroll}>
        {#if tabStore.activeTab}
          <EditorPane />
        {:else}
          <WelcomePage />
        {/if}
        {#if findUI.open}
          <FindBar />
        {/if}
      </div>
      <TocPanel />
    </div>
    {#if tabStore.activeTab}
      <StatusBar />
    {/if}
  </div>
</div>

{#if tabStore.searchOpen}
  <SearchOverlay />
{/if}
{#if tabStore.settingsOpen}
  <SettingsDrawer />
{/if}
{#if tabStore.pendingClose}
  <ConfirmModal />
{/if}

<style>
  .content {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    position: relative;
    background: var(--panel);
    transition: background-color var(--dur-theme) ease;
  }
</style>
