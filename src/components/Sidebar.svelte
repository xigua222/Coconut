<script lang="ts">
  /**
   * 左侧文库侧栏:搜索(⌘K)、文档列表、底部新建/主题/设置。
   * 宽度 0↔218 动画;tab 增删带 flip/滑入退场动画。
   */
  import { flip } from "svelte/animate";
  import { fade, fly } from "svelte/transition";
  import { tabStore } from "../lib/tabs/tabStore.svelte";
  import { treeStore } from "../lib/files/treeStore.svelte";
  import { modKey } from "../lib/utils/platform";

  const SB_W = 218;
  /** 与全局 --ease-out 一致的出弹曲线(transition 参数需要函数) */
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  /** 根目录变化 → 重新扫描(首次/更换目录) */
  $effect(() => {
    const root = treeStore.root;
    if (root) void treeStore.refresh();
  });

  /** 根名(最后一段路径) */
  let rootName = $derived(
    treeStore.root ? (treeStore.root.split(/[/\\]/).filter(Boolean).at(-1) ?? treeStore.root) : "",
  );
</script>

<aside
  class="sidebar"
  class:hidden={!tabStore.sidebarVisible}
  style="width:{tabStore.sidebarVisible ? SB_W : 0}px"
  aria-hidden={!tabStore.sidebarVisible}
