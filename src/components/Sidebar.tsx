/**
 * 左侧侧栏:搜索、可折叠工作区、底部钉住的近期访问。
 */
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { tabStore } from "../lib/tabs/tabStore";
import { treeStore, type WorkspaceSection } from "../lib/files/treeStore";
import { folderName, samePath } from "../lib/files/paths";
import { settingsStore } from "../lib/settings/settingsStore";
import { modKey } from "../lib/utils/platform";
import { useT, revealFolderLabel, trashLabel, trashConfirm } from "../lib/i18n";
import { useStoreVersion } from "../lib/react/reactive";
import { useSkeletonSwap } from "./interior/skeleton-swap";
import { usePressDepth } from "./interior/press-depth";
import { TreeView } from "./interior/tree-view";
import { ContextMenu, type ContextMenuItem } from "./interior/context-menu";
import { useNewItems, NewItemsPill } from "./interior/new-items-pill";
import { useAutoHeight } from "./interior/accordion";
import { openInVscode, showInFolder } from "../ipc/commands";
import { confirmDanger } from "../ipc/dialogs";
import {
  ChevronRightIcon,
  FolderOpenIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SunIcon,
  XIcon,
} from "lucide-animated";
import { MovingIcon } from "./MovingIcon";
import { WindowDragRegion } from "../lib/window/fill";

const SB_W = 218;
const DISCLOSE = { type: "spring", stiffness: 480, damping: 40, mass: 0.6 } as const;
const CARET = { type: "spring", stiffness: 700, damping: 46, mass: 0.5 } as const;
const PRESS = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;

/** 底栏图标按钮:只借 PressDepth 的按压缩放,不要它的立体高光/底座。 */
function FootButton({
  ariaLabel,
  pressed: on,
  onClick,
  children,
}: {
  ariaLabel: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const { pressed, ref, bind } = usePressDepth({});
  return (
    <motion.button
      ref={ref}
      {...bind}
      type="button"
      className={on ? "foot-btn on" : "foot-btn"}
      aria-label={ariaLabel}
      aria-pressed={on}
      onClick={onClick}
      animate={{ scale: pressed ? 0.86 : 1 }}
      transition={PRESS}>
      {children}
    </motion.button>
  );
}

async function trashFile(path: string): Promise<void> {
  if (!treeStore.canRename(path)) return;
  const ok = await confirmDanger(trashConfirm(folderName(path)), trashLabel());
  if (ok) await treeStore.trash(path);
}

function collectIds(nodes: WorkspaceSection["nodes"], into = new Set<string>()): Set<string> {
  for (const n of nodes) {
    into.add(n.id);
    if (n.children) collectIds(n.children, into);
  }
  return into;
}

function SectionCaret({ open }: { open: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className="vault-caret"
      initial={false}
      animate={{ rotate: open ? 90 : 0 }}
      transition={reduced ? { duration: 0 } : CARET}>
      <MovingIcon icon={ChevronRightIcon} size={11} />
    </motion.span>
  );
}

function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const { ref, height, ready } = useAutoHeight();
  return (
    <motion.div
      initial={false}
      animate={ready ? { height: open ? height : 0 } : {}}
      transition={reduced ? { duration: 0 } : DISCLOSE}
      style={{ overflow: "hidden", height: ready ? undefined : open ? "auto" : 0 }}>
      <div ref={ref} aria-hidden={open ? undefined : true}>
        {children}
      </div>
    </motion.div>
  );
}

