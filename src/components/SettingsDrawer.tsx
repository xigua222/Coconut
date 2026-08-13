/**
 * 设置抽屉(interior Drawer:弹簧滑入、头部拖拽关闭、焦点圈禁)。
 * 内容与原先一致:正文字体、字号、行宽、显示大纲、导出。
 */
import { Drawer } from "./interior/drawer";
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
    <Drawer
      open={open}
      onOpenChange={(next) => (tabStore.settingsOpen = next)}
      title="设置"
      description="coconut 0.2.0"
      width={296}
      closeLabel="关闭设置"
      className="settings-drawer"
      footer={
        <span className="drawer-version">
          <span className="drawer-dot" />
          coconut 0.2.0
        </span>
      }>
      <div className="drawer-group">
        <span className="drawer-group-label">正文字体</span>
        <div className="seg">
          {fontSeg.map((o) => (
            <button key={o.label} className={o.cur ? "on" : ""} onClick={o.go}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-group">
        <span className="drawer-group-label">字号</span>
        <div className="seg">
          {sizeSeg.map((o) => (
            <button key={o.label} className={o.cur ? "on" : ""} onClick={o.go}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-group">
        <span className="drawer-group-label">行宽</span>
        <div className="seg">
          {measureSeg.map((o) => (
            <button key={o.label} className={o.cur ? "on" : ""} onClick={o.go}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-group">
        <span className="drawer-group-label">显示大纲</span>
        <button
          className={settings.outlineVisible ? "switch on" : "switch"}
          onClick={() => settingsStore.update("outlineVisible", !settings.outlineVisible)}
          aria-label="显示大纲">
          <span className="knob" />
        </button>
      </div>

      <div className="drawer-group">
        <span className="drawer-group-label">导出</span>
        <button className="export-btn" onClick={() => void exportCurrent()}>
          导出当前为 HTML…
        </button>
      </div>
    </Drawer>
  );
}
