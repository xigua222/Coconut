/**
 * 文件被外部修改且本会话有未保存修改时的冲突横幅。
 * 由 EditorPane 在 session.conflict 时渲染;reloadFromDisk / keepLocal 二选一。
 * 按钮用 interior PressDepth。
 */
import type { DocumentSession } from "../lib/files/document";
import { useStoreVersion } from "../lib/react/reactive";
import { PressDepth } from "./interior/press-depth";

export function ConflictBanner({ session }: { session: DocumentSession }) {
  useStoreVersion(session);
  return (
    <div className="banner conflict">
      <span className="text">⚠️ 文件已被外部修改</span>
      <span className="actions">
        <PressDepth
          className="press-sm"
          depth={2}
          onClick={() => void session.reloadFromDisk()}>
          重新加载
        </PressDepth>
        <PressDepth
          className="press-sm press-red"
          depth={2}
          onClick={() => void session.keepLocal()}>
          保留当前版本(覆盖)
        </PressDepth>
      </span>
    </div>
  );
}
