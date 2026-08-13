/**
 * roundtrip 无损性提示(interior CollapsibleBanner):
 * 可折叠、可关闭(不再提醒 → 设置持久化)。
 * 由 EditorPane 在 !lossless 时渲染。
 */
import type { DocumentSession } from "../lib/files/document";
import { settingsStore } from "../lib/settings/settingsStore";
import { useStoreVersion } from "../lib/react/reactive";
import { CollapsibleBanner } from "./interior/collapsible-banner";

export function NormalizeNotice({ session }: { session: DocumentSession }) {
  useStoreVersion(settingsStore);
  useStoreVersion(session);

  if (settingsStore.settings.hideRoundtripNotice || session.lossless) return null;

  return (
    <CollapsibleBanner
      title="此文件含保存时会被规范化的写法"
      description="渲染效果不变,仅源码排版统一。"
      dismissible
      dismissLabel="不再提醒"
      onDismiss={() => settingsStore.update("hideRoundtripNotice", true)}
    />
  );
}
