<script lang="ts">
  /**
   * 顶栏:窗口拖拽区 + 文档标题 + 常用操作按钮(源码模式/导出/在访达中显示)
   * + Agent 活动指示器。功能外放:高频操作不再只藏在菜单里。
   */
  import { tabStore } from "../lib/tabs/tabStore.svelte";
  import { agentActivity } from "../lib/files/agentActivity.svelte";
  import { exportCurrentHtml, exportCurrentPdf } from "../lib/files/export";
  import { showInFolder } from "../ipc/commands";
  import { isMac, isWindows } from "../lib/utils/platform";

  /** "在文件夹中显示"平台化文案 */
  let showInFolderLabel = $derived(isMac ? "在访达中显示" : isWindows ? "在资源管理器中显示" : "在文件管理器中显示");

  let title = $derived(tabStore.activeTab?.session.title ?? "");
  let session = $derived(tabStore.activeTab?.session ?? null);
  let exportOpen = $state(false);

  // done 状态数秒后回落 idle
  $effect(() => {
    if (agentActivity.state !== "done") return;
    const timer = setTimeout(() => {
      if (agentActivity.state === "done") agentActivity.state = "idle";
    }, 4000);
    return () => clearTimeout(timer);
  });

  // 点击外部关闭导出菜单
  $effect(() => {
    if (!exportOpen) return;
    const close = () => (exportOpen = false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  });
</script>

<header class="topbar">
  <span class="title" class:dim={!title}>{title || "coconut"}</span>

  {#if session}
    <div class="actions" role="toolbar" aria-label="常用操作">
      <button
        class="act"
        class:on={session.mode === "source"}
        title="源码模式 (⌘E)"
        onclick={() => session.toggleMode()}
        aria-label="源码模式"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      </button>

      <div class="export-wrap">
        <button
          class="act"
          class:on={exportOpen}
          title="导出"
          aria-label="导出"
          onclick={(e) => {
            e.stopPropagation();
            exportOpen = !exportOpen;
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
        {#if exportOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="export-pop" role="menu" aria-label="导出菜单" tabindex="-1" onclick={(e) => e.stopPropagation()}>
            <button role="menuitem" onclick={() => { exportOpen = false; void exportCurrentHtml(session); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
              <span>导出 HTML…</span>
            </button>
            <button role="menuitem" onclick={() => { exportOpen = false; void exportCurrentPdf(session); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2"></path>
                <path d="M6 12v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8"></path>
              </svg>
              <span>导出 PDF…</span>
            </button>
          </div>
        {/if}
      </div>

      {#if session.path}
        <button
          class="act"
          title={showInFolderLabel}
          aria-label={showInFolderLabel}
          onclick={() => void showInFolder(session.path!)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          </svg>
        </button>
      {/if}

      <span
        class="agent-dot"
        class:writing={agentActivity.state === "writing"}
        class:done={agentActivity.state === "done"}
        title={
          agentActivity.state === "writing"
            ? "Agent 正在写入…"
            : agentActivity.state === "done"
              ? "Agent 已完成写入"
              : ""
        }
      ></span>
    </div>
  {/if}
</header>

<style>
  .topbar {
    height: 38px;
    flex: none;
    display: grid;
    place-items: center;
    -webkit-app-region: drag;
    position: relative;
  }

  .title {
    max-width: 60%;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--mut);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color var(--dur-theme) ease;
  }

  .title.dim {
    opacity: 0.6;
  }

  .actions {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 2px;
    -webkit-app-region: no-drag;
  }

  .act {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--mut);
    cursor: pointer;
    transition: background-color var(--dur-quick) ease, color var(--dur-quick) ease;
  }

  .act:hover {
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    color: var(--ink);
  }

  .act.on {
    background: var(--acc-soft);
    color: var(--acc);
  }

  .export-wrap {
    position: relative;
  }

  .export-pop {
    position: absolute;
    top: 32px;
    right: 0;
    z-index: 80;
    min-width: 148px;
    padding: 5px;
    background: var(--panel);
    border: 1px solid var(--line2);
    border-radius: calc(var(--r) * 0.65);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 1px;
    animation: rd-pop var(--dur-quick) var(--ease-out);
  }

  .export-pop button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    font-family: inherit;
    font-size: 12.5px;
    text-align: left;
    transition: background-color var(--dur-quick) ease;
  }

  .export-pop button:hover {
    background: var(--soft);
  }

  .agent-dot {
    width: 8px;
    height: 8px;
    border-radius: 99px;
    background: transparent;
    margin-left: 6px;
    transition: background-color var(--dur-quick) ease, box-shadow var(--dur-quick) ease;
  }

  .agent-dot.writing {
    background: #f5a623;
    animation: agent-pulse 1.1s ease-in-out infinite;
  }

  .agent-dot.done {
    background: #4cd07d;
    box-shadow: 0 0 0 3px color-mix(in srgb, #4cd07d 25%, transparent);
  }

  @keyframes agent-pulse {
    0%,
    100% {
      opacity: 1;
      box-shadow: 0 0 0 0 color-mix(in srgb, #f5a623 40%, transparent);
    }
    50% {
      opacity: 0.55;
      box-shadow: 0 0 0 5px transparent;
    }
  }
</style>
