/**
 * roundtrip 无损性提示:保存时会被规范化排版(渲染不变)。
 * 由 EditorPane 在 !lossless 时渲染;"不再提醒"写入设置。
 */
import type { DocumentSession } from "../lib/files/document";
import { settingsStore } from "../lib/settings/settingsStore";
import { useStoreVersion } from "../lib/react/reactive";

export function NormalizeNotice({ session }: { session: DocumentSession }) {
  useStoreVersion(settingsStore);
  useStoreVersion(session);

  if (settingsStore.settings.hideRoundtripNotice || session.lossless) return null;

  return (
    <div className="banner normalize">
      <span className="text">此文件含保存时会被规范化的写法(渲染效果不变,仅源码排版统一)</span>
      <span className="actions">
        <button className="btn" onClick={() => settingsStore.update("hideRoundtripNotice", true)}>
          不再提醒
        </button>
      </span>
    </div>
  );
}
