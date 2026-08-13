/**
 * 文内搜索插件(⌘F):匹配高亮 decoration + 上下导航。
 *
 * 设计:
 * - 每个编辑器实例一个插件/控制器(经 createEditor 的 builder addFeature 在
 *   create 前注入,避免动态 use 重建编辑器);
 * - 匹配结果存在 plugin state(dispatch 带 meta),不落文档 → 不触发
 *   markdownUpdated、不置脏;
 * - UI 状态(findUI)是模块级 store,FindBar 只读它,输入由控制器驱动。
 */
import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import type { EditorState } from "@milkdown/kit/prose/state";
import { findUI } from "./findUI";

interface FindState {
  query: string;
  matches: { from: number; to: number }[];
  current: number;
}

export interface FindController {
  open(): void;
  close(): void;
  setQuery(q: string): void;
  next(): void;
  prev(): void;
}

export function createFindFeature(): { plugin: ReturnType<typeof $prose>; controller: FindController } {
  const key = new PluginKey("MDREADER_FIND");
  let viewRef: EditorView | null = null;

  /** 遍历 textblock,大小写不敏感、不重叠的匹配 */
  function computeMatches(state: EditorState, query: string): { from: number; to: number }[] {
    const out: { from: number; to: number }[] = [];
    const q = query.toLowerCase();
    if (!q) return out;
    state.doc.descendants((node, pos) => {
      if (node.isTextblock && node.textContent) {
        const text = node.textContent.toLowerCase();
        const start = pos + 1;
        let idx = 0;
        while ((idx = text.indexOf(q, idx)) >= 0) {
          out.push({ from: start + idx, to: start + idx + q.length });
          idx += q.length;
        }
      }
      return true;
    });
    return out;
  }

  function commit(partial: Partial<FindState>): void {
    const view = viewRef;
    if (!view) return;
    const prev = (key.getState(view.state) as FindState) ?? { query: "", matches: [], current: 0 };
    const next = { ...prev, ...partial };
    view.dispatch(view.state.tr.setMeta(key, next));
    findUI.set({ count: next.matches.length, current: next.matches.length ? next.current : 0 });
  }

  function scrollToCurrent(state: FindState): void {
    const view = viewRef;
    const match = state.matches[state.current];
    if (!view || !match) return;
    const el = view.domAtPos(match.from).node as HTMLElement;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const plugin = $prose(
    () =>
      new Plugin({
        key,
        state: {
          init: (): FindState => ({ query: "", matches: [], current: 0 }),
          apply: (tr, prev: FindState): FindState => {
            const meta = tr.getMeta(key) as Partial<FindState> | undefined;
            return meta ? { ...prev, ...meta } : prev;
          },
        },
        props: {
          decorations: (state) => {
            const st = key.getState(state) as FindState | undefined;
            if (!st || !st.query || !st.matches.length) return DecorationSet.empty;
            const decos = st.matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class: i === st.current ? "mdreader-find mdreader-find-cur" : "mdreader-find",
              }),
            );
            return DecorationSet.create(state.doc, decos);
          },
        },
        view: (view) => {
          viewRef = view;
          // 重新打开时若已有查询,立即恢复高亮
          const st = key.getState(view.state) as FindState | undefined;
          if (st?.query) {
            commit({ matches: computeMatches(view.state, st.query) });
          }
          return {
            destroy: () => {
              viewRef = null;
            },
          };
        },
      }),
  );

  const controller: FindController = {
    open() {
      findUI.set({ open: true });
      if (viewRef) {
        const st = key.getState(viewRef.state) as FindState | undefined;
        if (st?.query) commit({ matches: computeMatches(viewRef.state, st.query) });
      }
    },
    close() {
      findUI.set({ open: false });
      commit({ query: "", matches: [], current: 0 });
    },
    setQuery(q) {
      findUI.set({ query: q });
      if (!viewRef) return;
      commit({ query: q, matches: computeMatches(viewRef.state, q), current: 0 });
    },
    next() {
      const view = viewRef;
      if (!view) return;
      const st = key.getState(view.state) as FindState | undefined;
      if (!st || !st.matches.length) return;
      const current = (st.current + 1) % st.matches.length;
      commit({ current });
      scrollToCurrent({ ...st, current });
    },
    prev() {
      const view = viewRef;
      if (!view) return;
      const st = key.getState(view.state) as FindState | undefined;
      if (!st || !st.matches.length) return;
      const current = (st.current - 1 + st.matches.length) % st.matches.length;
      commit({ current });
      scrollToCurrent({ ...st, current });
    },
  };

  return { plugin, controller };
}
