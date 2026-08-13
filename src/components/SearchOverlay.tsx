/**
 * 搜索浮层(⌘K):interior CommandPalette 重做 —— 模糊匹配(子序列评分)、
 * 键盘导航、滚动跟随、遮罩层与退场动画全部内置。
 * 数据源:已打开 tab(切换)+ 历史文档 recent.json(打开)。
 */
import { useEffect, useState } from "react";
import { CommandPalette, type CommandItem } from "./interior/command-palette";
import { tabStore } from "../lib/tabs/tabStore";
import { list as listRecent } from "../lib/files/recent";
import { basename } from "../lib/utils/platform";
import { useStoreVersion } from "../lib/react/reactive";

export function SearchOverlay() {
  useStoreVersion(tabStore);
  const [recents, setRecents] = useState<string[]>([]);
  const open = tabStore.searchOpen;

  useEffect(() => {
    void listRecent().then(setRecents);
  }, []);

  // 面板打开时聚焦输入框(CommandPalette 的 surface 随 open 挂载,
  // autoFocus 只在自身挂载时生效,这里显式补一次)
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('[role="combobox"]')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const items: CommandItem[] = [
    // 已打开的 tab 优先(选中 → 切换)
    ...tabStore.tabs.map((tab) => ({
      id: `tab:${tab.id}`,
      label: tab.session.title,
      hint: tab.session.path ?? "未命名文档",
      keywords: tab.session.path ?? tab.session.title,
    })),
    // 历史文档(未打开 → 打开)
    ...recents
      .filter((path) => !tabStore.tabs.some((t) => t.session.path === path))
      .map((path) => ({
        id: `recent:${path}`,
        label: basename(path),
        hint: path,
        keywords: path,
      })),
  ];

  return (
    <CommandPalette
      open={open}
      onDismiss={() => (tabStore.searchOpen = false)}
      onSelect={(item) => {
        tabStore.searchOpen = false;
        if (item.id.startsWith("tab:")) {
          tabStore.activate(item.id.slice(4));
        } else {
          // 历史文档:hint 即完整路径
          void tabStore.openPath(item.hint ?? item.id.slice("recent:".length));
        }
      }}
      items={items}
      placeholder="搜索历史文档…"
      emptyLabel="没有找到匹配的文档"
      label="搜索"
      maxRows={6}
    />
  );
}
