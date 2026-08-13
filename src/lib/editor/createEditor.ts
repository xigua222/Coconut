import { CrepeBuilder } from "@milkdown/crepe/builder";
// Crepe 的 JS 不引入任何 CSS,主题与特性样式必须手动导入:
// frame.css = 主题变量;common/style.css = @import 汇总全部特性样式
// (prosemirror/reset/toolbar/code-mirror/latex/table/link-tooltip 等)
import "@milkdown/crepe/theme/frame.css";
import "@milkdown/crepe/theme/common/style.css";
import { codeMirror } from "@milkdown/crepe/feature/code-mirror";
import { imageBlock } from "@milkdown/crepe/feature/image-block";
import { latex } from "@milkdown/crepe/feature/latex";
import { linkTooltip } from "@milkdown/crepe/feature/link-tooltip";
import { listItem } from "@milkdown/crepe/feature/list-item";
import { placeholder } from "@milkdown/crepe/feature/placeholder";
import { table } from "@milkdown/crepe/feature/table";
import { toolbar } from "@milkdown/crepe/feature/toolbar";
import { editorViewCtx, parserCtx, remarkPluginsCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { undo, redo } from "@milkdown/kit/prose/history";
import { selectAll } from "@milkdown/kit/prose/commands";
import "./editorTheme.css";
import { slugify } from "../outline/extractOutline";
import { highlightMark, remarkHighlight } from "./plugins/highlight";
import { taskToggleKeymap, taskClickToggle } from "./plugins/taskToggle";
import { createFindFeature, type FindController } from "./plugins/findPlugin";
import { richCopyPlugin } from "./plugins/richCopy";

/**
 * Crepe 实例工厂 —— 全项目最重要的文件。
 * 每个 tab 独立实例,tab 关闭时必须 destroy() 防止内存泄漏。
 *
 * 实现说明(Milkdown v7 实测):
 * - 用 CrepeBuilder 而非 new Crepe():builder 的 addFeature 在 create 之前
 *   注入插件/配置,且不做 defaultsDeep 合并 —— 自定义插件(==高亮==、文内
 *   搜索、富文本复制、任务快捷键)得以安全注入,绕开"动态 editor.use() 重建
 *   编辑器、打断输入法合成"的坑;代码块也不再需要 theme:null hack(缺省
 *   即不引入 One Dark,颜色由 editorTheme.css token 驱动);
 * - Cursor(空行"+"悬浮)与 BlockEdit(块手柄/斜杠菜单)不注入 → 保持禁用,
 *   与产品"无悬浮干扰"的视觉语言一致;
 * - listener 的 markdownUpdated 是 200ms 防抖的,因此"程序性修改"用
 *   内容对比区分:setMarkdown 记录期望内容,回显与之相等则不算用户输入;
 * - remark 侧注入:remarkPluginsCtx 挂 ==高亮== 拆分插件;
 *   remarkStringifyOptionsCtx 统一列表 bullet 为 "-",并注册 highlight
 *   节点的回写 handler。
 */

export interface CreateEditorOpts {
  root: HTMLElement;
  initialValue: string;
  /** 任意 markdown 变化(含程序性 setMarkdown),防抖前的原始回调 */
  onMarkdownChange: (md: string) => void;
  /** 仅真实输入事件触发 → 脏标记 */
  onUserInput: () => void;
  /**
   * 初始内容完成序列化后的首次回显。
   * Crepe 的 defaultValue 在 create() 之后异步注入,挂载瞬间 getMarkdown()
   * 可能还是空文档;要拿"初始序列化结果"必须等这个回调。
   */
  onInitialSerialized?: (md: string) => void;
  /**
   * 当前文档所在目录(用于本地图片显示重写)。
   * 渲染时把 md 里的相对/绝对本地路径重写为 asset protocol URL,
   * 仅改 DOM、不动文档 → 保存时自动恢复为原路径(可移植)。
   */
  imageBaseDir?: string | null;
}

export interface EditorHandle {
  getMarkdown(): string;
  /** 程序性设值(reload),不会触发 onUserInput */
  setMarkdown(md: string): void;
  destroy(): void;
  /** 大纲点击跳转 */
  scrollToHeading(slug: string): void;
  /** 文内搜索(⌘F):open/find/setQuery/next/prev/close */
  find: FindController;
  /** 原生编辑命令(菜单"撤销/重做/全选") */
  undo(): void;
  redo(): void;
  selectAll(): void;
}

export async function createEditor(opts: CreateEditorOpts): Promise<EditorHandle> {
  const root = opts.root;
  root.classList.add("crepe");

  // 程序性设值记录期望内容;防抖后的回显事件与之相等 → 不算用户输入
  let programmaticMd: string | null = null;

  const findFeature = createFindFeature();

  const builder = new CrepeBuilder({ root, defaultValue: opts.initialValue });

  // ---- 自定义注入(create 前):配置 + 插件 ----
  builder.addFeature((editor) => {
    editor
      .config((ctx) => {
        // 序列化风格对齐主流 Markdown 习惯:无序列表用 "-"(remark 默认 "*"),
        // 避免保存时重写绝大多数文件的列表写法 → 减少"规范化"提示出现频率;
        // handlers.highlight:==高亮== mdast 节点回写(与 remarkHighlight 配对)
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({
          ...prev,
          bullet: "-" as const,
          handlers: {
            ...prev.handlers,
            // mdast-util-to-markdown v2 的 handler 签名(无 state.all,
            // 用 containerPhrasing + tracker 组合,参照官方 emphasis handler)
            highlight: (node: { children: unknown[] }, _parent: unknown, state: any, info: any) => {
              const exit = state.enter("highlight");
              const tracker = state.createTracker(info);
              const before = tracker.move("==");
              const between = tracker.move(
                state.containerPhrasing(node, { after: "==", before, ...tracker.current() }),
              );
              const after = tracker.move("==");
              exit();
              return before + between + after;
            },
          },
        }));
        // remark 变换:文本里的 ==x== → highlight mdast 节点
        ctx.update(remarkPluginsCtx, (prev) => [...prev, remarkHighlight]);
      })
      .use(highlightMark)
      .use(taskToggleKeymap)
      .use(taskClickToggle)
      .use(findFeature.plugin)
      .use(richCopyPlugin);
  });

  // ---- 官方特性(对应 Crepe 默认集,除 Cursor/BlockEdit) ----
  builder
    .addFeature(codeMirror, {
      // coconut 化:代码块语言下拉文案(默认英文)
      // theme 不传 → 不引入 One Dark(默认配置里是 oneDark,这里缺省即无)
      searchPlaceholder: "搜索语言…",
      noResultText: "无匹配结果",
      copyText: "复制",
    })
    .addFeature(placeholder, { text: "开始输入…", mode: "doc" })
    .addFeature(latex)
    .addFeature(table)
    .addFeature(linkTooltip)
    .addFeature(listItem)
    .addFeature(imageBlock)
    .addFeature(toolbar);

  const editor = builder.editor;
  await builder.create();

  /**
   * listener 注册放在 create 之后:pre-create 的 builder.on 是在 config
   * 回调里 `ctx.get(listenerCtx)`,而 listener 插件 setup 会用
   * `ctx.inject(listenerCtx, new ListenerManager())` 覆盖实例 —— 注册在
   * 旧实例上的回调会全部丢失(实测 markdownUpdated 不触发)。
   * create 后注册走 action 路径,拿到的是注入后的实例;代价是错过
   * create 期的初始回显事件,由下方手动补发初始序列化。
   */
  const initialMd = builder.getMarkdown();
  opts.onMarkdownChange(initialMd);
  opts.onInitialSerialized?.(initialMd);
  refreshLocalImages(root, opts.imageBaseDir ?? null);

  builder.on((manager) => {
    manager.markdownUpdated((_ctx, md) => {
      opts.onMarkdownChange(md);
      if (programmaticMd !== md && md !== initialMd) {
        opts.onUserInput();
      }
      programmaticMd = null;
      // 文档变化后图片可能新增/换路径,重写 DOM img(文档本身不动)
      refreshLocalImages(root, opts.imageBaseDir ?? null);
    });
  });

  /** Crepe v7 无 setMarkdown,用 parser + doc 替换实现 */
  const setMarkdown = (md: string) => {
    programmaticMd = md;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const parser = ctx.get(parserCtx);
      const doc = parser(md);
      if (!doc) return;
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content));
    });
  };

  return {
    getMarkdown: () => builder.getMarkdown(),
    setMarkdown,
    destroy: () => {
      programmaticMd = null;
      void builder.destroy();
      root.remove();
    },
    scrollToHeading: (slug) => scrollToHeading(root, slug),
    find: findFeature.controller,
    // 菜单"撤销/重做/全选":走 PM 命令(与编辑器内部 undo 栈一致)
    undo: () => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        undo(view.state, view.dispatch);
      });
    },
    redo: () => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        redo(view.state, view.dispatch);
      });
    },
    selectAll: () => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        selectAll(view.state, view.dispatch);
      });
    },
  };
}

