<script lang="ts">
  /**
   * 设置抽屉(右侧滑入):正文字体、字号、行宽、显示大纲。
   */
  import { fade } from "svelte/transition";
  import { settingsStore } from "../lib/settings/settingsStore.svelte";
  import type { MeasureLevel, SizeLevel } from "../lib/settings/defaults";
  import { exportCurrentHtml } from "../lib/files/export";
  import { tabStore } from "../lib/tabs/tabStore.svelte";

  function seg(label: string, cur: boolean, go: () => void) {
    return { label, cur, go };
  }

  let fontSeg = $derived([
    seg("无衬线", !settingsStore.settings.serif, () => settingsStore.update("serif", false)),
    seg("衬线", settingsStore.settings.serif, () => settingsStore.update("serif", true)),
  ]);

  let sizeSeg = $derived([
    seg("小", settingsStore.settings.sizeLevel === "s", () => settingsStore.update("sizeLevel", "s" as SizeLevel)),
    seg("标准", settingsStore.settings.sizeLevel === "m", () => settingsStore.update("sizeLevel", "m" as SizeLevel)),
    seg("大", settingsStore.settings.sizeLevel === "l", () => settingsStore.update("sizeLevel", "l" as SizeLevel)),
  ]);

  let measureSeg = $derived([
    seg("窄", settingsStore.settings.measureLevel === "n", () => settingsStore.update("measureLevel", "n" as MeasureLevel)),
    seg("适中", settingsStore.settings.measureLevel === "m", () => settingsStore.update("measureLevel", "m" as MeasureLevel)),
    seg("宽", settingsStore.settings.measureLevel === "w", () => settingsStore.update("measureLevel", "w" as MeasureLevel)),
  ]);

  async function exportCurrent() {
    const session = tabStore.activeTab?.session;
    if (!session) return;
    try {
      await exportCurrentHtml(session);
    } catch (e) {
      console.error("export failed", e);
    }
  }
</script>

{#if tabStore.settingsOpen}
  <!-- 遮罩点击关闭为标准桌面交互 -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="backdrop"
    transition:fade={{ duration: 220 }}
    onclick={() => (tabStore.settingsOpen = false)}
  ></div>
{/if}
<aside class="drawer" class:open={tabStore.settingsOpen} aria-hidden={!tabStore.settingsOpen}>
  <div class="head">
    <span class="title">设置</span>
    <button class="close" onclick={() => (tabStore.settingsOpen = false)} aria-label="关闭设置">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
        <line x1="5" y1="5" x2="19" y2="19"></line>
        <line x1="19" y1="5" x2="5" y2="19"></line>
      </svg>
    </button>
  </div>

  <div class="group">
    <span class="group-label">正文字体</span>
    <div class="seg">
      {#each fontSeg as o (o.label)}
        <button class:on={o.cur} onclick={o.go}>{o.label}</button>
      {/each}
    </div>
  </div>

  <div class="group">
    <span class="group-label">字号</span>
    <div class="seg">
      {#each sizeSeg as o (o.label)}
        <button class:on={o.cur} onclick={o.go}>{o.label}</button>
      {/each}
    </div>
  </div>

  <div class="group">
    <span class="group-label">行宽</span>
    <div class="seg">
      {#each measureSeg as o (o.label)}
        <button class:on={o.cur} onclick={o.go}>{o.label}</button>
      {/each}
    </div>
  </div>

  <div class="group">
    <span class="group-label">显示大纲</span>
    <button
      class="switch"
      class:on={settingsStore.settings.outlineVisible}
      onclick={() => settingsStore.update("outlineVisible", !settingsStore.settings.outlineVisible)}
      aria-label="显示大纲"
    >
      <span class="knob"></span>
    </button>
  </div>

  <div class="group">
    <span class="group-label">导出</span>
    <button class="export-btn" onclick={() => void exportCurrent()}>导出当前为 HTML…</button>
  </div>

  <div class="grow"></div>

  <div class="foot">
    <span>coconut 0.2.0</span>
  </div>
</aside>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: color-mix(in srgb, var(--ink) 8%, transparent);
  }

  .drawer {
    position: fixed;
    top: 16px;
    bottom: 16px;
    right: 16px;
    width: 296px;
    z-index: 50;
    box-sizing: border-box;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--r);
    box-shadow: var(--shadow-lg);
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    overflow-y: auto;
    overscroll-behavior: contain;
    transform: translateX(112%);
    transition: transform var(--dur-move) var(--ease-out), background-color var(--dur-theme) ease;
  }

  .drawer.open {
    transform: translateX(0);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    font-weight: 800;
    font-size: 16px;
  }

  .close {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: calc(var(--r) * 0.55);
    background: transparent;
    color: var(--mut);
    cursor: pointer;
    transition: background-color var(--dur-quick) ease, color var(--dur-quick) ease;
  }

  .close:hover {
    background: var(--soft);
    color: var(--ink);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .group-label {
    font-size: 10px;
    letter-spacing: 0.16em;
    color: var(--mut);
    font-weight: 800;
  }

  .seg {
    display: flex;
    background: var(--soft);
    border-radius: 99px;
    padding: 3px;
    gap: 2px;
  }

  .seg button {
    flex: 1;
    padding: 6px 10px;
    border: none;
    border-radius: 99px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    background: transparent;
    color: var(--mut);
    cursor: pointer;
    transition: background-color var(--dur-quick) var(--ease-out), color var(--dur-quick) var(--ease-out),
      transform var(--dur-quick) var(--ease-out);
  }

  .seg button:active {
    transform: scale(0.95);
  }

  .seg button.on {
    background: var(--ink);
    color: var(--panel);
  }

  .switch {
    width: 40px;
    height: 24px;
    border: none;
    border-radius: 99px;
    background: color-mix(in srgb, var(--mut) 40%, transparent);
    cursor: pointer;
    position: relative;
    padding: 0;
    transition: background-color var(--dur-quick) var(--ease-out);
  }

  .switch.on {
    background: var(--acc);
  }

  .knob {
    position: absolute;
    top: 3px;
    left: 0;
    width: 18px;
    height: 18px;
    border-radius: 99px;
    background: #fff;
    box-shadow: var(--shadow-sm);
    transform: translateX(3px);
    /* 微小回弹(spring)让开关有"拨动"手感 */
    transition: transform 0.32s var(--ease-spring);
  }

  .switch.on .knob {
    transform: translateX(19px);
  }

  .export-btn {
    padding: 8px 12px;
    border: 1px solid var(--line2);
    border-radius: calc(var(--r) * 0.55);
    background: transparent;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: background-color var(--dur-quick) ease, transform var(--dur-quick) var(--ease-out);
  }

  .export-btn:hover {
    background: var(--soft);
  }

  .export-btn:active {
    transform: scale(0.98);
  }

  .grow {
    flex: 1;
  }

  .foot {
    border-top: 2px solid var(--line2);
    padding-top: 12px;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--mut);
  }
</style>
