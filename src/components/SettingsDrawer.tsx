/**
 * 设置抽屉(interior Drawer:弹簧滑入、头部拖拽关闭、焦点圈禁)。
 * 分段控件用 interior SegmentedControl(滑块弹簧 + 键盘方向键)。
 */
import { Drawer } from "./interior/drawer";
import { SegmentedControl } from "./interior/segmented-control";
import { Switch } from "./interior/switch";
import { usePressDepth } from "./interior/press-depth";
import { settingsStore } from "../lib/settings/settingsStore";
import type { MeasureLevel, SizeLevel } from "../lib/settings/defaults";
import { exportCurrentHtml } from "../lib/files/export";
import { tabStore } from "../lib/tabs/tabStore";
import { useStoreVersion } from "../lib/react/reactive";
import { motion } from "motion/react";

export function SettingsDrawer() {
  useStoreVersion(tabStore);
  useStoreVersion(settingsStore);
  const { settings } = settingsStore;
  const open = tabStore.settingsOpen;
  // 导出按钮是整宽块,用 hook 做按压缩放(不做 3D 卡片)
  const exportPress = usePressDepth({});

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
        <SegmentedControl
          label="正文字体"
          className="w-full"
          value={settings.serif ? "serif" : "sans"}
          onValueChange={(v) => settingsStore.update("serif", v === "serif")}
          options={[
            { value: "sans", label: "无衬线" },
            { value: "serif", label: "衬线" },
          ]}
        />
      </div>

      <div className="drawer-group">
        <span className="drawer-group-label">字号</span>
        <SegmentedControl
          label="字号"
          className="w-full"
          value={settings.sizeLevel}
          onValueChange={(v) => settingsStore.update("sizeLevel", v as SizeLevel)}
          options={[
            { value: "s", label: "小" },
            { value: "m", label: "标准" },
            { value: "l", label: "大" },
          ]}
        />
      </div>

      <div className="drawer-group">
        <span className="drawer-group-label">行宽</span>
        <SegmentedControl
          label="行宽"
          className="w-full"
          value={settings.measureLevel}
          onValueChange={(v) => settingsStore.update("measureLevel", v as MeasureLevel)}
          options={[
            { value: "n", label: "窄" },
            { value: "m", label: "适中" },
            { value: "w", label: "宽" },
          ]}
        />
      </div>

      <div className="drawer-group">
        <span className="drawer-group-label">显示大纲</span>
        <Switch
          label="显示大纲"
          checked={settings.outlineVisible}
          onCheckedChange={(v) => settingsStore.update("outlineVisible", v)}
        />
      </div>

      <div className="drawer-group">
        <span className="drawer-group-label">导出</span>
        <motion.button
          ref={exportPress.ref}
          {...exportPress.bind}
          className="export-btn"
          onClick={() => void exportCurrent()}
          animate={{ scale: exportPress.pressed ? 0.97 : 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.45 }}>
          导出当前为 HTML…
        </motion.button>
      </div>
    </Drawer>
  );
}
