/**
 * 设置抽屉直测页脚本(非 Tauri):程序性挂载 App 并打开设置抽屉,
 * 验证滚动与主题组移除(绕开 IAB 交互通道不可靠的问题)。
 */
import "./mock-tauri";
import { mount } from "svelte";
import { settingsStore } from "./lib/settings/settingsStore.svelte";
import { registerAll } from "./ipc/events";
import App from "./App.svelte";

const log = (msg: string) => {
  const el = document.getElementById("log")!;
  el.textContent += `[${new Date().toISOString().slice(11, 23)}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
};

window.addEventListener("error", (e) => log(`PAGE ERROR: ${e.message}`));

await settingsStore.init();
await registerAll();
mount(App, { target: document.body });

// 程序性打开设置抽屉
await new Promise((r) => setTimeout(r, 500));
import { tabStore } from "./lib/tabs/tabStore.svelte";
tabStore.settingsOpen = true;
await new Promise((r) => setTimeout(r, 800));

const drawer = document.querySelector(".drawer") as HTMLElement | null;
if (!drawer) {
  log("DRAWER: NOT FOUND");
} else {
  const cs = getComputedStyle(drawer);
  const labels = Array.from(drawer.querySelectorAll(".group-label")).map((g) => g.textContent);
  log(`DRAWER: overflowY=${cs.overflowY}, height=${drawer.clientHeight}, scrollHeight=${drawer.scrollHeight}`);
  log(`DRAWER groups: ${labels.join(" / ")}`);
  log(`DRAWER has theme grid: ${drawer.querySelector(".theme-grid") ? "YES(FAIL)" : "NO(OK)"}`);
  log(`DRAWER scrollable: ${cs.overflowY === "auto" && drawer.scrollHeight > drawer.clientHeight ? "OK" : "CHECK"}`);
}

log("DRAWER DONE");
