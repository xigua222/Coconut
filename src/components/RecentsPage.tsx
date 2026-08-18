/** 最近打开:全部近期 Markdown 的列表(名称 / 路径 / 大小 / 时间)。 */
import { useEffect, useMemo, useState } from "react";
import { tabStore } from "../lib/tabs/tabStore";
import { treeStore } from "../lib/files/treeStore";
import { folderName } from "../lib/files/paths";
import { statFiles, type FileStat } from "../ipc/commands";
import { useStoreVersion } from "../lib/react/reactive";
import { settingsStore } from "../lib/settings/settingsStore";
import { useT } from "../lib/i18n";

function formatSize(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ms: number | null, locale: string): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString(locale === "en" ? "en" : "zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecentsPage() {
  useStoreVersion(treeStore);
  useStoreVersion(tabStore);
  useStoreVersion(settingsStore);
  const t = useT();
  const locale = settingsStore.settings.locale;
  const paths = treeStore.recentOpened;
  const [stats, setStats] = useState<Map<string, FileStat>>(() => new Map());

  const recentKey = paths.join("\0");

  useEffect(() => {
    if (!paths.length) {
      setStats(new Map());
      return;
    }
    let alive = true;
    void statFiles(paths).then((rows) => {
      if (!alive) return;
      setStats(new Map(rows.map((row) => [row.path, row])));
    });
    return () => {
      alive = false;
    };
  }, [recentKey]);

  const rows = useMemo(
    () =>
      paths.map((path) => {
        const st = stats.get(path);
        return {
          path,
          name: folderName(path),
          size: st?.size ?? null,
          mtime: st?.mtime ?? null,
        };
      }),
    [paths, stats],
  );

  return (
    <div className="library">
      <h1>{t("recentOpened")}</h1>
      {rows.length > 0 ? (
        <div className="library-card">
          <table className="library-table">
            <thead>
              <tr>
                <th className="library-name">{t("colName")}</th>
                <th className="library-path">{t("colPath")}</th>
                <th className="library-num">{t("colSize")}</th>
                <th className="library-time">{t("colTime")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.path}
                  tabIndex={0}
                  onClick={() => void tabStore.openPath(row.path)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void tabStore.openPath(row.path);
                    }
                  }}>
                  <td className="library-name">{row.name}</td>
                  <td className="library-path" title={row.path}>
                    {row.path}
                  </td>
                  <td className="library-num">{formatSize(row.size)}</td>
                  <td className="library-time">{formatTime(row.mtime, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="library-empty">{t("emptyRecent")}</p>
      )}
    </div>
  );
}
