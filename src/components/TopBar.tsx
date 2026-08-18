/**
 * 顶栏:左=侧栏,中=标签轨道(铺满编辑区),右=文档操作;大纲列单独留白对齐。
 * 按压反馈:interior usePressDepth;hidden 由 App 的 hide-on-scroll 驱动。
 */
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  AlignLeftIcon,
  ChevronsLeftRightIcon,
  DownloadIcon,
  FileTextIcon,
  FolderOpenIcon,
  ListIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  TerminalIcon,
  XIcon,
} from "lucide-animated";
import { WindowDragRegion } from "../lib/window/fill";
import { tabStore } from "../lib/tabs/tabStore";
import { tabLabels } from "../lib/tabs/labels";
import { settingsStore } from "../lib/settings/settingsStore";
import { exportCurrentHtml, exportCurrentPdf } from "../lib/files/export";
import { showInFolder } from "../ipc/commands";
import { modKey } from "../lib/utils/platform";
import { useT, revealFolderLabel } from "../lib/i18n";
import { useStoreVersion } from "../lib/react/reactive";
import { usePressDepth } from "./interior/press-depth";
import { Tabs } from "./interior/tabs";
import { CopyButton, useCopyToClipboard } from "./interior/copy-button";
import { Tooltip, TooltipGroup } from "./interior/tooltip-group";
import { Popover } from "./interior/popover";
import { ContextMenu, type ContextMenuItem } from "./interior/context-menu";
import { MovingIcon } from "./MovingIcon";

/** 顶栏图标按钮:usePressDepth 提供按下缩放反馈(不改变既有视觉) */
function ActButton({
  ariaLabel,
  className,
  onClick,
  children,
}: {
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
      aria-label={ariaLabel}
      onClick={onClick}
      animate={{ scale: pressed ? 0.86 : 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.45 }}>
      {children}
    </motion.button>
  );
}

function DocumentTabs() {
  useStoreVersion(tabStore);
  const t = useT();
  const [, bump] = useState(0);
  /** 右键落在哪个标签上;菜单由外层 ContextMenu 在冒泡阶段打开 */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const { copy } = useCopyToClipboard();
  const tabIds = tabStore.tabs.map((tab) => tab.id).join("\0");

  useEffect(() => {
    const unsubs = tabStore.tabs
      .map((tab) => tab.session?.subscribe(() => bump((n) => n + 1)))
      .filter((unsub): unsub is () => void => !!unsub);
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [tabIds]);

  const tabs = tabStore.tabs;
  const target = tabs.find((tab) => tab.id === menuFor) ?? null;
  const targetIndex = tabs.findIndex((tab) => tab.id === menuFor);
  const targetPath = target?.session?.path ?? null;

  const menuItems: ContextMenuItem[] = [
    { id: "close", label: t("closeTab"), shortcut: `${modKey}W`, disabled: !target },
    { id: "close-others", label: t("closeOtherTabs"), disabled: !target || tabs.length < 2 },
    {
      id: "close-right",
      label: t("closeTabsToRight"),
      disabled: targetIndex < 0 || targetIndex >= tabs.length - 1,
    },
    { id: "close-all", label: t("closeAllTabs") },
    { type: "separator", id: "sep" },
    { id: "copy-path", label: t("copyPath"), disabled: !targetPath },
    { id: "reveal", label: revealFolderLabel(), disabled: !targetPath },
  ];

  function onMenuSelect(id: string): void {
    if (id === "close-all") {
      void tabStore.closeAll();
      return;
    }
    if (!menuFor) return;
    if (id === "close") void tabStore.close(menuFor);
    else if (id === "close-others") void tabStore.closeOthers(menuFor);
    else if (id === "close-right") void tabStore.closeToRight(menuFor);
    else if (id === "copy-path" && targetPath) void copy(targetPath);
    else if (id === "reveal" && targetPath) void showInFolder(targetPath);
  }

  if (!tabs.length) {
    return <span className="title dim">coconut</span>;
  }

  const labels = tabLabels(tabs, { untitled: t("untitled"), library: t("recentOpened") });
  const items = tabs.map((tab) => {
    const meta = labels.get(tab.id);
    return { value: tab.id, label: meta?.label ?? t("untitled"), hint: meta?.hint };
  });

  return (
    <ContextMenu
      items={menuItems}
      label={t("tabActions")}
      className="tabs-ctx"
      onSelect={onMenuSelect}>
      <div className="tabs">
        <Tabs
          className="doc-tabs"
          items={items}
          value={tabStore.activeId ?? items[0].value}
          onValueChange={(id) => tabStore.activate(id)}
          onReorder={(ids) => tabStore.reorder(ids)}
          onTabContextMenu={setMenuFor}
          onTabAuxClick={(id) => void tabStore.close(id)}
          activation="manual"
          label={t("openDocs")}
          trailing={
            <ActButton
              className="tab-add"
              ariaLabel={t("newDocument")}
              onClick={() => void tabStore.newTab()}>
              <MovingIcon icon={PlusIcon} size={14} />
            </ActButton>
          }
          renderTabEnd={(item) => {
            const dirty = tabs.find((tab) => tab.id === item.value)?.session?.dirty ?? false;
            return (
              <span className={dirty ? "tab-end dirty" : "tab-end"}>
                <span className="tab-dot" aria-hidden />
                <span
                  className="tab-close"
                  role="button"
                  aria-label={dirty ? `${t("closeTab")}(${t("unsaved")})` : t("closeTab")}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void tabStore.close(item.value);
                  }}>
                  <MovingIcon icon={XIcon} size={11} />
                </span>
              </span>
            );
          }}
        />
      </div>
    </ContextMenu>
  );
}

