/**
 * 导出流程:HTML 存盘 / PDF(隐藏 WebView 原生打印对话框)。
 */
import type { DocumentSession } from "./document.svelte";
import { exportHtml } from "../../ipc/commands";
import { pickSavePath } from "../../ipc/dialogs";

/** 打印/导出用的最小化排版(类 GitHub 风格,固定白底,适配打印) */
const PRINT_STYLE = `
  body { max-width: 820px; margin: 0 auto; padding: 40px 24px;
         font: 15px/1.75 system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB",
               "Microsoft YaHei", "Segoe UI", sans-serif; color: #1f2328; }
  h1, h2, h3, h4 { margin: 1.2em 0 0.5em; line-height: 1.3; }
  h1 { font-size: 1.8em; border-bottom: 1px solid #d9dee3; padding-bottom: 0.3em; }
  h2 { font-size: 1.45em; border-bottom: 1px solid #d9dee3; padding-bottom: 0.25em; }
  code { background: #f0f2f5; border-radius: 4px; padding: 0.15em 0.4em;
         font: 0.9em "SF Mono", Menlo, Consolas, monospace; }
  pre { background: #f6f8fa; border-radius: 8px; padding: 14px 16px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0; padding: 0 1em; color: #57606a; border-left: 4px solid #d0d7de; }
  table { border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #d0d7de; padding: 6px 12px; }
  th { background: #f6f8fa; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #d0d7de; margin: 2em 0; }
  a { color: #0969da; }
  @media print { body { padding: 0; } }
`;

function buildPrintHtml(body: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>coconut 导出</title><style>${PRINT_STYLE}</style>
</head><body>${body}</body></html>`;
}

/** 导出当前文档为 HTML(保存对话框) */
export async function exportCurrentHtml(session: DocumentSession): Promise<void> {
  const base = session.title.replace(/\.(md|markdown|mdown|mkd|mdx)$/i, "");
  const picked = await pickSavePath(`${base}.html`);
  if (!picked) return;
  const html = buildPrintHtml(await exportHtml(session.md));
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  await writeTextFile(picked, html);
}

/**
 * 导出当前文档为 PDF:完整 HTML 交给 Rust 用隐藏 WebView 的原生打印对话框
 * (macOS 打印面板可"存储为 PDF");非 macOS 降级为浏览器打开后打印。
 */
export async function exportCurrentPdf(session: DocumentSession): Promise<void> {
  const html = buildPrintHtml(await exportHtml(session.md));
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("export_pdf", { html });
}
