import { load, type Store } from "@tauri-apps/plugin-store";
import { syncRecentMenu } from "../../ipc/commands";
import { rewritePrefix as rewritePath, samePath, uniquePaths, isInside } from "./paths";

/** 最近文件列表(上限 20 条),读写 tauri-plugin-store 的 recent.json */
const KEY = "recent";
const MAX = 20;

/** 单例:每次 load() 会各自读盘,push 未落盘时 list 会读到旧数据 */
let storePromise: Promise<Store> | null = null;

function store(): Promise<Store> {
  storePromise ??= load("recent.json", { autoSave: true });
  return storePromise;
}

export async function push(path: string): Promise<string[]> {
  const s = await store();
  const list = (await s.get<string[]>(KEY)) ?? [];
  const next = uniquePaths([path, ...list.filter((p) => !samePath(p, path))]).slice(0, MAX);
  await s.set(KEY, next);
  // 同步原生菜单"打开最近"子菜单(失败静默,不影响主流程)
  void syncRecentMenu().catch(() => {});
  return next;
}

export async function list(): Promise<string[]> {
  const s = await store();
  return uniquePaths((await s.get<string[]>(KEY)) ?? []);
}

export async function remove(path: string): Promise<void> {
  const s = await store();
  const list = (await s.get<string[]>(KEY)) ?? [];
  const next = list.filter((p) => !samePath(p, path));
  if (next.length === list.length) return;
  if (next.length) await s.set(KEY, next);
  else await s.delete(KEY);
  void syncRecentMenu().catch(() => {});
}

export async function removeUnder(path: string): Promise<void> {
  const s = await store();
  const list = (await s.get<string[]>(KEY)) ?? [];
  const next = list.filter((p) => !samePath(p, path) && !isInside(p, path));
  if (next.length === list.length) return;
  if (next.length) await s.set(KEY, next);
  else await s.delete(KEY);
  void syncRecentMenu().catch(() => {});
}

export async function clear(): Promise<void> {
  const s = await store();
  await s.delete(KEY);
}

/** 文件或文件夹改名后,同步最近列表里的路径 */
export async function rewritePrefix(from: string, to: string): Promise<void> {
  const s = await store();
  const list = (await s.get<string[]>(KEY)) ?? [];
  const next = list.map((p) => rewritePath(p, from, to));
  if (next.some((p, i) => p !== list[i])) {
    await s.set(KEY, next);
    void syncRecentMenu().catch(() => {});
  }
}
