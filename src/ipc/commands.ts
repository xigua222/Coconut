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

export type SearchKind = string;

export interface LiveSearchDoc {
  id: string;
  title: string;
  path: string;
  body: string;
  kind: SearchKind;
}

export interface SearchHit {
  id: string;
  title: string;
  path: string;
  kind: SearchKind;
  snippet: string;
  score: number;
}

/** 把工作区、最近文件、已打开标签同步进 Tantivy 内存索引 */
export function searchSync(payload: {
  roots: string[];
  extraFiles: { path: string; kind: SearchKind }[];
  liveDocs: LiveSearchDoc[];
}): Promise<void> {
  return invoke("search_sync", { payload });
}

/** 在已同步的 Tantivy 索引上查询 */
export function searchQuery(query: string): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_query", { query });
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

/** 同目录改名,返回改完后的绝对路径 */
export function renamePath(from: string, toName: string): Promise<string> {
  return invoke<string>("rename_path", { from, toName });
}

/** 移到系统废纸篓/回收站 */
export function trashPath(path: string): Promise<void> {
  return invoke("trash_path", { path });
}

export interface FileStat {
  path: string;
  size: number | null;
  mtime: number | null;
}

/** 批量读文件大小与修改时间;缺失文件 size/mtime 为 null */
export function statFiles(paths: string[]): Promise<FileStat[]> {
  return invoke<FileStat[]>("stat_files", { paths });
}

/** scan_directory:递归列出目录与 Markdown 文件(文件列表面板) */
export function scanDirectory(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("scan_directory", { path });
}

/** 确保「文档/coconut」默认工作区存在,返回路径 */
export function ensureDefaultWorkspace(): Promise<string> {
  return invoke<string>("ensure_default_workspace");
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
