/**
 * 保存规范化说明与无损判定。
 *
 * 编辑器的数据模型是文档树(ProseMirror doc),保存时永远从树上重新
 * 序列化(editor.getMarkdown())写盘。因此原文中纯语法风格的差异
 * 会被规范化重写:setext 标题→ATX、引用式链接→行内链接、缩进代码
 * 块→围栏代码块、列表符号统一、行尾空格硬换行→反斜杠等。
 * 渲染效果不变,仅源码文本变化 —— lossless=false 时据此提示用户。
 *
 * 判定口径必须与真实写盘一致:直接比较"真实编辑器的序列化结果"与
 * 原文,由 DocumentSession.reevalLossless() 在编辑器挂载/内容重载后
 * 调用。早期实现用独立的 headless 编辑器往返,能力集与实际编辑器不
 * 一致(缺 GFM 等),会对编辑器本可完整保留的语法误报,已废弃。
 */

/**
 * 表格归一化:序列化器会按列宽对齐表格(补空格/拉长分隔行),
 * 这是纯排版对齐、渲染完全一致。比对前把每个表格行压成单空格
 * 填充、分隔行统一为 ---/:---: 形式,避免此类差异触发提示。
 * 代码块内的行不参与(避免误伤恰好以 | 开头的代码)。
 */
function canonicalTables(text: string): string {
  const lines = text.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^(```|~~~)/.test(l)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!l.includes("|")) continue;
    const t = l.trim();
    if (!(t.startsWith("|") || t.endsWith("|"))) continue;
    // 单元格:按未转义的 | 切分,去掉首尾空段
    const cells = t
      .split(/(?<!\\)\|/)
      .slice(t.startsWith("|") ? 1 : 0)
      .map((c) => c.trim());
    if (cells.length > 1 && cells[cells.length - 1] === "") cells.pop();
    const isDelim = cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
    lines[i] = "| " + cells.map((c) => (isDelim ? c.replace(/-+/, "---") : c)).join(" | ") + " |";
  }
  return lines.join("\n");
}

/** 归一化:统一换行 + 去行尾空白 + 压缩空行 + 表格排版对齐 + 去首尾空行 */
export function normalize(text: string): string {
  return canonicalTables(
    text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => l.replace(/[ \t]+$/, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

/** 两段文本归一化后是否相等(即保存不会产生内容差异) */
export function sameAfterNormalize(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}
