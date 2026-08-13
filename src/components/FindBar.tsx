/**
 * 文内搜索浮层(⌘F):非模态顶部浮条,输入即搜,Enter/Shift+Enter 上下,
 * Esc 关闭。匹配高亮由编辑器 find 插件渲染,这里只负责驱动。
 */
import { useEffect, useRef } from "react";
import { tabStore } from "../lib/tabs/tabStore";
import { findUI } from "../lib/editor/plugins/findUI";
import { modKey } from "../lib/utils/platform";
import { useStoreVersion } from "../lib/react/reactive";

export function FindBar() {
  useStoreVersion(findUI);
  useStoreVersion(tabStore);
  const { open, query, count, current } = findUI.get();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function controller() {
    return tabStore.activeTab?.session.editor?.find ?? null;
  }

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  if (!open) return null;

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.currentTarget.value;
    findUI.set({ query: q });
    controller()?.setQuery(q);
  }

  function onKeydown(e: React.KeyboardEvent) {
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

  return (
    <div className="findbar" role="search" aria-label="在文档中查找">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="20" y1="20" x2="16.2" y2="16.2" />
      </svg>
      <input
        ref={inputRef}
        value={query}
        placeholder="在文档中查找…"
        onChange={onInput}
        onKeyDown={onKeydown}
      />
      <span className={count === 0 ? "count empty" : "count"}>
        {count > 0 ? `${current + 1} / ${count}` : "无结果"}
      </span>
      <button className="nav" title={`上一个(${modKey}+Shift+Enter)`} onClick={() => controller()?.prev()}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
      <button className="nav" title="下一个(Enter)" onClick={() => controller()?.next()}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <button className="nav" title="关闭(Esc)" onClick={close}>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round">
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </svg>
      </button>
    </div>
  );
}
