/**
 * 大纲提取:纯函数,不依赖编辑器实例(可测)。
 * 全项目唯一的"自研业务算法"。
 */

export interface OutlineItem {
  level: number; // 1-6
  text: string;
  slug: string;
  line: number; // 行号(0 基)
}

/** 与编辑器 DOM 中 heading 匹配用的 slug(两端实现一致) */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s，。、！？：；,.!?:;'"“”‘’()（）[\]【】<>《》/\\|]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export function extractOutline(md: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = md.split(/\r?\n/);
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 跳过围栏代码块,避免 ``` 内的 # 标题被误提取
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      inFence = !inFence || fence[1] !== line.trim().match(/^(`{3,}|~{3,})/)?.[1];
      // 简化处理:任意围栏行翻转状态;代码块内的 ``` 闭合行会被再次翻转,正确性足够
      continue;
    }

    if (inFence) continue;

    const m = HEADING_RE.exec(line);
    if (!m) continue;
    const text = m[2].trim().replace(/[`*_~]/g, ""); // 去掉行内标记符号
    if (!text) continue;
    items.push({
      level: m[1].length,
      text,
      slug: slugify(text),
      line: i,
    });
  }
  return items;
}
