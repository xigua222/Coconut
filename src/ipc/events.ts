/**
 * IPC 层:所有 Rust → 前端事件的监听注册与类型定义。
 */
import { listen } from "@tauri-apps/api/event";
import { tabStore } from "../lib/tabs/tabStore";
import { settingsStore } from "../lib/settings/settingsStore";
import { openInVscode, showInFolder } from "./commands";
import { exportCurrentHtml, exportCurrentPdf } from "../lib/files/export";

export interface OpenFilePayload {
  path: string;
}

/** open_router.rs:双击关联文件 / 二次启动转发 / macOS Opened */
export function onOpenFile(cb: (payload: OpenFilePayload) => void): Promise<() => void> {
  return listen<OpenFilePayload>("open-file", (e) => cb(e.payload));
}

interface MenuPayload {
  action: string;
}

/** 原生菜单事件(app_menu.rs emit)分发到对应动作 */
function dispatchMenu(action: string): void {
  const session = tabStore.activeTab?.session ?? null;
  switch (action) {
    case "new":
      tabStore.newTab();
      break;
    case "open":
      void tabStore.openFiles();
      break;
    case "save":
      void tabStore.saveActive();
      break;
    case "save-as":
      void tabStore.saveAsActive();
      break;
    case "close-tab":
      if (tabStore.activeId) void tabStore.close(tabStore.activeId);
      break;
    case "toggle-outline":
      settingsStore.update("outlineVisible", !settingsStore.settings.outlineVisible);
      break;
    case "reload":
      void session?.reloadFromDisk();
      break;
    case "find":
      session?.editor?.find.open();
      break;
    case "toggle-source":
      session?.toggleMode();
      break;
    case "undo":
    case "redo":
    case "select-all":
      runEditorCommand(action);
      break;
    case "cut":
    case "copy":
    case "paste":
      // 系统级剪贴板命令;编辑器内 copy 会被 richCopy 拦截为富文本复制
      document.execCommand(action);
      break;
    case "settings":
      tabStore.settingsOpen = true;
      break;
    case "export-html":
      if (session) void exportCurrentHtml(session);
      break;
    case "export-pdf":
      if (session) void exportCurrentPdf(session);
      break;
    case "show-in-finder":
      if (session?.path) void showInFolder(session.path);
      break;
    case "open-in-vscode":
      if (session?.path) {
        void openInVscode(session.path).catch(() => {
          // VS Code 未注册 vscode:// 时静默失败(状态栏有保存状态可参考)
          console.warn("open in VS Code failed: vscode:// handler not registered");
        });
      }
      break;
  }
}

/** 注册全部监听;返回 Promise,等待全部 listen 的 IPC 注册完成 */
export async function registerAll(): Promise<void> {
  await onOpenFile(({ path }) => void tabStore.openPath(path));
  await listen<MenuPayload>("menu", ({ payload }) => dispatchMenu(payload.action));
}

/**
 * 编辑命令(撤销/重做/全选):焦点在编辑器时走 PM 命令(与编辑器内部
 * undo 栈一致);在 textarea 等原生控件时回退到系统命令。
 */
function runEditorCommand(cmd: "undo" | "redo" | "select-all"): void {
  const editor = tabStore.activeTab?.session.editor;
  const inEditor = document.activeElement?.closest?.(".ProseMirror") != null;
  if (editor && inEditor) {
    if (cmd === "undo") editor.undo();
    else if (cmd === "redo") editor.redo();
    else editor.selectAll();
  } else {
    document.execCommand(cmd === "select-all" ? "selectAll" : cmd);
  }
}
