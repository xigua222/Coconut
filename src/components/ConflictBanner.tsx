/**
 * 文件被外部修改且本会话有未保存修改时的冲突横幅。
 * 由 EditorPane 在 session.conflict 时渲染;reloadFromDisk / keepLocal 二选一。
 */
import type { DocumentSession } from "../lib/files/document";
import { useStoreVersion } from "../lib/react/reactive";

export function ConflictBanner({ session }: { session: DocumentSession }) {
  useStoreVersion(session);
  return (
    <div className="banner conflict">
      <span className="text">⚠️ 文件已被外部修改</span>
      <span className="actions">
        <button className="btn" onClick={() => void session.reloadFromDisk()}>
          重新加载
        </button>
        <button className="btn primary" onClick={() => void session.keepLocal()}>
          保留当前版本(覆盖)
        </button>
      </span>
    </div>
  );
}
