import { load, type Store } from "@tauri-apps/plugin-store";
import { syncRecentMenu } from "../../ipc/commands";

/** 最近文件列表(上限 20 条),读写 tauri-plugin-store 的 recent.json */
const KEY = "recent";
const MAX = 20;

async function store(): Promise<Store> {
  return load("recent.json", { autoSave: true });
}

export async function push(path: string): Promise<void> {
  const s = await store();
  const list = (await s.get<string[]>(KEY)) ?? [];
  const next = [path, ...list.filter((p) => p !== path)].slice(0, MAX);
  await s.set(KEY, next);
  // 同步原生菜单"打开最近"子菜单(失败静默,不影响主流程)
  void syncRecentMenu().catch(() => {});
}

export async function list(): Promise<string[]> {
  const s = await store();
  return (await s.get<string[]>(KEY)) ?? [];
}

export async function clear(): Promise<void> {
  const s = await store();
  await s.delete(KEY);
}
