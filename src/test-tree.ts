/**
 * 目录面板直测页脚本(非 Tauri):验证 treeStore 的扫描/展开/可见性逻辑
 * (scan_directory 走 mock 样例树)。
 */
import "./mock-tauri";
import "./app.css";
import { settingsStore } from "./lib/settings/settingsStore.svelte";
import { treeStore } from "./lib/files/treeStore.svelte";

const log = (msg: string) => {
  const el = document.getElementById("log")!;
  el.textContent += `[${new Date().toISOString().slice(11, 23)}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
};

window.addEventListener("error", (e) => log(`PAGE ERROR: ${e.message}`));

await settingsStore.init();
settingsStore.update("folderRoot", "/mock/docs");
await treeStore.refresh();

const names = treeStore.entries.map((e) => `${e.name}@${e.depth}${e.is_dir ? "/" : ""}`).join(", ");
log(`scan entries: ${names}`);
log(`visible(根未展开): ${treeStore.visible.length} (应为 3: 两个文件 + 子目录)`);

treeStore.toggleDir("/mock/docs/子目录");
log(`visible(展开子目录): ${treeStore.visible.length} (应为 4,含笔记.md)`);
const hasNote = treeStore.visible.some((e) => e.name === "笔记.md");
log(`展开后可见笔记.md: ${hasNote ? "OK" : "FAIL"}`);

treeStore.toggleDir("/mock/docs/子目录");
log(`visible(再次折叠): ${treeStore.visible.length} (应为 3)`);

log("TREE DONE");
