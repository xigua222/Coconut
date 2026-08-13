<script lang="ts">
  /**
   * 右侧目录面板:标题列表 + 红色游标(随滚动联动)。
   * 宽度 0↔232 动画,随大纲开关显隐。
   */
  import { tabStore } from "../lib/tabs/tabStore.svelte";
  import { extractOutline } from "../lib/outline/extractOutline";
  import { settingsStore } from "../lib/settings/settingsStore.svelte";

  const TOC_W = 232;

  let items = $derived(tabStore.activeTab ? extractOutline(tabStore.activeTab.session.md) : []);
  let show = $derived(!!tabStore.activeTab && settingsStore.settings.outlineVisible);
  // 游标 top 相对 nav 内容区:行高 32、游标高 18,故 (32-18)/2=7 居中。
  // 游标置于 <nav> 内部,随列表滚动且不依赖"目录"标签高度,杜绝魔数漂移。
  let barY = $derived(7 + Math.max(0, tabStore.activeToc) * 32);
</script>

<aside class="toc" class:hidden={!show} style="width:{show ? TOC_W : 0}px" aria-hidden={!show}>
  <div class="inner" style="opacity:{show ? 1 : 0}">
    <div class="label">目录</div>
    <nav>
      <div class="bar" style="top:{barY}px;opacity:{tabStore.activeToc >= 0 && items.length ? 1 : 0}"></div>
      {#each items as item, i (item.line)}
        <button
          class:active={i === tabStore.activeToc}
          style="padding-left:{14 + Math.max(0, item.level - 2) * 10}px"
          onclick={() => tabStore.scrollToActive(item.slug)}
        >
          {item.text}
        </button>
      {/each}
      {#if items.length === 0}
        <p class="empty">无标题</p>
      {/if}
    </nav>
  </div>
</aside>

<style>
  .toc {
    flex: none;
    overflow: hidden;
    border-left: 1px solid var(--line);
    transition: width var(--dur-move) var(--ease-out);
  }

  /* 收起后禁用交互,避免隐形按钮被点中 */
  .toc.hidden {
    pointer-events: none;
  }

  .inner {
    width: 232px;
    box-sizing: border-box;
    padding: 30px 18px;
    position: relative;
    height: 100%;
    transition: opacity var(--dur-move) var(--ease-out);
  }

  .label {
    height: 13px;
    font-size: 10px;
    letter-spacing: 0.16em;
    color: var(--mut);
    font-weight: 800;
    margin: 0 0 12px;
    line-height: 13px;
  }

  .bar {
    position: absolute;
    left: 0;
    width: 2.5px;
    height: 18px;
    border-radius: 2px;
    background: var(--acc);
    transition: top 0.3s var(--ease-out), opacity 0.25s ease;
  }

  nav {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    max-height: calc(100% - 50px);
  }

  nav button {
    display: flex;
    align-items: center;
    height: 32px;
    padding: 0 10px 0 14px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    font-size: 12.5px;
    text-align: left;
    color: var(--mut);
    font-weight: 400;
    transition: color 0.3s ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  nav button:hover {
    color: var(--ink);
  }

  nav button.active {
    color: var(--ink);
    font-weight: 700;
  }

  .empty {
    margin: 4px 14px;
    font-size: 11.5px;
    color: var(--mut);
  }
</style>
