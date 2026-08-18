/**
 * 文内搜索浮层(⌘F):非模态顶部浮条,输入即搜,Enter/Shift+Enter 上下,
 * Esc 关闭。匹配高亮由编辑器 find 插件渲染,这里只负责驱动。
 */
import { useEffect, useRef } from "react";
import { tabStore } from "../lib/tabs/tabStore";
import { findUI } from "../lib/editor/plugins/findUI";
import { modKey } from "../lib/utils/platform";
import { useStoreVersion } from "../lib/react/reactive";
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-animated";
import { MovingIcon } from "./MovingIcon";
import { RollingNumber } from "./interior/rolling-number";
import { useT } from "../lib/i18n";

export function FindBar() {
  useStoreVersion(findUI);
  useStoreVersion(tabStore);
  const t = useT();
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
    <div className="findbar" role="search" aria-label={t("findInDoc")}>
      <MovingIcon icon={SearchIcon} size={13} />
      <input
        ref={inputRef}
        value={query}
        placeholder={t("findPlaceholder")}
        onChange={onInput}
        onKeyDown={onKeydown}
      />
      <span className={count === 0 ? "count empty" : "count"}>
        {count > 0 ? (
          <>
            <RollingNumber value={current + 1} />
            <span className="sep"> / </span>
            <RollingNumber value={count} />
          </>
        ) : (
          t("noResults")
        )}
      </span>
      <button className="nav" title={`${t("findPrev")} (${modKey}+Shift+Enter)`} onClick={() => controller()?.prev()}>
        <MovingIcon icon={ChevronUpIcon} size={12} fill />
      </button>
      <button className="nav" title={`${t("findNext")} (Enter)`} onClick={() => controller()?.next()}>
        <MovingIcon icon={ChevronDownIcon} size={12} fill />
      </button>
      <button className="nav" title={`${t("close")} (Esc)`} onClick={close}>
        <MovingIcon icon={XIcon} size={11} fill />
      </button>
    </div>
  );
}
