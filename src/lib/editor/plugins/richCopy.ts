/**
 * 富文本复制:编辑器内 ⌘C/右键复制 → 剪贴板同时写入带内联样式的 HTML
 * 与纯文本,粘贴到公众号/微信/邮件等富文本编辑器格式完整保留。
 *
 * - 只拦截编辑器选区复制;CodeMirror 代码块内的复制保持纯文本(不动);
 * - 样式映射覆盖常用 Markdown 元素(标题/加粗/斜体/删除线/高亮/行内代码/
 *   代码块/引用/列表/表格/链接),用内联 style 而非 class(目标平台剥 class);
 * - clipboard API 优先,失败降级 contenteditable + execCommand。
 */
import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";

/** 元素 → 内联样式映射(键为大写标签名) */
const TAG_STYLES: Record<string, string> = {
  STRONG: "font-weight: bold;",
  B: "font-weight: bold;",
  EM: "font-style: italic;",
  I: "font-style: italic;",
  DEL: "text-decoration: line-through;",
  S: "text-decoration: line-through;",
  MARK: "background-color: #ffe58f; border-radius: 3px; padding: 0 2px; color: inherit;",
  CODE: 'font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; background-color: #f0f2f5; border-radius: 4px; padding: 0.15em 0.4em; font-size: 0.9em;',
  PRE: 'background-color: #f6f8fa; border-radius: 8px; padding: 14px 16px; overflow-x: auto; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 13px; line-height: 1.6;',
  A: "color: #0969da; text-decoration: underline;",
  H1: "font-size: 1.8em; font-weight: 600; margin: 1em 0 0.5em; line-height: 1.3;",
  H2: "font-size: 1.5em; font-weight: 600; margin: 1em 0 0.5em; line-height: 1.3;",
  H3: "font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; line-height: 1.3;",
  H4: "font-size: 1.1em; font-weight: 600; margin: 1em 0 0.5em;",
  H5: "font-size: 1em; font-weight: 600; margin: 1em 0 0.5em;",
  H6: "font-size: 0.9em; font-weight: 600; margin: 1em 0 0.5em;",
  BLOCKQUOTE: "border-left: 4px solid #d0d7de; padding-left: 12px; color: #57606a; margin: 1em 0;",
  UL: "margin: 0.5em 0; padding-left: 1.6em;",
  OL: "margin: 0.5em 0; padding-left: 1.6em;",
  LI: "margin: 0.25em 0;",
  TABLE: "border-collapse: collapse; margin: 1em 0;",
  TH: "border: 1px solid #d0d7de; padding: 6px 12px; background-color: #f6f8fa; font-weight: 600;",
  TD: "border: 1px solid #d0d7de; padding: 6px 12px;",
  TR: "border: 1px solid #d0d7de;",
  P: "margin: 0.5em 0;",
  HR: "border: none; border-top: 1px solid #d0d7de; margin: 1.5em 0;",
};

/** 给克隆的选区树逐元素补内联样式(覆盖已存在的 style 属性) */
function styleTree(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let el: Element | null;
  while ((el = walker.nextNode() as Element | null)) {
    const style = TAG_STYLES[el.tagName];
    if (style) {
      const cur = el.getAttribute("style") ?? "";
      el.setAttribute("style", cur ? `${cur}; ${style}` : style);
    }
  }
}

/** 从原始 DOM 的祖先链收集内联样式(导出供直测页验证) */
export function styleFromAncestors(node: Node): string {
  const styles: string[] = [];
  const walk = (el: HTMLElement | null): void => {
    while (el && el !== document.body) {
      if (el.tagName === "MARK") {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "transparent") {
          styles.push(`background-color: ${bg}; border-radius: 3px; padding: 0 2px; color: inherit;`);
        }
      } else {
        const s = TAG_STYLES[el.tagName];
        if (s) styles.push(s);
      }
      el = el.parentElement;
    }
  };
  // anchor 可能是元素本身(如 mark.hl),也可能是其中的文本节点 —— 只走一条链
  if (node.nodeType === Node.ELEMENT_NODE) walk(node as HTMLElement);
  else walk(node.parentElement);
  return styles.join(" ");
}

/** 剪贴板写入:clipboard API 优先,execCommand 兜底 */
async function writeClipboard(html: string, plain: string): Promise<void> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return;
    }
  } catch {
    // 权限/平台不支持 → 降级
  }
  const holder = document.createElement("div");
  holder.contentEditable = "true";
  holder.style.position = "fixed";
  holder.style.left = "-9999px";
  holder.style.top = "0";
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(holder);
  sel?.removeAllRanges();
  sel?.addRange(range);
  try {
    document.execCommand("copy");
  } finally {
    sel?.removeAllRanges();
    holder.remove();
  }
}

export const richCopyPlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey("MDREADER_RICH_COPY"),
      props: {
        handleDOMEvents: {
          copy: (_view, event) => {
            // 代码块(CodeMirror)内保持原样复制
            const target = event.target as HTMLElement | null;
            if (target?.closest(".cm-editor")) return false;
            // 以 DOM 选区为准(与"复制可见内容"语义一致;PM selection
            // 与 DOM selection 在部分场景会不同步,若用 PM 判断会漏拦)
            const domSel = window.getSelection();
            if (!domSel || domSel.rangeCount === 0 || domSel.isCollapsed) return false;

            const clone = document.createElement("div");
            clone.appendChild(domSel.getRangeAt(0).cloneContents());
            styleTree(clone);

            // 文本级选区(片段无元素):用 anchor 祖先链的样式补一个包裹 span
            if (clone.children.length === 0 && clone.textContent) {
              const anchorStyle = styleFromAncestors(domSel.anchorNode ?? document.body);
              const span = document.createElement("span");
              if (anchorStyle) span.setAttribute("style", anchorStyle);
              span.textContent = clone.textContent;
              clone.replaceChildren(span);
            }

            const body = document.createElement("div");
            body.setAttribute(
              "style",
              "font-size: 15px; line-height: 1.75; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif; color: #1f2328;",
            );
            body.appendChild(clone);
            const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${body.innerHTML}</body></html>`;
            const plain = domSel.toString();
            event.preventDefault();
            void writeClipboard(html, plain);
            return true;
          },
        },
      },
    }),
);