/** 按 slug 找到 heading 元素并滚动到位(与 extractOutline 的 slug 算法一致) */
function scrollToHeading(root: HTMLElement, slug: string): void {
  const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  const target = headings.find((h) => slugify(h.textContent ?? "") === slug);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * 本地图片路径 → asset protocol URL(http://asset.localhost/<绝对路径>)。
 * 仅改写渲染后的 <img src>,ProseMirror 文档里的 src 保持原样,
 * 因此保存写盘时路径自动"恢复为相对路径"(可移植性天然成立)。
 */
function refreshLocalImages(root: HTMLElement, baseDir: string | null): void {
  if (!baseDir) return;
  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img[src]"))) {
    const src = img.getAttribute("src") ?? "";
    // 跳过:http(s)/data/blob 等有协议、协议相对 //、锚点
    if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//") || src.startsWith("#")) continue;
    const abs = resolvePath(baseDir, src);
    img.setAttribute("src", `http://asset.localhost/${encodeURIComponent(abs)}`);
  }
}

/** baseDir + 相对路径 → 规范化绝对路径(统一 / 分隔,处理 . 与 ..) */
function resolvePath(baseDir: string, rel: string): string {
  const segs = [...baseDir.split(/[/\\]/), ...rel.split(/[/\\]/)];
  const out: string[] = [];
  for (const s of segs) {
    if (!s || s === ".") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  return "/" + out.join("/");
}