function VaultTree({
  section,
  ctxPath,
  renamingId,
  setRenamingId,
  fileItems,
  headItems,
}: {
  section: WorkspaceSection;
  ctxPath: MutableRefObject<string | null>;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  fileItems: ContextMenuItem[];
  headItems: ContextMenuItem[];
}) {
  const t = useT();
  const open = treeStore.isSectionOpen(section.id);
  const extra = section.kind === "workspace";

  function onHeadSelect(id: string) {
    if (id === "add") void treeStore.addWorkspace();
    else if (id === "change-default") void treeStore.changeDefaultWorkspace();
    else if (id === "refresh") void treeStore.refresh();
    else if (id === "reveal" && section.root) void showInFolder(section.root);
    else if (id === "forget" && section.root) treeStore.removeWorkspace(section.root);
  }

  function onFileSelect(id: string) {
    const path = ctxPath.current;
    if (!path) return;
    if (id === "open" && treeStore.isFile(path)) treeStore.openFile(path);
    else if (id === "rename" && treeStore.canRename(path)) {
      requestAnimationFrame(() => setRenamingId(path));
    } else if (id === "reveal") void showInFolder(path);
    else if (id === "vscode") void openInVscode(path).catch(() => {});
    else if (id === "trash") void trashFile(path);
    else if (id === "forget" && treeStore.isRecent(path)) treeStore.forgetFile(path);
  }

  return (
    <section className="vault">
      <ContextMenu items={headItems} label={section.label} className="tree-ctx" onSelect={onHeadSelect}>
        <div className="vault-head-row">
          <button
            type="button"
            className="vault-head"
            aria-expanded={open}
            onClick={() => treeStore.toggleSection(section.id)}>
            <SectionCaret open={open} />
            <span className="vault-name">{section.label}</span>
            {section.kind === "default" && <span className="vault-tag">{t("defaultTag")}</span>}
          </button>
          {extra && section.root ? (
            <button
              type="button"
              className="vault-remove"
              aria-label={t("removeWorkspace")}
              onClick={(e) => {
                e.stopPropagation();
                if (section.root) treeStore.removeWorkspace(section.root);
              }}>
              <MovingIcon icon={XIcon} size={12} />
            </button>
          ) : null}
        </div>
      </ContextMenu>
      <Fold open={open}>
        <ContextMenu items={fileItems} label={t("fileActions")} className="tree-ctx" onSelect={onFileSelect}>
          <div
            onContextMenu={(e) => {
              const row = (e.target as HTMLElement).closest("[data-id]");
              ctxPath.current = row?.getAttribute("data-id") ?? null;
            }}>
            {section.nodes.length > 0 ? (
              <TreeView
                nodes={section.nodes}
                label={section.label}
                className="folder-tree"
                selectionLayoutId="sidebar-file-sel"
                expanded={[...treeStore.expanded]}
                onExpandedChange={(ids) => {
                  const inSection = collectIds(section.nodes);
                  const next = new Set([...treeStore.expanded].filter((id) => !inSection.has(id)));
                  for (const id of ids) next.add(id);
                  treeStore.expanded = next;
                  treeStore.notify();
                }}
                selected={tabStore.activeTab?.session?.path ?? null}
                onSelectedChange={(id) => {
                  if (treeStore.isFile(id)) treeStore.openFile(id);
                }}
                renamingId={renamingId}
                onRenameRequest={(id) => {
                  if (treeStore.canRename(id)) setRenamingId(id);
                }}
                onRenameCancel={() => setRenamingId(null)}
                onRenameCommit={(id, next) => {
                  void treeStore.rename(id, next).finally(() => setRenamingId(null));
                }}
              />
            ) : (
              <p className="empty">{t("emptyDocs")}</p>
            )}
          </div>
        </ContextMenu>
      </Fold>
    </section>
  );
}

const RECENT_PREVIEW = 3;

/** 侧栏三条不跟 MRU 立刻换位:点已显示的项保持原序,只有新文件进列表或条目被移除时才改。 */
function reconcileRecentPreview(shown: string[], recents: string[], limit: number): string[] {
  const inRecents = (p: string) => recents.some((r) => samePath(r, p));
  const inList = (list: string[], p: string) => list.some((s) => samePath(s, p));
  const canonical = (p: string) => recents.find((r) => samePath(r, p)) ?? p;

  let next = shown.filter(inRecents).map(canonical);
  const newest = recents[0];
  if (newest && !inList(next, newest)) next = [newest, ...next];
  for (const p of recents) {
    if (next.length >= limit) break;
    if (!inList(next, p)) next.push(p);
  }
  return next.slice(0, limit);
}

