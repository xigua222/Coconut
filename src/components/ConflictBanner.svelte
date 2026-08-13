<script lang="ts">
  import type { DocumentSession } from "../lib/files/document.svelte";

  let { session }: { session: DocumentSession } = $props();
</script>

<div class="banner conflict">
  <span class="text">⚠️ 文件已被外部修改</span>
  <span class="actions">
    <button class="btn" onclick={() => void session.reloadFromDisk()}>重新加载</button>
    <button class="btn primary" onclick={() => void session.keepLocal()}>保留当前版本(覆盖)</button>
  </span>
</div>

<style>
  .banner.conflict {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 14px;
    border-radius: var(--r-card);
    background: var(--panel);
    border: 1px solid var(--acc);
    box-shadow: var(--shadow-md);
    font-size: 13px;
    animation: rd-pop var(--dur-move) var(--ease-out);
  }

  .text {
    color: var(--acc);
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: 8px;
  }
</style>
