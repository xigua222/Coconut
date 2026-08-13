<script lang="ts">
  /**
   * 搜索浮层(⌘K):只检索文档级结果——历史文档(recent.json)+ 当前打开的 tab,
   * 不检索文档内的大纲/层级。
   *
   * 动效(motion vanilla):面板弹簧入场 + 激活行滑动高亮条(FLIP,仅 transform);
   * 键盘/鼠标共用同一高亮目标,motion 原生接管打断;prefersReducedMotion 时直接落位。
   */
  import { animate, prefersReducedMotion } from "motion";
  import { fade, scale } from "svelte/transition";
  import { onDestroy, onMount } from "svelte";
  import { tabStore } from "../lib/tabs/tabStore.svelte";
  import { list as listRecent } from "../lib/files/recent";
  import { basename, modKey } from "../lib/utils/platform";

  /** motion 13 中 prefersReducedMotion 是状态对象,null 视为未开启 */
  const reduced = prefersReducedMotion.current === true;
  /** 与全局 --ease-out 一致的出弹曲线(退出动画用) */
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  /** 退出动画:淡出 + 微缩合一(Svelte 每个元素只允许单个 out:) */
  function outBox(node: HTMLElement, { duration }: { duration: number }) {
    return {
      duration,
      easing: easeOut,
      css: (t: number) => `opacity: ${t}; transform: scale(${0.97 + 0.03 * t});`,
    };
  }

  interface Hit {
    title: string;
    sub: string;
    go: () => void;
  }

  let q = $state("");
  let activeHit = $state(0);
  /** 历史文档路径列表(最近打开) */
  let recents: string[] = $state([]);

  let boxEl: HTMLDivElement;
  /** 条件渲染(#if hits.length)内的绑定须用 $state,否则重建时效果不会重跑 */
  let hlEl = $state<HTMLDivElement>();
  let rowEls: (HTMLButtonElement | undefined)[] = [];
  let entrance: ReturnType<typeof animate> | undefined;

  onMount(() => {
    void listRecent().then((r) => (recents = r));
    inputEl?.focus();
    // 面板入场:弹簧缩放 + 上浮,完成即清掉内联 transform,退出交给 Svelte out:
    if (!reduced && boxEl) {
      entrance = animate(
        boxEl,
        { opacity: [0, 1], scale: [0.96, 1], y: [14, 0] },
        { type: "spring", stiffness: 400, damping: 34, mass: 0.9, restDelta: 0.001 },
      );
      void entrance.finished
        .then(() => {
          if (boxEl) {
            boxEl.style.transform = "";
            boxEl.style.opacity = "";
          }
        })
        .catch(() => {});
    }
  });

  onDestroy(() => entrance?.stop());

  let hits = $derived.by((): Hit[] => {
    const query = q.trim().toLowerCase();
    const out: Hit[] = [];
    const seen = new Set<string>();
    // 当前打开的 tab 优先(已打开 → 切换),随后补历史文档(未打开 → 打开)
    for (const tab of tabStore.tabs) {
      const name = tab.session.title;
      const path = tab.session.path ?? "";
      if (path) seen.add(path);
      if (!query || name.toLowerCase().includes(query) || path.toLowerCase().includes(query)) {
        out.push({
          title: name,
          sub: path ? path : "未命名文档",
          go: () => tabStore.activate(tab.id),
        });
      }
    }
    for (const path of recents) {
      if (seen.has(path)) continue;
      seen.add(path);
      const name = basename(path);
      if (!query || name.toLowerCase().includes(query) || path.toLowerCase().includes(query)) {
        out.push({
          title: name,
          sub: path,
          go: () => void tabStore.openPath(path),
        });
      }
    }
    return out;
  });

  /** 高亮条跟随激活行:列表变化 → 直接落位;仅 activeHit 变化 → 弹簧滑动 */
  let listKey = "";
  $effect(() => {
    const row = rowEls[activeHit];
    if (!row || !hlEl) return;
    const key = hits.map((h) => h.sub + h.title).join("\n");
    const top = row.offsetTop - 8; // 减去 .results 内边距
    const height = row.offsetHeight;
    row.scrollIntoView({ block: "nearest" });
    if (reduced || key !== listKey) {
      listKey = key;
      hlEl.style.transform = `translateY(${top}px)`;
      hlEl.style.height = `${height}px`;
    } else {
      animate(hlEl, { y: top, height }, { type: "spring", stiffness: 520, damping: 38, mass: 0.85, restDelta: 0.5 });
    }
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      tabStore.searchOpen = false;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      activeHit = Math.min(hits.length - 1, activeHit + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeHit = Math.max(0, activeHit - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hits[activeHit]) {
        hits[activeHit].go();
        tabStore.searchOpen = false;
      }
    }
  }

  let inputEl: HTMLInputElement;
  onMount(() => inputEl?.focus());

  function choose(i: number) {
    activeHit = i;
    hits[i]?.go();
    tabStore.searchOpen = false;
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- 遮罩点击关闭为标准桌面交互 -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="mask"
  role="dialog"
  aria-modal="true"
  aria-label="搜索"
  tabindex="-1"
  transition:fade={{ duration: 200 }}
  onclick={() => (tabStore.searchOpen = false)}
>
  <div
    class="box"
    role="presentation"
    bind:this={boxEl}
    out:outBox={{ duration: 180 }}
    onclick={(e) => e.stopPropagation()}
  >
    <div class="input-row">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--mut)" stroke-width="2.4" stroke-linecap="round">
        <circle cx="11" cy="11" r="7"></circle>
        <line x1="20" y1="20" x2="16.2" y2="16.2"></line>
      </svg>
      <input
        bind:this={inputEl}
        value={q}
        placeholder="搜索历史文档…"
        oninput={(e) => {
          q = e.currentTarget.value;
          activeHit = 0;
        }}
      />
      <span class="kbd">esc</span>
    </div>

    <div class="results">
      {#if hits.length > 0}
        <div class="highlight" bind:this={hlEl}></div>
        {#each hits as hit, i (hit.sub + hit.title + i)}
          <button bind:this={rowEls[i]} onmouseenter={() => (activeHit = i)} onclick={() => choose(i)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mut)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span class="hit-meta">
              <span class="hit-title">{hit.title}</span>
              <span class="hit-sub">{hit.sub}</span>
            </span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--mut)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 5 16 12 9 19"></polyline>
            </svg>
          </button>
        {/each}
      {:else}
        {#if q.trim()}
          <div class="no-hits">没有找到「{q}」</div>
        {:else}
          <div class="no-hits">还没有打开过文档,按 {modKey}O 打开</div>
        {/if}
      {/if}
    </div>

    <div class="footer">↩ 打开 · ESC 关闭</div>
  </div>
</div>

<style>
  .mask {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: color-mix(in srgb, var(--ink) 18%, transparent);
    backdrop-filter: blur(6px);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 14vh;
  }

  .box {
    width: 560px;
    max-width: calc(100vw - 48px);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: calc(var(--r) * 1.1);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 15px 18px;
    border-bottom: 2px solid var(--line2);
  }

  input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 15px;
    color: var(--ink);
  }

  input::placeholder {
    color: var(--mut);
  }

  .kbd {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 9.5px;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 2px 6px;
    color: var(--mut);
  }

  .results {
    position: relative;
    max-height: 320px;
    overflow-y: auto;
    padding: 8px;
  }

  /* 激活行高亮条:绝对定位在滚动容器内,随内容滚动,仅 transform 移动 */
  .highlight {
    position: absolute;
    left: 8px;
    right: 8px;
    top: 0;
    height: 0;
    border-radius: calc(var(--r) * 0.55);
    background: var(--soft);
    pointer-events: none;
    z-index: 0;
    will-change: transform;
  }

  .results button {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 9px 10px;
    border: none;
    border-radius: calc(var(--r) * 0.55);
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    color: var(--ink);
  }

  .hit-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .hit-title {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hit-sub {
    font-size: 10.5px;
    color: var(--mut);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .no-hits {
    padding: 22px 10px 26px;
    text-align: center;
    color: var(--mut);
    font-size: 12.5px;
  }

  .footer {
    padding: 9px 18px;
    border-top: 1px solid var(--line);
    font-family: ui-monospace, Menlo, monospace;
    font-size: 9.5px;
    letter-spacing: 0.08em;
    color: var(--mut);
  }
</style>
