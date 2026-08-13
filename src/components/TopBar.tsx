/**
 * 顶栏:窗口拖拽区 + 文档标题 + 常用操作按钮(源码模式/复制/导出/在访达中显示)
 * + Agent 活动指示器。功能外放:高频操作不再只藏在菜单里。
 * 按压反馈:interior usePressDepth(spring 缩放,中断友好);hidden 由 App 的
 * hide-on-scroll 驱动(高度折叠)。
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { tabStore } from "../lib/tabs/tabStore";
import { agentActivity } from "../lib/files/agentActivity";
import { exportCurrentHtml, exportCurrentPdf } from "../lib/files/export";
import { showInFolder } from "../ipc/commands";
import { isMac, isWindows } from "../lib/utils/platform";
import { useStoreVersion } from "../lib/react/reactive";
import { usePressDepth } from "./interior/press-depth";
import { CopyButton } from "./interior/copy-button";

/** 顶栏图标按钮:usePressDepth 提供按下缩放反馈(不改变既有视觉) */
function ActButton({
  title,
  ariaLabel,
  className,
  onClick,
  children,
}: {
  title: string;
  ariaLabel: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const { pressed, ref, bind } = usePressDepth({});
  return (
    <motion.button
      ref={ref}
      {...bind}
      className={className ? `act ${className}` : "act"}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      animate={{ scale: pressed ? 0.86 : 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.45 }}>
      {children}
    </motion.button>
  );
}

export function TopBar({ hidden = false }: { hidden?: boolean }) {
  useStoreVersion(tabStore);
  useStoreVersion(agentActivity);
  const [exportOpen, setExportOpen] = useState(false);

  const session = tabStore.activeTab?.session ?? null;
  useStoreVersion(session);
  const title = session?.title ?? "";
  const agentState = agentActivity.get().state;

  /** "在文件夹中显示"平台化文案 */
  const showInFolderLabel = isMac
    ? "在访达中显示"
    : isWindows
      ? "在资源管理器中显示"
      : "在文件管理器中显示";

  // done 状态数秒后回落 idle
  useEffect(() => {
    if (agentState !== "done") return;
    const timer = setTimeout(() => {
      if (agentActivity.get().state === "done") agentActivity.set({ state: "idle" });
    }, 4000);
    return () => clearTimeout(timer);
  }, [agentState]);

  // 点击外部关闭导出菜单
  useEffect(() => {
    if (!exportOpen) return;
    const close = () => setExportOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [exportOpen]);

  return (
    <motion.header
      className="topbar"
      aria-hidden={hidden}
      initial={false}
      animate={{ height: hidden ? 0 : 38, opacity: hidden ? 0 : 1 }}
      transition={{ type: "spring", stiffness: 150, damping: 27, mass: 1 }}
      style={{ pointerEvents: hidden ? "none" : undefined }}>
      <span className={title ? "title" : "title dim"}>{title || "coconut"}</span>

      {session && (
        <div className="actions" role="toolbar" aria-label="常用操作">
          <ActButton
            className={session.mode === "source" ? "on" : ""}
            title="源码模式 (⌘E)"
            ariaLabel="源码模式"
            onClick={() => session.toggleMode()}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </ActButton>

          <CopyButton
            value={session.md}
            label="复制"
            copiedLabel="已复制"
            errorLabel="复制失败"
          />

          <div className="export-wrap">
            <ActButton
              className={exportOpen ? "on" : ""}
              title="导出"
              ariaLabel="导出"
              onClick={(e) => {
                e.stopPropagation();
                setExportOpen(!exportOpen);
              }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </ActButton>
            {exportOpen && (
              <div
                className="export-pop"
                role="menu"
                aria-label="导出菜单"
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}>
                <button
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false);
                    void exportCurrentHtml(session);
                  }}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  <span>导出 HTML…</span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false);
                    void exportCurrentPdf(session);
                  }}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M6 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2" />
                    <path d="M6 12v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" />
                  </svg>
                  <span>导出 PDF…</span>
                </button>
              </div>
            )}
          </div>

          {session.path && (
            <ActButton
              title={showInFolderLabel}
              ariaLabel={showInFolderLabel}
              onClick={() => void showInFolder(session.path!)}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </ActButton>
          )}

          <span
            className={
              agentState === "writing"
                ? "agent-dot writing"
                : agentState === "done"
                  ? "agent-dot done"
                  : "agent-dot"
            }
            title={
              agentState === "writing"
                ? "Agent 正在写入…"
                : agentState === "done"
                  ? "Agent 已完成写入"
                  : ""
            }
          />
        </div>
      )}
    </motion.header>
  );
}
