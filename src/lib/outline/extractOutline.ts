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
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s，。、！？：；,.!?:;'"“”‘’()（）[\]【】<>《》/\\|]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniquify(base: string, used: Set<string>): string {
  const stem = base || "heading";
  let id = stem;
  let n = 2;
  while (used.has(id)) id = `${stem}-${n++}`;
  used.add(id);
  return id;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const HEADING_SEL = ".ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6";

/** 大纲面板每次重渲染都会重解析全文,而重渲染跟着滚动走 → 按内容缓存 */
const outlineCache = new Map<string, OutlineItem[]>();
const OUTLINE_CACHE_MAX = 4;

export function extractOutline(md: string): OutlineItem[] {
  const hit = outlineCache.get(md);
  if (hit) return hit;
  const items = parseOutline(md);
  outlineCache.set(md, items);
  if (outlineCache.size > OUTLINE_CACHE_MAX) {
    outlineCache.delete(outlineCache.keys().next().value as string);
  }
  return items;
}

function parseOutline(md: string): OutlineItem[] {
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
  const used = new Set<string>();
  for (const item of items) item.slug = uniquify(item.slug, used);
  return items;
}

/**
 * 按 slug 找到编辑器里的 heading 元素(只读)。
 *
 * 绝不能改写 ProseMirror 可编辑区内的 DOM(哪怕只是加个 id):PM 的
 * DOMObserver 监听 attributes+childList,外部写入会被判为"DOM 被污染"→
 * 重绘该节点抹掉写入 → 触发下一轮写入,形成帧级死循环(代码块 CodeMirror
 * 随之反复重建,表现为行号抖动 + 整体卡死)。这里改为按顺序现算 slug 匹配,
 * 与 extractOutline 的编号规则(重名加 -2/-3)保持一致。
 */
export function findHeadingBySlug(root: ParentNode, slug: string): HTMLElement | null {
  if (!slug) return null;
  const used = new Set<string>();
  for (const h of root.querySelectorAll<HTMLElement>(HEADING_SEL)) {
    if (uniquify(slugify(h.textContent ?? ""), used) === slug) return h;
  }
  return null;
}
