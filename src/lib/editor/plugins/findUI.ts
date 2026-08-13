/**
 * 文内搜索 UI 状态(模块级 store,FindBar 与 findPlugin 共享)。
 * 搜索本身按编辑器实例隔离(plugin state),这里只放浮层可见性与计数。
 */
import { createStore } from "../../react/reactive";

export const findUI = createStore({
  open: false,
  /** 输入框内容(FindBar 双向绑定) */
  query: "",
  /** 匹配总数 */
  count: 0,
  /** 当前项下标(0 基) */
  current: 0,
});
