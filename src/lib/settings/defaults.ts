/** 设置 schema 单一来源。 */

import { DEFAULT_LOCALE, type Locale } from "../i18n/runtime";

/**
 * 产品主题:coconut 暖灰浅色 / coconut-dark 暖灰深色,共用品牌红。
 * 旧数据里其它 theme 值一律归并为浅色。
 */
export type Theme = "coconut" | "coconut-dark";

export const DEFAULT_THEME: Theme = "coconut";
export const FIXED_THEME: Theme = DEFAULT_THEME;

export type { Locale };
export { DEFAULT_LOCALE };

export type SizeLevel = "s" | "m" | "l";
export type MeasureLevel = "n" | "m" | "w";

export interface Settings {
  /** 外观:coconut 浅色 / coconut-dark 深色 */
  theme: Theme;
  /** 界面语言 */
  locale: Locale;
  /** 默认工作区(始终有一个;首次启动会落到「文档/coconut」) */
  defaultWorkspace: string | null;
  /** 用户额外添加的工作区(不含默认) */
  workspaces: string[];
  /** 打开过、且不在任何工作区内的 Markdown(侧栏「近期访问」) */
  recentAccess: string[];
  /** 自动保存(输入后 1.5s 防抖) */
  autoSave: boolean;
  /** 编辑器字号 px */
  fontSize: number;
  /** 字号档:小/标准/大 */
  sizeLevel: SizeLevel;
  /** 行宽档:窄/适中/宽 */
  measureLevel: MeasureLevel;
  /** 大纲(目录)面板可见 */
  outlineVisible: boolean;
  /** 左侧文库侧栏可见 */
  sidebarVisible: boolean;
  /** 不再提示 roundtrip 有损警告 */
  hideRoundtripNotice: boolean;
  /** 在标题后显示 H1–H6 层级标记 */
  headingMarks: boolean;
  /** 上次退出时打开着的文档(按标签顺序),下次启动重开 */
  openTabs: string[];
  /** 上次退出时的活动文档路径 */
  activeTab: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  locale: DEFAULT_LOCALE,
  defaultWorkspace: null,
  workspaces: [],
  recentAccess: [],
  autoSave: true,
  fontSize: 16,
  sizeLevel: "m",
  measureLevel: "m",
  outlineVisible: true,
  sidebarVisible: true,
  hideRoundtripNotice: true,
  headingMarks: true,
  openTabs: [],
  activeTab: null,
};

/** 字号档 → px */
export const SIZE_LEVEL_PX: Record<SizeLevel, number> = { s: 15.5, m: 16.5, l: 18 };

/** 行宽档 → 内容最大宽度(含左右内边距) */
export const MEASURE_LEVEL_PX: Record<MeasureLevel, number> = { n: 840, m: 1080, w: 1360 };
