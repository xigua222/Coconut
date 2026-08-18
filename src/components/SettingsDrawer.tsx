/**
 * 设置抽屉:外观、语言、编辑偏好、导出。
 */
import { Drawer } from "./interior/drawer";
import { SegmentedControl } from "./interior/segmented-control";
import { LoadingButton } from "./interior/loading-button";
import { Switch } from "./interior/switch";
import { settingsStore } from "../lib/settings/settingsStore";
import type { MeasureLevel, SizeLevel } from "../lib/settings/defaults";
import { exportCurrentHtml } from "../lib/files/export";
import { tabStore } from "../lib/tabs/tabStore";
import { useStoreVersion } from "../lib/react/reactive";
import { useT, type Locale } from "../lib/i18n";

export function SettingsDrawer() {
  useStoreVersion(tabStore);
  const t = useT();
  const { settings } = settingsStore;
  const open = tabStore.settingsOpen;

  async function exportCurrent() {
    const session = tabStore.activeTab?.session;
    if (!session) throw new Error(t("noOpenDocument"));
    await exportCurrentHtml(session);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (tabStore.settingsOpen = next)}
      title={t("settings")}
      width={320}
      closeLabel={t("closeSettings")}
      className="settings-drawer"
      footer={
        <span className="drawer-version">
          <span className="drawer-dot" />
          coconut 0.2.0
        </span>
      }>
      <div className="drawer-group">
        <span className="drawer-group-label">{t("appearance")}</span>
        <SegmentedControl
          label={t("appearance")}
          className="w-full"
          value={settings.theme === "coconut-dark" ? "dark" : "light"}
          onValueChange={(v) =>
            settingsStore.update("theme", v === "dark" ? "coconut-dark" : "coconut")
          }
          options={[
            { value: "light", label: t("light") },
            { value: "dark", label: t("dark") },
          ]}
        />
      </div>

      <div className="drawer-group">
        <span className="drawer-group-label">{t("language")}</span>
        <SegmentedControl
          label={t("language")}
          className="w-full"
          value={settings.locale}
          onValueChange={(v) => settingsStore.update("locale", v as Locale)}
          options={[
            { value: "zh", label: t("langZh") },
            { value: "en", label: t("langEn") },
          ]}
        />
      </div>

      <div className="drawer-group">
        <span className="drawer-group-label">{t("editor")}</span>
        <span className="drawer-field-label">{t("fontSize")}</span>
        <SegmentedControl
          label={t("fontSize")}
          className="w-full"
          value={settings.sizeLevel}
          onValueChange={(v) => settingsStore.update("sizeLevel", v as SizeLevel)}
          options={[
            { value: "s", label: t("sizeS") },
            { value: "m", label: t("sizeM") },
            { value: "l", label: t("sizeL") },
          ]}
        />
        <span className="drawer-field-label">{t("measure")}</span>
        <SegmentedControl
          label={t("measure")}
          className="w-full"
          value={settings.measureLevel}
          onValueChange={(v) => settingsStore.update("measureLevel", v as MeasureLevel)}
          options={[
            { value: "n", label: t("measureN") },
            { value: "m", label: t("measureM") },
            { value: "w", label: t("measureW") },
          ]}
        />
        <div className="drawer-row">
          <div className="drawer-row-text">
            <span className="drawer-row-title">{t("autoSave")}</span>
            <span className="drawer-row-hint">{t("autoSaveHint")}</span>
          </div>
          <Switch
            label={t("autoSave")}
            checked={settings.autoSave}
            onCheckedChange={(v) => settingsStore.update("autoSave", v)}
          />
        </div>
        <div className="drawer-row">
          <div className="drawer-row-text">
            <span className="drawer-row-title">{t("headingMarks")}</span>
            <span className="drawer-row-hint">{t("headingMarksHint")}</span>
          </div>
          <Switch
            label={t("headingMarks")}
            checked={settings.headingMarks}
            onCheckedChange={(v) => settingsStore.update("headingMarks", v)}
          />
        </div>
      </div>

      <div className="drawer-group">
        <span className="drawer-group-label">{t("export")}</span>
        <LoadingButton
          className="export-btn w-full"
          onAction={exportCurrent}
          pendingLabel={t("exporting")}
          successLabel={t("exported")}
          errorLabel={t("exportFailed")}>
          {t("exportHtml")}
        </LoadingButton>
      </div>
    </Drawer>
  );
}
