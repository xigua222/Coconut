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
import { editorViewCtx, parserCtx, remarkPluginsCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { undo, redo } from "@milkdown/kit/prose/history";
import { selectAll } from "@milkdown/kit/prose/commands";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose, $remark } from "@milkdown/kit/utils";
import "./editorTheme.css";
import { findHeadingBySlug } from "../outline/extractOutline";
import { highlightMark, remarkHighlight } from "./plugins/highlight";
import { taskToggleKeymap, taskClickToggle } from "./plugins/taskToggle";
import { createFindFeature, type FindController } from "./plugins/findPlugin";
import { richCopyPlugin } from "./plugins/richCopy";
import { t } from "../i18n/runtime";

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
 * - Cursor(空行"+"悬浮)、BlockEdit(块手柄/斜杠菜单)、Toolbar(选区浮动格式栏)
 *   均不注入 → 保持禁用,与产品"无悬浮干扰"的视觉语言一致;
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

/** WKWebView 在祖先 user-select:none 时可能点不进 contenteditable;点下去先聚焦。 */
const ensureFocus = $prose(
  () =>
    new Plugin({
      key: new PluginKey("COCONUT_ENSURE_FOCUS"),
      props: {
        handleDOMEvents: {
          pointerdown: (view) => {
            if (!view.hasFocus()) view.focus();
            return false;
          },
        },
      },
    }),
);

/**
 * remark-math 把 $...$ 收成 inlineMath。误判特征:
 * 含汉字、或过长(金额/整段正文被 $ 包住)。真公式通常是短 ASCII。
 */
function isFalseInlineMath(value: string): boolean {
  if (/[\u3400-\u9fff]/.test(value)) return true;
  if (value.length > 200) return true;
  // 金额/整句:有空格却没有 LaTeX 命令(保留 $a + b$、$\sum$ 这类)
  if (/\s/.test(value) && !/[\\^_{}]/.test(value) && value.length > 24) return true;
  return false;
}

function unwrapFalseInlineMath(tree: Record<string, unknown>): void {
  const children = tree.children;
  if (!Array.isArray(children)) return;
  const out: unknown[] = [];
  for (const child of children) {
    if (
      typeof child === "object" &&
      child !== null &&
      (child as { type?: unknown }).type === "inlineMath" &&
      typeof (child as { value?: unknown }).value === "string" &&
      isFalseInlineMath((child as { value: string }).value)
    ) {
      out.push({ type: "text", value: `$${(child as { value: string }).value}$` });
      continue;
    }
    out.push(child);
    unwrapFalseInlineMath(child as Record<string, unknown>);
  }
  tree.children = out;
}

const unwrapFalseMath = $remark("unwrapFalseMath", () => () => unwrapFalseInlineMath);

/**
 * 任务勾选框(样式见 components.css 的 .t-check)。
 * 勾选/未勾选必须传同一段 markup:Crepe 的 Icon 用 innerHTML 注入图标,两态
 * 字符串不同就会整段换掉 svg —— 新节点没有过渡起点,描线动画会直接跳到终点。
 * 传同一段则 Vue 跳过 innerHTML 补丁,只翻 .label 上的 checked/unchecked 类,
 * 勾选态与描线全部交给 CSS。d 属性改了记得同步 --check-len(路径总长向上取整)。
 */
const CHECKBOX_ICON =
  '<span class="t-check"><svg viewBox="0 0 10.1668 10.1668" aria-hidden="true">' +
  '<path d="M1 5.52L3.92 9.17L9.17 1"/></svg></span>';

export interface EditorHandle {
  getMarkdown(): string;
  /** 程序性设值(reload),不会触发 onUserInput */
  setMarkdown(md: string): void;
  destroy(): Promise<void>;
  focus(): void;
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
      .use(ensureFocus)
      .use(findFeature.plugin)
      .use(richCopyPlugin);
  });

  // Crepe 默认配置带 @codemirror/language-data;CrepeBuilder 不会合并
  // 这份默认值,languages 缺省是 [] → 语言下拉永远「无匹配结果」。
  // 动态 import,语言包单独成 chunk,不进主包;theme 仍不传,避免 One Dark。
  const { languages } = await import("@codemirror/language-data");

  // 代码块必须开 CodeMirror 的软换行:不开时 CM 按最长行给 .cm-content 算
  // minWidth,长行既不换行也超出卡片宽度(实测 763px 内容塞进 564px 容器,
  // 中间的代码看不见也点不到)。同时占位符是换行排版的,不开换行两者高度
  // 差一倍,滚动经过时整篇文档忽长忽短。
  const { EditorView } = await import("@codemirror/view");

  // ---- 官方特性(对应 Crepe 默认集,除 Cursor/BlockEdit) ----
  builder
    .addFeature(codeMirror, {
      languages,
      extensions: [EditorView.lineWrapping],
      searchPlaceholder: t("searchLang"),
      noResultText: t("noLangMatch"),
      copyText: t("copy"),
    })
    .addFeature(placeholder, { text: t("placeholder"), mode: "doc" })
    .addFeature(latex)
    .addFeature(table)
    .addFeature(linkTooltip)
    .addFeature(listItem, {
      checkBoxCheckedIcon: CHECKBOX_ICON,
      checkBoxUncheckedIcon: CHECKBOX_ICON,
    })
    .addFeature(imageBlock)
    // remark-math 默认把 $...$ 当行内公式。研究报告/商务文档里的 $
    // (金额、占位)会被收成 atom 节点:粉底选中、点不进光标、完全不能改。
    // 必须 .use 排在 latex 之后,才能在 inlineMath 生成后再还原误判。
    .addFeature((ed) => {
      ed.use(unwrapFalseMath);
    });

  const editor = builder.editor;
  await builder.create();
  builder.setReadonly(false);

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
    destroy: async () => {
      programmaticMd = null;
      await builder.destroy();
      root.remove();
    },
    focus: () => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.dom.setAttribute("contenteditable", "true");
        view.focus();
      });
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
  findHeadingBySlug(root, slug)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
