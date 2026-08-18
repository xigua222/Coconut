/**
 * 底部状态栏:左=字数/字符/行数;右=编码 + 保存状态。
 */
import { tabStore } from "../lib/tabs/tabStore";
import { settingsStore } from "../lib/settings/settingsStore";
import { useStoreVersion } from "../lib/react/reactive";
import { countStats } from "../lib/utils/count";
import { RollingNumber, splitCountTemplate } from "./interior/rolling-number";
import { useT } from "../lib/i18n";

export function StatusBar() {
  useStoreVersion(tabStore);
  useStoreVersion(settingsStore);
  const t = useT();
  const session = tabStore.activeTab?.session ?? null;
  useStoreVersion(session);

  const stats = session ? countStats(session.md) : null;
  const saving = session?.saving ?? false;
  const dirty = session?.dirty ?? false;
  const encoding = session?.encoding ?? "UTF-8";
  const willConvert = encoding !== "UTF-8";
  const locales = settingsStore.settings.locale === "en" ? "en" : "zh-CN";
  const words = splitCountTemplate(t("words"));
  const chars = splitCountTemplate(t("chars"));
  const lines = splitCountTemplate(t("lines"));

  return (
    <footer className="statusbar">
      <div className="group">
        {stats && (
          <>
            <span className="item" title={t("wordsHint")}>
              <RollingNumber
                value={stats.words}
                prefix={words.prefix}
                suffix={words.suffix}
                locales={locales}
              />
            </span>
            <span className="item" title={t("charsHint")}>
              <RollingNumber
                value={stats.chars}
                prefix={chars.prefix}
                suffix={chars.suffix}
                locales={locales}
              />
            </span>
            <span className="item" title={t("linesHint")}>
              <RollingNumber
                value={stats.lines}
                prefix={lines.prefix}
                suffix={lines.suffix}
                locales={locales}
              />
            </span>
          </>
        )}
      </div>
      <div className="group">
        <span
          className={willConvert ? "item warn" : "item"}
          title={willConvert ? t("convertUtf8") : t("encodingHint")}>
          {encoding}
          {willConvert ? " → UTF-8" : ""}
        </span>
        <span
          className={saving ? "item save busy" : "item save"}
          title={dirty ? t("unsavedHint") : t("savedHint")}>
          {saving ? t("saving") : dirty ? t("unsaved") : t("saved")}
        </span>
      </div>
    </footer>
  );
}
