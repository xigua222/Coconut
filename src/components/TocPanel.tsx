/**
 * 右侧目录:阅读进度钉在顶部,标题列表自己滚动。
 * 当前节用左边红条标出,随正文滚动更新,并滚进可视区。
 */
import { useEffect, useRef } from "react";
import { tabStore } from "../lib/tabs/tabStore";
import { extractOutline } from "../lib/outline/extractOutline";
import { settingsStore } from "../lib/settings/settingsStore";
import { useStoreVersion } from "../lib/react/reactive";
import { ReadingProgress } from "./interior/reading-progress";
import { countStats } from "../lib/utils/count";
import { useT } from "../lib/i18n";

export const TOC_W = 252;

export function TocPanel() {
  useStoreVersion(tabStore);
  useStoreVersion(settingsStore);
  const session = tabStore.activeTab?.session ?? null;
  useStoreVersion(session);
  const t = useT();
  const navRef = useRef<HTMLElement>(null);

  const items = session ? extractOutline(session.md) : [];
  const show = !!session && settingsStore.settings.outlineVisible;
  const active = tabStore.activeToc;

  useEffect(() => {
    const btn = navRef.current?.querySelector<HTMLElement>("button.active");
    btn?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <aside className={show ? "toc" : "toc hidden"} style={{ width: show ? TOC_W : 0 }} aria-hidden={!show}>
      <div className="inner" style={{ opacity: show ? 1 : 0 }}>
        {session?.mode === "wysiwyg" && (
          <div className="toc-reading-progress">
            <ReadingProgress
              value={tabStore.progress}
              words={countStats(session.md).words}
              label={t("readingProgress")}
              doneLabel={t("readDone")}
            />
          </div>
        )}
        <nav ref={navRef} aria-label={t("outline")}>
          {items.map((item, i) => (
            <button
              key={`${item.line}-${item.slug}`}
              type="button"
              className={i === active ? "active" : ""}
              style={{ paddingLeft: 12 + Math.max(0, item.level - 1) * 10 }}
              title={item.text}
              onClick={() => tabStore.scrollToActive(item.slug)}>
              {item.text}
            </button>
          ))}
          {items.length === 0 && <p className="empty">{t("noHeadings")}</p>}
        </nav>
      </div>
    </aside>
  );
}
