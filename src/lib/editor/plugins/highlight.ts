/**
 * ==高亮== 语法插件。
 *
 * 方案(Milkdown v7 约束下的最小实现):
 * - remark 侧:自定义 remark 变换,把文本节点里的 `==x==` 拆成
 *   `highlight` mdast 节点(不进 micromark,避免扩展注入的复杂性);
 * - 序列化侧:highlight mark 的 toMarkdown 输出 `highlight` mdast 节点,
 *   再经 remarkStringifyOptionsCtx 注入的 handlers.highlight 回写 `==x==`;
 * - DOM 侧:mark 渲染为 `<mark class="hl">`(parseDOM 也认 `<mark>`)。
 *
 * 注意:代码围栏/行内代码在 mdast 里是 code/inlineCode 节点,不走 text
 * 拆分,天然免疫;`==` 未闭合时原样保留为文本。
 */
import { $markSchema } from "@milkdown/kit/utils";

/** 拆分正则:== 包裹的非空内容(内容不允许含 =,拒绝 === 歧义) */
const HIGHLIGHT_RE = /==([^=]+)==/g;

/** remark 变换:文本节点 → 拆出 highlight 子节点 */
function remarkHighlightTransform(tree: Record<string, unknown>): void {
  const children = tree.children;
  if (!Array.isArray(children)) return;
  const out: unknown[] = [];
  for (const child of children) {
    if (
      typeof child === "object" &&
      child !== null &&
      (child as { type?: unknown }).type === "text" &&
      typeof (child as { value?: unknown }).value === "string" &&
      (child as { value: string }).value.includes("==")
    ) {
      const value = (child as { value: string }).value;
      let last = 0;
      let matched = false;
      HIGHLIGHT_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = HIGHLIGHT_RE.exec(value))) {
        matched = true;
        if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
        out.push({ type: "highlight", children: [{ type: "text", value: m[1] }] });
        last = m.index + m[0].length;
      }
      if (matched) {
        if (last < value.length) out.push({ type: "text", value: value.slice(last) });
        continue;
      }
    }
    out.push(child);
    remarkHighlightTransform(child as Record<string, unknown>);
  }
  tree.children = out;
}

/** 注入 remarkPluginsCtx 的 remark 插件(remarkPluginsCtx 元素为 {plugin, options}) */
export const remarkHighlight = {
  plugin: () => (tree: any) => {
    remarkHighlightTransform(tree);
  },
  options: {},
};

/** highlight mark schema:DOM/序列化/解析三向一致 */
export const highlightMark = $markSchema("highlight", () => ({
  parseDOM: [{ tag: "mark" }],
  toDOM: () => ["mark", { class: "hl" }, 0],
  parseMarkdown: {
    match: (node: { type: string }) => node.type === "highlight",
    runner: (state: any, node: any, markType: any) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark: { type: { name: string } }) => mark.type.name === "highlight",
    // ⚠️ 必须返回 undefined:runner 返回 truthy 时序列化器会跳过 mark 内的文本节点
    runner: (state: any, mark: any) => {
      state.withMark(mark, "highlight");
    },
  },
}));
