<script lang="ts">
  import type { DocumentSession } from "../lib/files/document.svelte";
  import { settingsStore } from "../lib/settings/settingsStore.svelte";

  let { session }: { session: DocumentSession } = $props();
</script>

{#if !settingsStore.settings.hideRoundtripNotice && !session.lossless}
  <div class="banner normalize">
    <span class="text">此文件含保存时会被规范化的写法(渲染效果不变,仅源码排版统一)</span>
    <span class="actions">
      <button class="btn" onclick={() => settingsStore.update("hideRoundtripNotice", true)}>不再提醒</button>
    </span>
  </div>
{/if}

<style>
  .banner.normalize {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 14px;
    border-radius: var(--r-card);
    background: var(--panel);
    border: 1px solid var(--line2);
    box-shadow: var(--shadow-md);
    font-size: 12.5px;
    color: var(--mut);
    animation: rd-pop var(--dur-move) var(--ease-out);
  }

  .actions {
    display: flex;
    gap: 8px;
  }
</style>
