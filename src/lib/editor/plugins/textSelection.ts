/**
 * 自绘选区:关掉 WebKit 原生 ::selection,改用 inline decoration 只盖文字。
 *
 * WKWebView 选跨块内容时,会把标题/段落后的换行涂到行尾,拖出一条粉底。
 * CSS(width:fit-content 等)压不住这条线;decoration 只包 inline 文本,不会。
 */
import { $prose } from "@milkdown/kit/utils";
import type { EditorState } from "@milkdown/kit/prose/state";
import { NodeSelection, Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";

const key = new PluginKey("COCONUT_TEXT_SEL");

function selectionDecorations(state: EditorState): DecorationSet {
  const { selection, doc } = state;
  if (selection.empty) return DecorationSet.empty;
  if (selection instanceof NodeSelection) return DecorationSet.empty;
  const { from, to } = selection;
  if (from >= to) return DecorationSet.empty;

  const decos: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const start = Math.max(from, pos + 1);
    const end = Math.min(to, pos + node.nodeSize - 1);
    if (start < end) {
      decos.push(Decoration.inline(start, end, { class: "coconut-sel" }));
    }
    return false;
  });
  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty;
}

export const textSelectionHighlight = $prose(
  () =>
    new Plugin({
      key,
      props: {
        decorations: (state) => selectionDecorations(state),
      },
    }),
);