>
  <div class="inner" style="opacity:{tabStore.sidebarVisible ? 1 : 0}">
    <!-- 顶部留白:与 macOS 系统交通灯(红黄绿)对齐,同时是窗口拖拽区域 -->
    <div class="traffic-space"></div>

    <button class="search" onclick={() => (tabStore.searchOpen = true)}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
        <circle cx="11" cy="11" r="7"></circle>
        <line x1="20" y1="20" x2="16.2" y2="16.2"></line>
      </svg>
      <span class="grow">搜索</span>
      <span class="kbd">{modKey}K</span>
    </button>

    <div class="section-label">文库 / RECENT</div>
    <nav class="docs">
      {#each tabStore.tabs as tab (tab.id)}
        <button
          class="doc"
          class:active={tab.id === tabStore.activeId}
          onclick={() => tabStore.activate(tab.id)}
          title={tab.session.path ?? tab.session.title}
          in:fly={{ x: -10, duration: 280, easing: easeOut }}
          out:fade={{ duration: 160 }}
          animate:flip={{ duration: 280, easing: easeOut }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mut)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span class="meta">
            <span class="name">{tab.session.title}</span>
            <span class="sub">{tab.session.dirty ? "未保存" : "已保存"}</span>
          </span>
          <span class="dot" class:on={tab.id === tabStore.activeId}></span>
        </button>
      {/each}
      {#if tabStore.tabs.length === 0}
        <p class="empty">暂无文档</p>
      {/if}
    </nav>

    <!-- 文件列表面板:浏览所选目录的 Markdown 文件,Agent 增删自动刷新 -->
    <div class="section-label">目录 / FOLDER</div>
    <div class="folder-root">
      {#if treeStore.root}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="root-btn" onclick={() => void treeStore.pickRoot()} title={treeStore.root}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          </svg>
          <span class="grow root-name">{rootName}</span>
          <button
            class="mini-btn"
            title="重新扫描"
            onclick={(e) => {
              e.stopPropagation();
              void treeStore.refresh();
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        </div>
        <nav class="tree" class:loading={treeStore.loading}>
          {#each treeStore.visible as entry (entry.path)}
            {#if entry.is_dir}
              <button
                class="tree-item dir"
                style="padding-left:{10 + entry.depth * 12}px"
                onclick={() => treeStore.toggleDir(entry.path)}
                title={entry.path}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class:folded={!treeStore.expanded.has(entry.path)}
                >
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
                <span class="grow dir-name">{entry.name}</span>
              </button>
            {:else}
              <button
                class="tree-item file"
                style="padding-left:{10 + entry.depth * 12}px"
                onclick={() => treeStore.openFile(entry.path)}
                title={entry.path}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span class="grow file-name">{entry.name}</span>
              </button>
            {/if}
          {/each}
          {#if treeStore.entries.length === 0 && !treeStore.loading}
            <p class="empty">此目录没有 Markdown 文件</p>
          {/if}
        </nav>
      {:else}
        <button class="root-btn empty-root" onclick={() => void treeStore.pickRoot()}>          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          </svg>
          <span class="grow">选择目录…</span>
        </button>
      {/if}
    </div>

    <div class="grow"></div>

    <div class="footer">
      <button title="新建文档" onclick={() => tabStore.newTab()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <button title="设置" onclick={() => (tabStore.settingsOpen = true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round">
          <line x1="4" y1="7" x2="20" y2="7"></line>
          <circle cx="9" cy="7" r="2.2" fill="var(--panel)"></circle>
          <line x1="4" y1="17" x2="20" y2="17"></line>
          <circle cx="15" cy="17" r="2.2" fill="var(--panel)"></circle>
        </svg>
      </button>
    </div>
  </div>
</aside>

<style>
  .sidebar {
    flex: none;
    overflow: hidden;
    transition: width var(--dur-move) var(--ease-out);
  }

  /* 收起后禁用交互,避免隐形按钮被点中 */
  .sidebar.hidden {
    pointer-events: none;
  }

  .inner {
    width: 200px;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding: 2px 0;
    transition: opacity var(--dur-move) var(--ease-out);
  }

  /* macOS Overlay 交通灯区域:系统按钮位于窗口左上约 (13,13),高约 24px,
     这里留出等高的拖拽留白,避免内容与交通灯重叠 */
  .traffic-space {
    height: 34px;
    flex: none;
    -webkit-app-region: drag;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 12px;
    border-radius: calc(var(--r) * 0.62);
    border: 1px solid var(--line2);
    background: transparent;
    color: var(--mut);
    cursor: pointer;
    font-family: inherit;
    font-size: 12.5px;
    transition: border-color var(--dur-quick) ease, background-color var(--dur-quick) ease,
      transform var(--dur-quick) var(--ease-out);
  }

  .search:hover {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    transform: translateY(-1px);
  }

  .grow {
    flex: 1;
  }

  .kbd {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 9.5px;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 1px 5px;
  }

  .section-label {
    font-size: 10px;
    letter-spacing: 0.16em;
    color: var(--mut);
    font-weight: 800;
    padding: 22px 8px 8px;
  }

  .docs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
  }

  .doc {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: calc(var(--r) * 0.55);
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: background-color var(--dur-quick) var(--ease-out);
  }

  .doc:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }

  .doc.active {
    background: var(--soft);
  }

  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .name {
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub {
    font-size: 10px;
    color: var(--mut);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 99px;
    background: var(--acc);
    opacity: 0;
    transform: scale(0.4);
    transition: opacity var(--dur-quick) var(--ease-out), transform var(--dur-quick) var(--ease-spring);
    flex: none;
  }

  .dot.on {
    opacity: 1;
    transform: scale(1);
  }

  .empty {
    margin: 8px 12px;
    font-size: 11.5px;
    color: var(--mut);
  }

  /* ===== 文件列表面板(目录树) ===== */
  .folder-root {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .root-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 12px;
    border: none;
    border-radius: calc(var(--r) * 0.5);
    background: transparent;
    color: var(--mut);
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    text-align: left;
    transition: background-color var(--dur-quick) ease, color var(--dur-quick) ease;
  }

  .root-btn:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .root-btn .root-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mini-btn {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--mut);
    cursor: pointer;
    flex: none;
  }

  .mini-btn:hover {
    background: var(--soft);
    color: var(--ink);
  }

  .tree {
    overflow-y: auto;
    max-height: 40vh;
    opacity: 1;
    transition: opacity var(--dur-quick) ease;
  }

  .tree.loading {
    opacity: 0.55;
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 5px 10px;
    border: none;
    border-radius: calc(var(--r) * 0.45);
    background: transparent;
    color: var(--mut);
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    text-align: left;
    transition: background-color var(--dur-quick) ease, color var(--dur-quick) ease;
  }

  .tree-item:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .tree-item .dir-name,
  .tree-item .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tree-item.dir > svg {
    flex: none;
    transition: transform var(--dur-quick) var(--ease-out);
  }

  .tree-item.dir > svg.folded {
    transform: rotate(-90deg);
  }

  .tree-item.file {
    padding-top: 4px;
    padding-bottom: 4px;
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 2px 0;
    border-top: 2px solid var(--line2);
    margin: 0 4px;
    padding-top: 10px;
  }

  .footer button {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: calc(var(--r) * 0.55);
    background: transparent;
    color: var(--mut);
    cursor: pointer;
    transition: background-color var(--dur-quick) ease, color var(--dur-quick) ease,
      transform var(--dur-quick) var(--ease-out);
  }

  .footer button:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .footer button:active {
    transform: scale(0.88);
  }
</style>