export function TopBar({ hidden = false }: { hidden?: boolean }) {
  useStoreVersion(tabStore);
  useStoreVersion(settingsStore);
  const t = useT();

  const { sidebarVisible, outlineVisible } = settingsStore.settings;
  const session = tabStore.activeTab?.session ?? null;
  useStoreVersion(session);

  const showInFolderLabel = revealFolderLabel();

  function toggleSidebar() {
    settingsStore.update("sidebarVisible", !sidebarVisible);
  }

  function toggleOutline() {
    settingsStore.update("outlineVisible", !outlineVisible);
  }

  return (
    <motion.header
      className={session && outlineVisible ? "topbar has-outline" : "topbar"}
      aria-hidden={hidden}
      initial={false}
      animate={{ height: hidden ? 0 : "var(--topbar-h)", opacity: hidden ? 0 : 1 }}
      transition={{ type: "spring", stiffness: 150, damping: 27, mass: 1 }}
      style={{ pointerEvents: hidden ? "none" : undefined }}>
      <WindowDragRegion className="titlebar-drag" />
      <TooltipGroup className="leading" openDelay={220} closeDelay={80} skipDelay={280}>
        <Tooltip label={`${sidebarVisible ? t("hideSidebar") : t("showSidebar")} (${modKey}\\)`} side="bottom">
          <span className="act-wrap">
            <ActButton
              ariaLabel={sidebarVisible ? t("hideSidebar") : t("showSidebar")}
              onClick={toggleSidebar}>
              <MovingIcon
                icon={sidebarVisible ? PanelLeftCloseIcon : PanelLeftOpenIcon}
                size={14}
                fill
              />
            </ActButton>
          </span>
        </Tooltip>
      </TooltipGroup>

      <DocumentTabs />

      {session && (
        <TooltipGroup className="actions" openDelay={220} closeDelay={80} skipDelay={280}>
          <Tooltip label={outlineVisible ? t("hideOutline") : t("showOutline")} side="bottom">
            <span className="act-wrap">
              <ActButton
                ariaLabel={outlineVisible ? t("hideOutline") : t("showOutline")}
                onClick={toggleOutline}>
                <MovingIcon icon={ListIcon} size={14} fill />
              </ActButton>
            </span>
          </Tooltip>

          <span className="toolbar-divider" aria-hidden />

          <Tooltip label={session.mode === "source" ? `${t("wysiwyg")} (⌘E)` : `${t("sourceMode")} (⌘E)`} side="bottom">
            <span className="act-wrap">
              <ActButton
                className={session.mode === "source" ? "on" : undefined}
                ariaLabel={session.mode === "source" ? t("wysiwyg") : t("sourceMode")}
                onClick={() => session.toggleMode()}>
                <MovingIcon
                  icon={session.mode === "source" ? ChevronsLeftRightIcon : AlignLeftIcon}
                  size={14}
                  fill
                />
              </ActButton>
            </span>
          </Tooltip>

          <Tooltip label={t("copyAll")} side="bottom">
            <span className="act-wrap">
              <CopyButton
                className="copy-act"
                value={session.md}
                label={t("copy")}
                copiedLabel={t("copied")}
                errorLabel={t("copyFailed")}
              />
            </span>
          </Tooltip>

          <Tooltip label={t("export")} side="bottom">
            <span className="act-wrap">
              <Popover
                trigger={<MovingIcon icon={DownloadIcon} size={14} fill />}
                triggerClassName="act export-trigger"
                label={t("export")}
                side="bottom"
                align="end"
                className="export-pop">
                <button
                  type="button"
                  onClick={() => void exportCurrentHtml(session)}>
                  <MovingIcon icon={TerminalIcon} size={12} />
                  <span>{t("exportHtmlEllipsis")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void exportCurrentPdf(session)}>
                  <MovingIcon icon={FileTextIcon} size={12} />
                  <span>{t("exportPdfEllipsis")}</span>
                </button>
              </Popover>
            </span>
          </Tooltip>

          {session.path && (
            <Tooltip label={showInFolderLabel} side="bottom">
              <span className="act-wrap">
                <ActButton
                  ariaLabel={showInFolderLabel}
                  onClick={() => void showInFolder(session.path!)}>
                  <MovingIcon icon={FolderOpenIcon} size={14} fill />
                </ActButton>
              </span>
            </Tooltip>
          )}
        </TooltipGroup>
      )}
    </motion.header>
  );
}
