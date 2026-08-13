<script lang="ts">
  /**
   * 文内搜索浮层(⌘F):非模态顶部浮条,输入即搜,Enter/Shift+Enter 上下,
   * Esc 关闭。匹配高亮由编辑器 find 插件渲染,这里只负责驱动。
   */
  import { tabStore } from "../lib/tabs/tabStore.svelte";
  import { findUI } from "../lib/editor/plugins/findUI.svelte";
  import { modKey } from "../lib/utils/platform";

  function controller() {
    return tabStore.activeTab?.session.editor?.find ?? null;
  }

  function onInput(e: Event) {
    const q = e.currentTarget as HTMLInputElement;
    findUI.query = q.value;
    controller()?.setQuery(q.value);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) controller()?.prev();
      else controller()?.next();
    }
  }

  function close() {
    controller()?.close();
  }

  let inputEl = $state<HTMLInputElement | null>(null);
  $effect(() => {
    if (findUI.open) {
      inputEl?.focus();
      inputEl?.select();
    }
  });
</script>

{#if findUI.open}
  <div class="findbar" role="search" aria-label="在文档中查找">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
      <circle cx="11" cy="11" r="7"></circle>
      <line x1="20" y1="20" x2="16.2" y2="16.2"></line>
    </svg>
    <input
      bind:this={inputEl}
      value={findUI.query}
      placeholder="在文档中查找…"
      oninput={onInput}
      onkeydown={onKeydown}
    />
    <span class="count" class:empty={findUI.count === 0}>
      {findUI.count > 0 ? `${findUI.current + 1} / ${findUI.count}` : "无结果"}
    </span>
    <button class="nav" title="上一个({modKey}+Shift+Enter)" onclick={() => controller()?.prev()}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="18 15 12 9 6 15"></polyline>
      </svg>
    </button>
    <button class="nav" title="下一个(Enter)" onclick={() => controller()?.next()}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>
    <button class="nav" title="关闭(Esc)" onclick={close}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
        <line x1="5" y1="5" x2="19" y2="19"></line>
        <line x1="19" y1="5" x2="5" y2="19"></line>
      </svg>
    </button>
  </div>
{/if}

<style>
  .findbar {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: calc(var(--r) * 0.7);
    border: 1px solid var(--line2);
    background: var(--panel);
    box-shadow: var(--shadow-md);
    color: var(--mut);
    animation: rd-pop var(--dur-quick) var(--ease-out);
  }

  input {
    width: 220px;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink);
  }

  input::placeholder {
    color: var(--mut);
  }

  .count {
    font-size: 11px;
    color: var(--mut);
    min-width: 52px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .count.empty {
    color: var(--acc);
  }

  .nav {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--mut);
    cursor: pointer;
    transition: background-color var(--dur-quick) ease, color var(--dur-quick) ease;
  }

  .nav:hover {
    background: var(--soft);
    color: var(--ink);
  }
</style>
