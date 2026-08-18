/** 标签文案:同名文件补一层父目录,避免一排「未命名.md」认不出谁是谁。 */

import { dirname, folderName } from "../files/paths";
import type { Tab } from "./types";

export interface TabLabel {
  /** 标签上显示的文字 */
  label: string;
  /** 悬停提示:完整路径 */
  hint: string;
}

export function tabLabels(
  tabs: Tab[],
  fallback: { untitled: string; library: string },
): Map<string, TabLabel> {
  const bare = new Map<string, string>();
  const seen = new Map<string, number>();

  for (const tab of tabs) {
    const name = tab.session ? tab.session.title || fallback.untitled : fallback.library;
    bare.set(tab.id, name);
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }

  const out = new Map<string, TabLabel>();
  for (const tab of tabs) {
    const name = bare.get(tab.id) ?? fallback.untitled;
    const path = tab.session?.path ?? null;
    const parent = path ? folderName(dirname(path)) : "";
    const collides = (seen.get(name) ?? 0) > 1;
    out.set(tab.id, {
      label: collides && parent ? `${parent}/${name}` : name,
      hint: path ?? name,
    });
  }
  return out;
}
