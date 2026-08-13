/**
 * 右侧目录面板:标题列表 + 红色游标(随滚动联动)。
 * 宽度 0↔232 动画,随大纲开关显隐。
 */
import { tabStore } from "../lib/tabs/tabStore";
import { extractOutline } from "../lib/outline/extractOutline";
import { settingsStore } from "../lib/settings/settingsStore";
import { useStoreVersion } from "../lib/react/reactive";

const TOC_W = 232;

export function TocPanel() {
  useStoreVersion(tabStore);
  useStoreVersion(settingsStore);
  const session = tabStore.activeTab?.session ?? null;
  useStoreVersion(session);

  const items = session ? extractOutline(session.md) : [];
  const show = !!session && settingsStore.settings.outlineVisible;
  // 游标 top 相对 nav 内容区:行高 32、游标高 18,故 (32-18)/2=7 居中。
  // 游标置于 <nav> 内部,随列表滚动且不依赖"目录"标签高度,杜绝魔数漂移。
  const barY = 7 + Math.max(0, tabStore.activeToc) * 32;

  return (
    <aside className={show ? "toc" : "toc hidden"} style={{ width: show ? TOC_W : 0 }} aria-hidden={!show}>
      <div className="inner" style={{ opacity: show ? 1 : 0 }}>
        <div className="label">目录</div>
        <nav>
          <div
            className="bar"
            style={{ top: barY, opacity: tabStore.activeToc >= 0 && items.length ? 1 : 0 }}
          />
          {items.map((item, i) => (
            <button
              key={item.line}
              className={i === tabStore.activeToc ? "active" : ""}
              style={{ paddingLeft: 14 + Math.max(0, item.level - 2) * 10 }}
              onClick={() => tabStore.scrollToActive(item.slug)}>
              {item.text}
            </button>
          ))}
          {items.length === 0 && <p className="empty">无标题</p>}
        </nav>
      </div>
    </aside>
  );
}
