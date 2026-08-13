/**
 * 未保存修改的关闭确认对话框(motion 重写 svelte fade/scale)。
 * 由 App 在 tabStore.pendingClose 非空时渲染,AnimatePresence 负责退场。
 */
import { motion } from "motion/react";
import { tabStore } from "../lib/tabs/tabStore";
import { useStoreVersion } from "../lib/react/reactive";

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function ConfirmModal() {
  useStoreVersion(tabStore);
  const session = tabStore.pendingClose;
  if (!session) return null;

  return (
    <motion.div
      className="confirm-mask"
      role="dialog"
      aria-modal="true"
      aria-label="未保存的修改"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}>
      <motion.div
        className="confirm-dialog"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.26, ease: EASE_OUT }}>
        <h2>「{session.title}」有未保存的修改</h2>
        <p className="sub">关闭前是否保存?</p>
        <div className="actions">
          <button className="btn primary" onClick={() => tabStore.resolveConfirm("save")}>
            保存
          </button>
          <button className="btn" onClick={() => tabStore.resolveConfirm("discard")}>
            不保存
          </button>
          <button className="btn" onClick={() => tabStore.resolveConfirm("cancel")}>
            取消
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
