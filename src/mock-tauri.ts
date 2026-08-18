/**
 * 浏览器 mock:Tauri 2 的 __TAURI_INTERNALS__,让完整应用 UI 在浏览器里运行。
 * 仅用于布局/交互调试(mock.html 入口),不参与生产构建。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const SAMPLE_MD = `# 测试文档

## 章节一

这是一段**加粗**和*斜体*文字,还有 \`行内代码\`。海南试点已落地。

- 列表项 1
- 列表项 2

### 公式

数学公式 $E = mc^2$ 行内展示。

\`\`\`mermaid
graph TD;
    A-->B;
\`\`\`

> 引用块内容

| 列1 | 列2 |
| --- | --- |
| a | b |
`;

type Handler = (payload: unknown) => void;

const eventHandlers = new Map<string, Handler[]>();
const callbackHandlers = new Map<number, (payload: unknown) => void>();
let callbackId = 0;

function transformCallback(cb: (payload: unknown) => void): number {
  const id = ++callbackId;
  callbackHandlers.set(id, cb);
  return id;
}

/** 供自动化测试触发事件(如 open-file);按 Tauri 格式包装成 Event 对象 */
(window as any).__mockEmit = (event: string, payload: unknown) => {
  const evt = { event, id: 0, payload };
  for (const h of eventHandlers.get(event) ?? []) h(evt);
};

/** mock store 的数据 */
const storeData = new Map<string, Record<string, unknown>>();
storeData.set("settings.json", {});
storeData.set("recent.json", { recent: ["/mock/coconut/文档一.md", "/mock/outside/火车上.md"] });

let storeCounter = 0;
/** rid → 文件名映射:客户端 load 拿到 rid 后,get/set 只传 rid+key */
const storePaths = new Map<number, string>();

