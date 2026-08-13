/**
 * IPC 层:前端 ↔ Rust 的全部 invoke 触点。
 * 前端其他文件禁止直接 `invoke`,只能从这里 import。
 */
import { invoke } from "@tauri-apps/api/core";

export interface ReadResult {
  content: string;
  encoding: string;
  mtime: number;
}

export interface WriteResult {
  mtime: number;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  depth: number;
}

/** 写盘时 mtime 与磁盘不一致(文件被外部修改) */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

interface CommandError {
  kind?: string;
  message?: string;
}

function messageOf(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as CommandError).message ?? "");
  }
  return typeof e === "string" ? e : String(e);
}

function isConflict(e: unknown): boolean {
  return !!(e && typeof e === "object" && (e as CommandError).kind === "conflict");
}

/** read_document:编码检测转 UTF-8,返回 { content, encoding, mtime } */
export function readDocument(path: string): Promise<ReadResult> {
  return invoke<ReadResult>("read_document", { path });
}

/**
 * write_document:原子写。expectedMtime 为 null 表示不做校验(强制写,
 * 用于"保留当前版本(覆盖)"与另存为)。mtime 不匹配抛 ConflictError。
 */
export async function writeDocument(
  path: string,
  content: string,
  expectedMtime: number | null,
): Promise<WriteResult> {
  try {
    return await invoke<WriteResult>("write_document", { path, content, expectedMtime });
  } catch (e) {
    if (isConflict(e)) throw new ConflictError(messageOf(e));
    throw new Error(messageOf(e));
  }
}

/** scan_directory:递归列出目录与 Markdown 文件(文件列表面板) */
export function scanDirectory(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("scan_directory", { path });
}

/** export_html:comrak 渲染(可选功能,设置面板导出) */
export function exportHtml(content: string): Promise<string> {
  return invoke<string>("export_html", { content });
}

/** frontend_ready:启动握手,通知 Rust flush 挂起的打开请求 */
export function frontendReady(): Promise<void> {
  return invoke("frontend_ready");
}

/** 在文件夹中显示(走 opener 插件 revealItemInDir) */
export async function showInFolder(path: string): Promise<void> {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

/**
 * 在 VS Code 中打开(vscode:// 深链;需要 VS Code 注册了协议处理)。
 * 失败抛错,由调用方提示。
 */
export async function openInVscode(path: string): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(`vscode://file/${encodeURIComponent(path)}`);
}

/** 最近文件变化后通知 Rust 重建"打开最近"菜单 */
export async function syncRecentMenu(): Promise<void> {
  await invoke("sync_recent_menu");
}
