/**
 * 设置抽屉(右侧滑入):正文字体、字号、行宽、显示大纲。
 * 抽屉本体常驻 DOM,CSS transform 控制进出;遮罩随开合挂载(motion 淡入淡出)。
 */
import { AnimatePresence, motion } from "motion/react";
import { settingsStore } from "../lib/settings/settingsStore";
import type { MeasureLevel, SizeLevel } from "../lib/settings/defaults";
import { exportCurrentHtml } from "../lib/files/export";
import { tabStore } from "../lib/tabs/tabStore";
import { useStoreVersion } from "../lib/react/reactive";

interface Seg {
  label: string;
  cur: boolean;
  go: () => void;
}

export function SettingsDrawer() {
  useStoreVersion(tabStore);
  useStoreVersion(settingsStore);
  const { settings } = settingsStore;
  const open = tabStore.settingsOpen;

  const fontSeg: Seg[] = [
    { label: "无衬线", cur: !settings.serif, go: () => settingsStore.update("serif", false) },
    { label: "衬线", cur: settings.serif, go: () => settingsStore.update("serif", true) },
  ];
  const sizeSeg: Seg[] = [
    { label: "小", cur: settings.sizeLevel === "s", go: () => settingsStore.update("sizeLevel", "s" as SizeLevel) },
    { label: "标准", cur: settings.sizeLevel === "m", go: () => settingsStore.update("sizeLevel", "m" as SizeLevel) },
    { label: "大", cur: settings.sizeLevel === "l", go: () => settingsStore.update("sizeLevel", "l" as SizeLevel) },
  ];
  const measureSeg: Seg[] = [
    { label: "窄", cur: settings.measureLevel === "n", go: () => settingsStore.update("measureLevel", "n" as MeasureLevel) },
    { label: "适中", cur: settings.measureLevel === "m", go: () => settingsStore.update("measureLevel", "m" as MeasureLevel) },
    { label: "宽", cur: settings.measureLevel === "w", go: () => settingsStore.update("measureLevel", "w" as MeasureLevel) },
  ];

  async function exportCurrent() {
    const session = tabStore.activeTab?.session;
    if (!session) return;
    try {
      await exportCurrentHtml(session);
    } catch (e) {
      console.error("export failed", e);
    }
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => (tabStore.settingsOpen = false)}
          />
        )}
      </AnimatePresence>
      <aside className={open ? "drawer open" : "drawer"} aria-hidden={!open}>
        <div className="head">
          <span className="title">设置</span>
          <button className="close" onClick={() => (tabStore.settingsOpen = false)} aria-label="关闭设置">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round">
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
        </div>

        <div className="group">
          <span className="group-label">正文字体</span>
          <div className="seg">
            {fontSeg.map((o) => (
              <button key={o.label} className={o.cur ? "on" : ""} onClick={o.go}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="group">
          <span className="group-label">字号</span>
          <div className="seg">
            {sizeSeg.map((o) => (
              <button key={o.label} className={o.cur ? "on" : ""} onClick={o.go}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="group">
          <span className="group-label">行宽</span>
          <div className="seg">
            {measureSeg.map((o) => (
              <button key={o.label} className={o.cur ? "on" : ""} onClick={o.go}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="group">
          <span className="group-label">显示大纲</span>
          <button
            className={settings.outlineVisible ? "switch on" : "switch"}
            onClick={() => settingsStore.update("outlineVisible", !settings.outlineVisible)}
            aria-label="显示大纲">
            <span className="knob" />
          </button>
        </div>

        <div className="group">
          <span className="group-label">导出</span>
          <button className="export-btn" onClick={() => void exportCurrent()}>
            导出当前为 HTML…
          </button>
        </div>

        <div className="grow" />

        <div className="foot">
          <span>coconut 0.2.0</span>
        </div>
      </aside>
    </>
  );
}
