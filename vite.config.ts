import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 手动分包策略:主 chunk 只含 Crepe 核心 + 外围 UI;
// math / mermaid / 代码高亮语言包由 createEditor.ts / lazyFeatures.ts 的
// 动态 import 触发,交由 Vite 自动拆包,这里不再额外干预。
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    // Crepe 核心较大,这是预期的,不报警告噪音
    chunkSizeWarningLimit: 800,
  },
});