function RecentDock({
  ctxPath,
  fileItems,
}: {
  ctxPath: MutableRefObject<string | null>;
  fileItems: ContextMenuItem[];
}) {
  const t = useT();
  const recents = treeStore.recentOpened;
  const shownRef = useRef<string[]>([]);
  const preview = reconcileRecentPreview(shownRef.current, recents, RECENT_PREVIEW);
  shownRef.current = preview;

  function onFileSelect(id: string) {
    const path = ctxPath.current;
    if (!path) return;
    if (id === "open") treeStore.openFile(path);
    else if (id === "reveal") void showInFolder(path);
    else if (id === "vscode") void openInVscode(path).catch(() => {});
    else if (id === "trash") void trashFile(path);
    else if (id === "forget") treeStore.forgetFile(path);
  }

  return (
    <section className="recent-dock">
      <div className="vault-head">
        <span className="vault-name">{t("recentOpened")}</span>
      </div>
      <ContextMenu items={fileItems} label={t("fileActions")} className="tree-ctx" onSelect={onFileSelect}>
        <div
          className="recent-list"
          onContextMenu={(e) => {
            const row = (e.target as HTMLElement).closest("[data-id]");
            ctxPath.current = row?.getAttribute("data-id") ?? null;
          }}>
          {preview.length > 0 ? (
            <ul className="recent-preview">
              {preview.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    className="recent-item"
                    data-id={path}
                    title={path}
                    onClick={() => treeStore.openFile(path)}>
                    <span className="name">{folderName(path)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">{t("emptyRecent")}</p>
          )}
          <button type="button" className="recent-more" onClick={() => tabStore.openLibrary()}>
            {t("moreRecents")}
          </button>
        </div>
      </ContextMenu>
    </section>
  );
}

export function Sidebar() {
  useStoreVersion(tabStore);
  useStoreVersion(treeStore);
  useStoreVersion(settingsStore);
  const t = useT();
  const workspaceKey = treeStore.workspaceRoots.join("\0");
  const ctxPath = useRef<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const treeItems = useNewItems<HTMLDivElement>({
    itemCount: treeStore.fileCount,
    anchor: "top",
  });

  useEffect(() => {
    void treeStore.refresh();
  }, [workspaceKey]);

  const firstLoad = treeStore.loading && treeStore.placeTrees.length === 0 && treeStore.workspaceRoots.length > 0;
  const { showSkeleton } = useSkeletonSwap({ ready: !firstLoad });
  const SKELETON_W = [88, 95, 80, 92, 85, 70];

  const revealLabel = revealFolderLabel();

  const fileCtx: ContextMenuItem[] = [
    { id: "open", label: t("open") },
    { id: "rename", label: t("rename") },
    { id: "reveal", label: revealLabel },
    { type: "separator", id: "sep" },
    { id: "vscode", label: t("openInVscode") },
    { type: "separator", id: "sep-trash" },
    { id: "trash", label: trashLabel(), danger: true },
  ];

  const recentFileCtx: ContextMenuItem[] = [
    ...fileCtx,
    { type: "separator", id: "sep2" },
    { id: "forget", label: t("removeFromRecent") },
  ];

  const defaultHead: ContextMenuItem[] = [
    { id: "reveal", label: revealLabel },
    { id: "change-default", label: t("changeDefaultWorkspace") },
    { type: "separator", id: "sep" },
    { id: "add", label: t("addWorkspaceEllipsis") },
    { id: "refresh", label: t("rescan") },
  ];

  const extraHead: ContextMenuItem[] = [
    { id: "reveal", label: revealLabel },
    { id: "forget", label: t("removeWorkspace") },
    { type: "separator", id: "sep" },
    { id: "add", label: t("addWorkspaceEllipsis") },
    { id: "refresh", label: t("rescan") },
  ];

  const show = settingsStore.settings.sidebarVisible;
  const sections = treeStore.sections;

  return (
    <aside
      className={show ? "sidebar" : "sidebar hidden"}
      style={{ width: show ? SB_W : 0 }}
      aria-hidden={!show}>
      <div className="inner" style={{ opacity: show ? 1 : 0 }}>
        <WindowDragRegion className="sidebar-drag" />
        <button className="search" onClick={() => (tabStore.searchOpen = true)}>
          <MovingIcon icon={SearchIcon} size={13} />
          <span className="grow">{t("search")}</span>
          <span className="kbd">{modKey}K</span>
        </button>

        <div className="folder-root" {...treeItems.scrollProps}>
          <NewItemsPill count={treeItems.unread} onJump={treeItems.jump} label={(n) => t("nNewFiles", { n })} />
          {showSkeleton ? (
            <div className="tree-skeleton" aria-hidden>
              {SKELETON_W.map((w, i) => (
                <span key={i} style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <LayoutGroup id="sidebar-trees">
              <div className={treeStore.loading ? "vaults loading" : "vaults"}>
                {sections.map((section) => (
                  <VaultTree
                    key={section.id}
                    section={section}
                    ctxPath={ctxPath}
                    renamingId={renamingId}
                    setRenamingId={setRenamingId}
                    fileItems={fileCtx}
                    headItems={section.kind === "default" ? defaultHead : extraHead}
                  />
                ))}
                {treeStore.error && <p className="empty">{treeStore.error}</p>}
              </div>
            </LayoutGroup>
          )}
        </div>

        <RecentDock ctxPath={ctxPath} fileItems={recentFileCtx} />

        <div className="footer">
          <FootButton ariaLabel={t("newDocument")} onClick={() => void tabStore.newTab()}>
            <MovingIcon icon={PlusIcon} size={15} fill />
          </FootButton>
          <FootButton ariaLabel={t("addWorkspace")} onClick={() => void treeStore.addWorkspace()}>
            <MovingIcon icon={FolderOpenIcon} size={15} fill />
          </FootButton>
          <FootButton ariaLabel={t("settings")} onClick={() => (tabStore.settingsOpen = true)}>
            <MovingIcon icon={SlidersHorizontalIcon} size={15} fill />
          </FootButton>
          <FootButton
            ariaLabel={settingsStore.settings.theme === "coconut-dark" ? t("lightMode") : t("darkMode")}
            pressed={settingsStore.settings.theme === "coconut-dark"}
            onClick={() =>
              settingsStore.update(
                "theme",
                settingsStore.settings.theme === "coconut-dark" ? "coconut" : "coconut-dark",
              )
            }>
            <MovingIcon
              icon={settingsStore.settings.theme === "coconut-dark" ? SunIcon : MoonIcon}
              size={15}
              fill
            />
          </FootButton>
        </div>
      </div>
    </aside>
  );
}
