/**
 * 浏览器直测页(非 Tauri):走生产 createEditor 工厂,验证渲染与输入稳定性,
 * 以及 P1 新增能力(==高亮==、任务快捷键、文内搜索、富文本复制)。
 */
import { createEditor } from "./lib/editor/createEditor";
import { styleFromAncestors } from "./lib/editor/plugins/richCopy";

const log = (msg: string) => {
  const el = document.getElementById("log")!;
  el.textContent += `[${new Date().toISOString().slice(11, 23)}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
};

// 运行时错误捕获
window.addEventListener("error", (e) => log(`PAGE ERROR: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => log(`REJECTION: ${String(e.reason)}`));

const SAMPLE = `# 测试文档

## 章节一

这是一段**加粗**、*斜体*、\`行内代码\`、==高亮文本== 的混合段落。

==第二段高亮==放在段落开头。

智能换行第一行
智能换行第二行(同一段落,单换行)

- [ ] 待办一
- [x] 待办二(已完成)
- 普通列表项

### 公式

数学公式 $E = mc^2$ 行内展示。

### 代码块

\`\`\`js
const a = "==不应高亮==";
\`\`\`

> 引用块内容

| 列1 | 列2 |
| --- | --- |
| a | b |

未闭合的 == 不应拆出高亮
`;

const host = document.getElementById("host")!;
const root = document.createElement("div");
root.className = "crepe";
host.appendChild(root);

let programmaticMd: string | null = null;

const handle = await createEditor({
  root,
  initialValue: SAMPLE,
  onMarkdownChange: (md) => {
    log(`markdownUpdated: ${md.length} chars`);
  },
  onUserInput: () => log("userInput=true"),
  onInitialSerialized: (md) => {
    log(`initial serialized: ${md.length} chars; highlight roundtrip: ${md.includes("==高亮文本==") ? "OK" : "LOST"}`);
    log(`serialized body: ${JSON.stringify(md)}`);
    log(`code fence intact: ${md.includes('const a = "==不应高亮=="') ? "OK" : "BROKEN"}`);
    log(`task roundtrip: ${md.includes("[ ] 待办一") ? "OK" : "LOST"}`);
    log(`soft line break roundtrip: ${md.includes("智能换行第一行\n智能换行第二行") ? "OK" : "LOST"}`);
  },
});
log("editor created");

// 暴露给自动化测试
(window as unknown as Record<string, unknown>).__handle = handle;

// 与生产一致的 ⌘F 打开文内搜索
window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    handle.find.open();
  }
});

// ---- 自动化自检(3s 后执行,结果写入 #log)----
setTimeout(() => {
  try {
    // 1) 文内搜索:打开 + 查询 + 计数
    handle.find.open();
    handle.find.setQuery("高亮");
    const decos = document.querySelectorAll(".mdreader-find").length;
    const cur = document.querySelectorAll(".mdreader-find-cur").length;
    log(`FIND: open=${document.querySelector(".findbar") != null}, matches=${decos}, current=${cur}`);
    handle.find.next();
    const cur2 = document.querySelectorAll(".mdreader-find-cur").length;
    log(`FIND next: current still highlighted=${cur2 === 1 ? "OK" : "FAIL"}`);
    handle.find.close();
    log(`FIND close: decorations cleared=${document.querySelectorAll(".mdreader-find").length === 0 ? "OK" : "FAIL"}`);
  } catch (e) {
    log(`FIND ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) 富文本复制:构造选区(选中"高亮文本"所在的 mark)后模拟 copy
  try {
    const mark = document.querySelector(".ProseMirror mark.hl");
    const bg = getComputedStyle(mark!).backgroundColor;
    const markClass = mark!.className;
    const markParent = mark!.parentElement?.tagName;
    log(`COPY debug: mark.bg=${bg}, class=${markClass}, parent=${markParent}`);

    const range = document.createRange();
    range.selectNodeContents(mark!);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    // addRange 之后立即读 anchor,并直接调用 styleFromAncestors 验证
    const sel2 = window.getSelection()!;
    const anchor = sel2.anchorNode;
    if (anchor) {
      const direct = styleFromAncestors(anchor);
      log(`COPY debug: anchor=${anchor.nodeName}, direct="${direct}"`);
    } else {
      log("COPY debug: anchor=null AFTER addRange");
    }
    const copied = { html: "", plain: "" };
    const originalWrite = navigator.clipboard.write.bind(navigator.clipboard);
    (navigator.clipboard as { write: unknown }).write = async (items: ClipboardItem[]) => {
      for (const item of items) {
        const htmlBlob = await item.getType("text/html");
        copied.html = await htmlBlob.text();
        const plainBlob = await item.getType("text/plain");
        copied.plain = await plainBlob.text();
      }
    };
    const view = document.querySelector(".ProseMirror") as HTMLElement;
    const copyEvt = new ClipboardEvent("copy", { bubbles: true, cancelable: true });
    view.dispatchEvent(copyEvt);
    setTimeout(() => {
      const hasStyle = copied.html.includes("background-color");
      const plainOk = copied.plain.includes("高亮文本");
      log(`COPY: htmlHasBg=${hasStyle}, plain=${plainOk ? "OK" : "FAIL"} → ${hasStyle && plainOk ? "OK" : "FAIL"}`);
      log(`COPY html sample: ${copied.html.slice(0, 200)}`);
      (navigator.clipboard as { write: unknown }).write = originalWrite;
    }, 300);
  } catch (e) {
    log(`COPY ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
}, 3000);

// 轮询内容变化
let lastMd = SAMPLE;
setInterval(() => {
  const current = handle.getMarkdown();
  if (current !== lastMd) {
    lastMd = current;
    log(`content changed → ${current.length} chars`);
  }
}, 600);

document.getElementById("find")!.onclick = () => handle.find.open();
