/**
 * 未保存修改的关闭确认对话框(interior Modal:焦点圈禁、滚动锁、Escape 关闭内置)。
 * 由 App 常驻渲染,open 由 tabStore.pendingClose 驱动;退场由 Modal 内部
 * AnimatePresence 完成(不依赖父级条件卸载)。
 */
import { Modal } from "./interior/modal";
import { tabStore } from "../lib/tabs/tabStore";
import { useStoreVersion } from "../lib/react/reactive";

export function ConfirmModal() {
  useStoreVersion(tabStore);
  const session = tabStore.pendingClose;

  return (
    <Modal
      open={!!session}
      onClose={() => tabStore.resolveConfirm("cancel")}
      title={session ? `「${session.title}」有未保存的修改` : ""}
      description="关闭前是否保存?"
      closeOnEscape
      closeOnBackdrop={false}
      closeLabel="取消"
      showClose={false}
      maxWidth={360}
      footer={
        <>
          <button className="btn primary" onClick={() => tabStore.resolveConfirm("save")}>
            保存
          </button>
          <button className="btn" onClick={() => tabStore.resolveConfirm("discard")}>
            不保存
          </button>
          <button className="btn" onClick={() => tabStore.resolveConfirm("cancel")}>
            取消
          </button>
        </>
      }
    />
  );
}
