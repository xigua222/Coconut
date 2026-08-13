/**
 * 待办列表(Todo):支持两种勾选方式 ——
 * - 点击渲染出来的勾选框:Crepe 的 list-item 只把勾选框画成静态 SVG
 *   (renderLabel 返回 svg 字符串),本身不带点击行为;这里补一个
 *   ProseMirror click 处理器翻转 list_item 的 checked 属性;
 * - 光标在任务项内 Mod+Enter 勾选/取消。
 * 两种方式都只翻转 checked 属性,序列化为 [ ]/[x] 由 Milkdown GFM 任务列表回写保证。
 */
import { $useKeymap, $prose } from "@milkdown/kit/utils";
import { findParentNode } from "@milkdown/kit/prose";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";

/** 光标所在的任务项(checked 非 null 的 list_item) */
function findTaskItem(state: EditorState) {
  return findParentNode((n) => n.type.name === "list_item" && n.attrs.checked != null)(state.selection);
}

/** 切换任务勾选;无任务项时不拦截 */
function toggleTask(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const item = findTaskItem(state);
  if (!item) return false;
  if (dispatch) {
    dispatch(state.tr.setNodeMarkup(item.pos, undefined, { ...item.node.attrs, checked: !item.node.attrs.checked }));
  }
  return true;
}

export const taskToggleKeymap = $useKeymap("mdreaderTaskToggle", {
  ToggleTask: {
    shortcuts: "Mod-Enter",
    command: () => toggleTask,
  },
});

/**
 * 点击勾选框切换任务状态。
 * DOM 结构:li.list-item > .label-wrapper > svg(勾选框 / 项目符号)。
 * 点击落在 .label-wrapper 上时,定位其所属 list_item;仅当它是任务项
 * (checked != null)时翻转,普通项目符号(无序/有序)忽略、不阻止默认行为。
 */
export const taskClickToggle = $prose(
  () =>
    new Plugin({
      key: new PluginKey("MDREADER_TASK_CLICK"),
      props: {
        handleDOMEvents: {
          click: (view, event) => {
            const target = event.target as HTMLElement | null;
            const labelWrapper = target?.closest(".label-wrapper") as HTMLElement | null;
            if (!labelWrapper) return false;
            const li = labelWrapper.closest("li.list-item") as HTMLElement | null;
            if (!li) return false;
            // 定位 li 在文档中的位置:posAtDOM 在节点视图边界处偶尔会抛错,
            // 捕获后视为未命中(优雅降级,不崩溃);resolve 后向上找 list_item
            try {
              const $pos = view.state.doc.resolve(view.posAtDOM(li, 0));
              for (let depth = $pos.depth; depth > 0; depth--) {
                const node = $pos.node(depth);
                if (node.type.name === "list_item" && node.attrs.checked != null) {
                  event.preventDefault();
                  view.dispatch(
                    view.state.tr.setNodeMarkup($pos.before(depth), undefined, {
                      ...node.attrs,
                      checked: !node.attrs.checked,
                    }),
                  );
                  return true;
                }
              }
            } catch {
              return false;
            }
            return false;
          },
        },
      },
    }),
);
