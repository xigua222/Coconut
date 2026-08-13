<script lang="ts">
  /** 欢迎页:品牌印、打开/新建、最近打开卡片、拖放提示。 */
  import { onMount } from "svelte";
  import { tabStore } from "../lib/tabs/tabStore.svelte";
  import { list, clear } from "../lib/files/recent";
  import { basename } from "../lib/utils/platform";

  let recents: string[] = $state([]);

  onMount(() => {
    void list().then((r) => (recents = r));
  });
</script>

<div class="welcome">
  <div class="logo">墨</div>
  <h1>把 Markdown<br />读成一本书。</h1>
  <p class="sub">极简、圆角、丝滑。打开一份文档,或把文件拖进窗口。</p>

  <div class="actions">
    <button class="btn primary" onclick={() => void tabStore.openFiles()}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 4h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path>
      </svg>
      打开文件
    </button>
    <button class="btn" onclick={() => tabStore.newTab()}>新建文档</button>
  </div>

  {#if recents.length > 0}
    <div class="hr"></div>
    <div class="recent-label">
      最近打开
      <button class="clear" onclick={() => void clear().then(() => (recents = []))}>清空</button>
    </div>
    <div class="cards">
      {#each recents as path (path)}
        <button class="card" title={path} onclick={() => void tabStore.openPath(path)}>
          <span class="card-name">{basename(path)}</span>
          <span class="card-path">{path}</span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="drop-hint">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 8 12 3 17 8"></polyline>
      <line x1="12" y1="3" x2="12" y2="15"></line>
    </svg>
    <span>把 .md 文件拖到这里</span>
  </div>
</div>

<style>
  .welcome {
    max-width: 640px;
    margin: 0 auto;
    padding: 72px 48px 88px;
    animation: rd-pop 0.38s var(--ease-out) both;
  }

  .logo {
    width: 64px;
    height: 64px;
    border-radius: 20px;
    background: var(--acc);
    color: #fff;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 30px;
    margin-bottom: 26px;
    box-shadow: var(--shadow-md);
  }

  h1 {
    font-weight: 800;
    font-size: 34px;
    letter-spacing: -0.02em;
    line-height: 1.25;
    margin: 0 0 10px;
  }

  .sub {
    margin: 0 0 26px;
    font-size: 15px;
    line-height: 1.9;
    color: var(--mut);
  }

  .actions {
    display: flex;
    gap: 10px;
    margin-bottom: 44px;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: calc(var(--r) * 0.68);
    background: transparent;
    border: 1px solid var(--line2);
    color: var(--ink);
    font-weight: 800;
    font-size: 13.5px;
    cursor: pointer;
    transition: background-color var(--dur-quick) ease, transform var(--dur-quick) var(--ease-out);
  }

  .btn:hover {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    transform: translateY(-2px);
  }

  .btn.primary {
    background: var(--acc);
    border-color: transparent;
    color: #fff;
  }

  .btn.primary:hover {
    box-shadow: var(--shadow-md);
  }

  .hr {
    height: 2px;
    background: var(--line2);
    margin-bottom: 20px;
  }

  .recent-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    letter-spacing: 0.16em;
    color: var(--mut);
    font-weight: 800;
    margin-bottom: 12px;
  }

  .clear {
    font-size: 10.5px;
    color: var(--acc);
    letter-spacing: 0;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 28px;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    align-items: flex-start;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    background: var(--soft);
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    color: var(--ink);
    transition: transform 0.3s var(--ease-out), box-shadow 0.3s ease, background-color 0.3s ease;
  }

  .card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
  }

  .card-name {
    font-size: 12.5px;
    font-weight: 700;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-path {
    font-size: 10.5px;
    color: var(--mut);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drop-hint {
    border: 1.5px dashed var(--line2);
    border-radius: var(--r-card);
    padding: 18px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--mut);
  }

  .drop-hint span {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 11px;
  }
</style>
