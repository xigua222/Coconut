import { searchSync } from "../../ipc/commands";
import { tabStore } from "../tabs/tabStore";
import { findContainingPlace, samePath } from "./paths";
import { treeStore } from "./treeStore";

/** 把当前工作区、近期访问、已打开标签同步进 Rust 侧 Tantivy 索引 */
export async function syncSearchIndex(): Promise<void> {
  const roots = treeStore.workspaceRoots;
  const openPaths: string[] = [];
  const liveDocs = tabStore.tabs.flatMap((tab) => {
    const session = tab.session;
    if (!session) return [];
    const path = session.path ?? "";
    if (path) openPaths.push(path);
    return [
      {
        id: path || `tab:${tab.id}`,
        title: session.title,
        path,
        body: session.editor?.getMarkdown() ?? session.md,
        kind: "open" as const,
      },
    ];
  });
  await searchSync({
    roots,
    extraFiles: treeStore.recentAccess
      .filter((path) => !findContainingPlace(path, roots))
      .filter((path) => !openPaths.some((open) => samePath(open, path)))
      .map((path) => ({ path, kind: "recent" as const })),
    liveDocs,
  });
}