(window as any).__TAURI_INTERNALS__ = {
  transformCallback,
  invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
    console.log("[mock invoke]", cmd, args);
    switch (cmd) {
      // ---- 事件 ----
      case "plugin:event|listen": {
        const event = String(args.event);
        const handler = callbackHandlers.get(Number(args.handler));
        if (handler) {
          const list = eventHandlers.get(event) ?? [];
          list.push(handler);
          eventHandlers.set(event, list);
        }
        return Promise.resolve();
      }
      case "plugin:event|unlisten":
        return Promise.resolve();

      // ---- 自定义 command ----
      case "read_document":
        return { content: SAMPLE_MD, encoding: "UTF-8", mtime: Date.now() };
      case "search_sync": {
        const payload = (args.payload as Record<string, unknown>) ?? args;
        const live = (payload.liveDocs as Array<Record<string, string>>) ?? [];
        const extra = (payload.extraFiles as Array<{ path: string; kind: string }>) ?? [];
        const merged = new Map<string, Record<string, string>>();
        const keyOf = (path: string, id: string) => (path || id).replace(/\\/g, "/").replace(/\/+$/, "");
        for (const f of extra) {
          const id = keyOf(f.path, f.path);
          if (!id || merged.has(id)) continue;
          merged.set(id, {
            id,
            title: f.path.split("/").pop() ?? f.path,
            path: f.path,
            body: f.path.includes("文档一") ? `${SAMPLE_MD}\n\n海南自贸港落地试点。` : SAMPLE_MD,
            kind: "recent",
          });
        }
        for (const d of live) {
          const id = keyOf(d.path ?? "", d.id ?? "");
          if (!id) continue;
          merged.set(id, { ...d, id, kind: "open" });
        }
        const rank = (kind: string) => (kind === "open" ? 0 : kind === "recent" ? 1 : 2);
        (window as any).__mockSearch = [...merged.values()].sort(
          (a, b) => rank(a.kind) - rank(b.kind) || String(a.title).localeCompare(String(b.title)),
        );
        return undefined;
      }
      case "search_query": {
        const q = String(args.query ?? "").trim().toLowerCase();
        if (!q) return [];
        const docs = ((window as any).__mockSearch as Array<Record<string, string>>) ?? [];
        const rank = (kind: string) => (kind === "open" ? 0 : kind === "recent" ? 1 : 2);
        const seen = new Set<string>();
        return docs
          .filter(
            (d) =>
              (d.title ?? "").toLowerCase().includes(q) ||
              (d.path ?? "").toLowerCase().includes(q) ||
              (d.body ?? "").toLowerCase().includes(q),
          )
          .map((d) => {
            const body = (d.body ?? "").replace(/\s+/g, " ");
            const at = body.toLowerCase().indexOf(q);
            const snippet =
              at < 0
                ? body.slice(0, 88)
                : `${at > 0 ? "…" : ""}${body.slice(Math.max(0, at - 24), at + q.length + 48).trim()}${
                    at + q.length + 48 < body.length ? "…" : ""
                  }`;
            return { id: d.id, title: d.title, path: d.path, kind: d.kind, snippet, score: 1 };
          })
          .filter((d) => {
            const key = (d.path || d.id).replace(/\\/g, "/").replace(/\/+$/, "");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => rank(a.kind) - rank(b.kind) || String(a.title).localeCompare(String(b.title)));
      }
      case "write_document":
        return { mtime: Date.now() };
      case "rename_path": {
        const from = String(args.from ?? "");
        const name = String(args.toName ?? "");
        const i = Math.max(from.lastIndexOf("/"), from.lastIndexOf("\\"));
        return i >= 0 ? `${from.slice(0, i)}/${name}` : name;
      }
      case "trash_path":
        return undefined;
      case "stat_files": {
        const paths = (args.paths as string[]) ?? [];
        const now = Date.now();
        return paths.map((path, i) => ({
          path,
          size: 1200 + i * 640,
          mtime: now - i * 3600_000,
        }));
      }
      case "export_html":
        return `<h1>导出</h1><p>${String(args.content ?? "").slice(0, 50)}</p>`;
      case "export_pdf":
        return undefined;
      case "frontend_ready":
        return undefined;
      case "sync_recent_menu":
        return undefined;
      case "ensure_default_workspace":
        return "/mock/coconut";
      case "scan_directory": {
        const root = String(args.path ?? "");
        return [
          { name: "文档一.md", path: `${root}/文档一.md`, is_dir: false, depth: 0 },
          { name: "文档二.md", path: `${root}/文档二.md`, is_dir: false, depth: 0 },
          { name: "子目录", path: `${root}/子目录`, is_dir: true, depth: 0 },
          { name: "笔记.md", path: `${root}/子目录/笔记.md`, is_dir: false, depth: 1 },
        ];
      }

      // ---- store 插件 ----
      case "plugin:store|load": {
        const path = String(args.path);
        storeData.set(path, storeData.get(path) ?? {});
        const rid = ++storeCounter;
        storePaths.set(rid, path);
        return rid;
      }
      case "plugin:store|get": {
        const data = storeData.get(storePaths.get(Number(args.rid)) ?? "") ?? {};
        const value = data[String(args.key)] ?? null;
        // 客户端约定响应为 [value, exists] 元组
        return [value, value !== null];
      }
      case "plugin:store|set": {
        const data = storeData.get(storePaths.get(Number(args.rid)) ?? "") ?? {};
        data[String(args.key)] = args.value;
        return undefined;
      }
      case "plugin:store|save":
        return undefined;
      case "plugin:store|delete": {
        const data = storeData.get(storePaths.get(Number(args.rid)) ?? "") ?? {};
        delete data[String(args.key)];
        return undefined;
      }

      // ---- window 插件 ----
      case "plugin:window|set_theme":
        return undefined;
      case "plugin:window|on_close_requested":
        return undefined;
      case "plugin:window|is_minimized":
        return false;
      case "plugin:window|is_maximized":
        return false;
      case "plugin:window|is_focused":
        return true;

      // ---- webview / 拖放 ----
      case "plugin:webview|on_drag_drop_event":
        return undefined;

      // ---- dialog ----
      case "plugin:dialog|open":
      case "plugin:dialog|save":
        return null;
      case "plugin:dialog|ask":
      case "plugin:dialog|confirm":
      case "plugin:dialog|message":
        return true;

      // ---- opener ----
      case "plugin:opener|reveal_item_in_dir":
      case "plugin:opener|open_url":
        return undefined;

      // ---- fs(导出 HTML 用)----
      case "plugin:fs|write_text_file":
      case "plugin:fs|watch":
        return undefined;

      default:
        console.warn("[mock invoke] 未处理:", cmd);
        return undefined;
    }
  },
  metadata: {
    currentWindow: { label: "main", title: "coconut" },
    currentWebview: { label: "main", windowLabel: "main" },
  },
};
