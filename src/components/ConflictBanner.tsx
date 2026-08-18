/**
 * 文件被外部修改且本会话有未保存修改时的冲突横幅。
 * 由 EditorPane 在 session.conflict 时渲染;reloadFromDisk / keepLocal 二选一。
 * 按钮用 interior PressDepth。
 */
import type { DocumentSession } from "../lib/files/document";
import { useStoreVersion } from "../lib/react/reactive";
import { PressDepth } from "./interior/press-depth";
import { BadgeAlertIcon } from "lucide-animated";
import { MovingIcon } from "./MovingIcon";
import { useT } from "../lib/i18n";

export function ConflictBanner({ session }: { session: DocumentSession }) {
  useStoreVersion(session);
  const t = useT();
  return (
    <div className="banner conflict">
      <span className="text">
        <MovingIcon icon={BadgeAlertIcon} size={14} />
        {t("fileChangedExternally")}
      </span>
      <span className="actions">
        <PressDepth
          className="press-sm"
          depth={2}
          onClick={() => void session.reloadFromDisk()}>
          {t("reload")}
        </PressDepth>
        <PressDepth
          className="press-sm press-red"
          depth={2}
          onClick={() => void session.keepLocal()}>
          {t("keepLocal")}
        </PressDepth>
      </span>
    </div>
  );
}
