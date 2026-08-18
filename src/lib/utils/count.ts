/**
 * 文本统计(纯函数):字数/字符/行数。
 * 字数口径与 Typora 一致:CJK 字符逐个计数,非 CJK 的连续字母/数字视为一个词。
 * 字符数为原始 markdown 全量长度(含空白与标记),与编辑器内容直接对应。
 */
export interface TextStats {
  /** 字数(CJK 逐字 + 拉丁词) */
  words: number;
  /** 字符数(含空白与 Markdown 标记) */
  chars: number;
  /** 行数(空文档计 1) */
  lines: number;
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const LATIN_WORD = /[a-z0-9]+(?:['’-][a-z0-9]+)*/gi;

/** 状态栏与大纲每次重渲染都会问一次统计,而重渲染频率跟着滚动走;
 *  全文正则扫描不能每帧重做,按内容缓存最近几篇的结果。 */
const cache = new Map<string, TextStats>();
const CACHE_MAX = 4;

export function countStats(md: string): TextStats {
  const hit = cache.get(md);
  if (hit) return hit;
  const stats: TextStats = {
    words: (md.match(CJK)?.length ?? 0) + (md.match(LATIN_WORD)?.length ?? 0),
    chars: md.length,
    lines: md.length === 0 ? 1 : md.split("\n").length,
  };
  cache.set(md, stats);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return stats;
}
