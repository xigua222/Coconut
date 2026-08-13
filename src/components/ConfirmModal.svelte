<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { tabStore } from "../lib/tabs/tabStore.svelte";

  let session = $derived(tabStore.pendingClose);
  /** 与全局 --ease-out 一致的出弹曲线 */
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
</script>

{#if session}
  <div
    class="mask"
    role="dialog"
    aria-modal="true"
    aria-label="未保存的修改"
    transition:fade={{ duration: 200 }}
  >
    <div class="dialog" transition:scale={{ start: 0.96, duration: 260, easing: easeOut }}>
      <h2>「{session.title}」有未保存的修改</h2>
      <p class="sub">关闭前是否保存?</p>
      <div class="actions">
        <button class="btn primary" onclick={() => tabStore.resolveConfirm("save")}>保存</button>
        <button class="btn" onclick={() => tabStore.resolveConfirm("discard")}>不保存</button>
        <button class="btn" onclick={() => tabStore.resolveConfirm("cancel")}>取消</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .mask {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
  }

  .dialog {
    width: 360px;
    padding: 20px 24px;
    border-radius: var(--r-card);
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-lg);
    color: var(--ink);
  }

  h2 {
    margin: 0 0 6px;
    font-size: 15px;
  }

  .sub {
    margin: 0;
    color: var(--mut);
    font-size: 13px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
</style>
