/** 设置 schema 单一来源。 */

/**
 * 产品主题:单一固定主题(暖灰浅色 + 品牌红),不做多主题。
 * settings.theme 字段保留兼容旧数据,但只接受 "coconut"。
 */
export type Theme = "coconut";

export const FIXED_THEME: Theme = "coconut";

export type SizeLevel = "s" | "m" | "l";
export type MeasureLevel = "n" | "m" | "w";

export interface Settings {
  /** 主题(固定为单一主题,保留字段兼容旧数据) */
  theme: Theme;
  /** 文件列表面板的根目录(选择目录后持久化) */
  folderRoot: string | null;
  /** 自动保存(输入后 1.5s 防抖) */
  autoSave: boolean;
  /** 编辑器字号 px */
  fontSize: number;
  /** 编辑器字体栈 */
  fontFamily: string;
  /** 正文衬线字体 */
  serif: boolean;
  /** 字号档:小/标准/大 */
  sizeLevel: SizeLevel;
  /** 行宽档:窄/适中/宽 */
  measureLevel: MeasureLevel;
  /** 大纲(目录)面板可见 */
  outlineVisible: boolean;
  /** 不再提示 roundtrip 有损警告 */
  hideRoundtripNotice: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: FIXED_THEME,
  folderRoot: null,
  autoSave: true,
  fontSize: 16,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif',
  serif: false,
  sizeLevel: "m",
  measureLevel: "m",
  outlineVisible: true,
  hideRoundtripNotice: false,
};

/** 字号档 → px */
export const SIZE_LEVEL_PX: Record<SizeLevel, number> = { s: 15.5, m: 16.5, l: 18 };

/** 行宽档 → 内容最大宽度 */
export const MEASURE_LEVEL_PX: Record<MeasureLevel, number> = { n: 600, m: 700, w: 820 };

/** 设置面板可选字体 */
export const FONT_OPTIONS: { label: string; value: string }[] = [
  {
    label: "系统默认",
    value:
      '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif',
  },
  {
    label: "衬线(阅读)",
    value: 'Georgia, "Songti SC", "SimSun", "Noto Serif SC", serif',
  },
  {
    label: "等宽(代码)",
    value: '"SF Mono", "JetBrains Mono", Menlo, Consolas, "Courier New", monospace',
  },
];
