/**
 * 自绘选区:原生 ::selection 在 WKWebView 里盖不掉,再叠 decoration 就是两层。
 * 做法:把编辑器里的系统选区画成页面底色(看不见),再用绝对定位方块只盖字形。
 */
import { $prose } from "@milkdown/kit/utils";
import { NodeSelection, Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

const key = new PluginKey("COCONUT_TEXT_SEL");

function collectRects(view: EditorView): DOMRect[] {
  const { selection, doc } = view.state;
  if (selection.empty || selection instanceof NodeSelection) return [];
  const { from, to } = selection;
  if (from >= to) return [];

  const out: DOMRect[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const start = Math.max(from, pos + 1);
    const end = Math.min(to, pos + node.nodeSize - 1);
    if (start >= end) return false;
    try {
      const a = view.domAtPos(start);
      const b = view.domAtPos(end);
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 4) continue;
        out.push(r);
      }
    } catch {
      /* 选区落在 atom / 尚未挂上的节点时 coords 会抛 */
    }
    return false;
  });
  return out;
}

function paint(layer: HTMLElement, view: EditorView): void {
  const origin = layer.getBoundingClientRect();
  const rects = collectRects(view);
  const html = rects
    .map((r) => {
      const left = (r.left - origin.left).toFixed(2);
      const top = (r.top - origin.top).toFixed(2);
      const width = r.width.toFixed(2);
      const height = r.height.toFixed(2);
      return `<i class="coconut-sel-rect" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px"></i>`;
    })
    .join("");
  if (layer.innerHTML !== html) layer.innerHTML = html;
}

export const textSelectionHighlight = $prose(
  () =>
    new Plugin({
      key,
      view: (view) => {
        const host = view.dom.parentElement ?? view.dom;
        host.classList.add("coconut-sel-host");
        const layer = document.createElement("div");
        layer.className = "coconut-sel-layer";
        layer.setAttribute("aria-hidden", "true");
        host.appendChild(layer);

        let raf = 0;
        const redraw = () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => paint(layer, view));
        };
        redraw();
        window.addEventListener("resize", redraw);
        return {
          update: redraw,
          destroy: () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", redraw);
            layer.remove();
            host.classList.remove("coconut-sel-host");
          },
        };
      },
    }),
);
