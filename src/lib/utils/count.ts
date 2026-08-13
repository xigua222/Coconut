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

export function countStats(md: string): TextStats {
  return {
    words: (md.match(CJK)?.length ?? 0) + (md.match(LATIN_WORD)?.length ?? 0),
    chars: md.length,
    lines: md.length === 0 ? 1 : md.split("\n").length,
  };
}
