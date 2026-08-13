/**
 * 左侧文库侧栏:搜索(⌘K)、文档列表、底部新建/主题/设置。
 * 宽度 0↔218 动画;tab 增删带 slide-in/退场动画(motion 重写 svelte fly/fade/flip)。
 */
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Tab } from "../lib/tabs/types";
import { tabStore } from "../lib/tabs/tabStore";
import { treeStore } from "../lib/files/treeStore";
import { settingsStore } from "../lib/settings/settingsStore";
import { modKey } from "../lib/utils/platform";
import { useStoreVersion } from "../lib/react/reactive";
import { useSkeletonSwap } from "./interior/skeleton-swap";

const SB_W = 218;
/** 与全局 --ease-out 一致的出弹曲线 */
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * 单个 tab 行:订阅自己的 session(dirty/title 变化独立于 tabStore 通知,
 * 不能让 Sidebar 订阅所有 session —— hooks 数量会随 tab 数变化)。
 */
function TabRow({ tab }: { tab: Tab }) {
  useStoreVersion(tab.session);
  const { title, dirty, path } = tab.session;

  return (
    <motion.button
      className={tab.id === tabStore.activeId ? "doc active" : "doc"}
      onClick={() => tabStore.activate(tab.id)}
      title={path ?? title}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: EASE_OUT }}
      layout>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--mut)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="meta">
        <span className="name">{title}</span>
        <span className="sub">{dirty ? "未保存" : "已保存"}</span>
      </span>
      <span className={tab.id === tabStore.activeId ? "dot on" : "dot"} />
    </motion.button>
  );
}

export function Sidebar() {
  useStoreVersion(tabStore);
  useStoreVersion(treeStore);
  useStoreVersion(settingsStore);
  const folderRoot = settingsStore.settings.folderRoot;

  /** 根目录变化 → 重新扫描(首次/更换目录) */
  useEffect(() => {
    if (folderRoot) void treeStore.refresh();
  }, [folderRoot]);

  /** 根名(最后一段路径) */
  const rootName = treeStore.root
    ? (treeStore.root.split(/[/\\]/).filter(Boolean).at(-1) ?? treeStore.root)
    : "";

  /** 首次加载(无数据且扫描中)显示骨架;后台 watch 重扫保持树 + 透明度提示 */
  const firstLoad = treeStore.loading && treeStore.entries.length === 0;
  const { showSkeleton } = useSkeletonSwap({ ready: !firstLoad });
  const SKELETON_W = [88, 95, 80, 92, 85, 70];

  return (
    <aside
      className={tabStore.sidebarVisible ? "sidebar" : "sidebar hidden"}
      style={{ width: tabStore.sidebarVisible ? SB_W : 0 }}
      aria-hidden={!tabStore.sidebarVisible}>
      <div className="inner" style={{ opacity: tabStore.sidebarVisible ? 1 : 0 }}>
        {/* 顶部留白:与 macOS 系统交通灯(红黄绿)对齐,同时是窗口拖拽区域 */}
        <div className="traffic-space" />

        <button className="search" onClick={() => (tabStore.searchOpen = true)}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="20" y1="20" x2="16.2" y2="16.2" />
          </svg>
          <span className="grow">搜索</span>
          <span className="kbd">{modKey}K</span>
        </button>

        <div className="section-label">文库 / RECENT</div>
        <nav className="docs">
          <AnimatePresence initial={false}>
            {tabStore.tabs.map((tab) => (
              <TabRow key={tab.id} tab={tab} />
            ))}
          </AnimatePresence>
          {tabStore.tabs.length === 0 && <p className="empty">暂无文档</p>}
        </nav>

        {/* 文件列表面板:浏览所选目录的 Markdown 文件,Agent 增删自动刷新 */}
        <div className="section-label">目录 / FOLDER</div>
        <div className="folder-root">
          {treeStore.root ? (
            <>
              <div className="root-btn" onClick={() => void treeStore.pickRoot()} title={treeStore.root}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <span className="grow root-name">{rootName}</span>
                <button
                  className="mini-btn"
                  title="重新扫描"
                  onClick={(e) => {
                    e.stopPropagation();
                    void treeStore.refresh();
                  }}>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
              </div>
              <nav className={treeStore.loading && !showSkeleton ? "tree loading" : "tree"}>
                {showSkeleton ? (
                  <div className="tree-skeleton" aria-hidden>
                    {SKELETON_W.map((w, i) => (
                      <span key={i} style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : (
                  treeStore.visible.map((entry) =>
                    entry.is_dir ? (
                      <button
                        key={entry.path}
                        className="tree-item dir"
                        style={{ paddingLeft: 10 + entry.depth * 12 }}
                        onClick={() => treeStore.toggleDir(entry.path)}
                        title={entry.path}>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={treeStore.expanded.has(entry.path) ? "" : "folded"}>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span className="grow dir-name">{entry.name}</span>
                      </button>
                    ) : (
                      <button
                        key={entry.path}
                        className="tree-item file"
                        style={{ paddingLeft: 10 + entry.depth * 12 }}
                        onClick={() => treeStore.openFile(entry.path)}
                        title={entry.path}>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="grow file-name">{entry.name}</span>
                      </button>
                    ),
                  )
                )}
                {treeStore.entries.length === 0 && !treeStore.loading && (
                  <p className="empty">此目录没有 Markdown 文件</p>
                )}
              </nav>
            </>
          ) : (
            <button className="root-btn empty-root" onClick={() => void treeStore.pickRoot()}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              <span className="grow">选择目录…</span>
            </button>
          )}
        </div>

        <div className="grow" />

        <div className="footer">
          <button title="新建文档" onClick={() => tabStore.newTab()}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button title="设置" onClick={() => (tabStore.settingsOpen = true)}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <circle cx="9" cy="7" r="2.2" fill="var(--panel)" />
              <line x1="4" y1="17" x2="20" y2="17" />
              <circle cx="15" cy="17" r="2.2" fill="var(--panel)" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
