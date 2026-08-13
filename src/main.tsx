import "./app.css";
import "./components.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { settingsStore } from "./lib/settings/settingsStore";
import { registerAll } from "./ipc/events";
import { frontendReady } from "./ipc/commands";

/**
 * 启动序列(顺序固定):
 * 1. 读设置(tauri-plugin-store)
 * 2. 注册 Rust → 前端事件监听(await 完成,确保 IPC 注册先于握手)
 * 3. 挂载 App
 * 4. 通知 Rust "前端就绪",Rust 收到后才 flush 启动时携带的文件路径,
 *    解决"事件在监听器注册前发出而丢失"的经典竞态。
 */
async function bootstrap() {
  try {
    await settingsStore.init();
  } catch (e) {
    // 设置损坏不阻塞启动,回落默认值
    console.error("settings init failed", e);
  }
  // 关键:必须先等 listen 的 IPC 注册完成,再发 frontend_ready,
  // 否则 Rust 端 emit 的 open-file 可能先于监听器到达而丢失
  await registerAll();
  createRoot(document.getElementById("app")!).render(<App />);
  try {
    await frontendReady();
  } catch (e) {
    // 非 Tauri 环境(纯浏览器调试)时忽略
    console.warn("frontend_ready failed(非 Tauri 环境?)", e);
  }
}

void bootstrap();
