# coconut

本地优先的 Markdown 阅读/编辑器。默认打开方式关联 `.md` 文件,双击即读;所见即所得编辑;兼容几乎全部常用 Markdown 语法;包体尽可能小;macOS / Windows / Linux 三平台。

技术栈:**Tauri 2 + Svelte 5 + Milkdown Crepe v7**。

## 特性

- **文件是唯一事实来源**:内存中的编辑器状态只是文件的一个视图,没有用户输入事件绝不写盘
- **所见即所得**:Crepe(ProseMirror)渲染,`commonmark + gfm` 全套(表格、任务列表、删除线、围栏代码、图片、引用、脚注等)
- **==高亮== 与数学公式**:`==文本==` 高亮(编辑器渲染 + 序列化无损回写);KaTeX 公式由 Crepe 内置 Latex 特性渲染(katex 懒 chunk);Mermaid 当前以代码块形式呈现(语法无损)——动态挂载 diagram 插件会触发 Milkdown 重建编辑器、打断输入法合成导致输入回退,实测不可行,待 Milkdown v8 恢复
- **智能换行**:单个换行直接渲染为换行(软换行 roundtrip 无损),符合人类和 AI 工具写 Markdown 的习惯
- **文内搜索**:⌘/Ctrl+F 快速查找,匹配高亮 + 上下导航;⌘K 为跨文档文件切换
- **富文本复制**:编辑器内复制同时写入带内联样式的 HTML 与纯文本,粘贴到公众号/微信/邮件格式完整保留(代码块内保持纯文本)
- **实时 Agent 同步**:文件外部修改自动重载(watcher + mtime 去抖)、冲突横幅二选一、roundtrip 有损提示、1.5s 自动保存、原子写盘(临时文件 + rename,保留权限);标题栏圆点指示外部 Agent 正在写入/已完成
- **文件列表面板**:浏览所选目录(含子目录)的 Markdown 文件,Agent 新建/删除文件后自动刷新(目录 watcher + 防抖重扫)
- **源码模式**:⌘/Ctrl+E 一键切换所见即所得 ↔ 原始 Markdown(textarea,Tab 缩进)
- **单一主题**:暖灰浅色 + 品牌红,简洁专注,不提供主题切换
- **默认打开方式**:macOS Opened / Windows·Linux argv / 二次启动转发(single-instance)三路统一路由,冷启动不丢事件(frontend_ready 握手)
- **多标签** + 大纲面板 + 状态栏(字数/编码/保存状态/只读徽标)
- **常用操作外放**:顶栏按钮组(源码模式切换/导出 HTML·PDF 下拉/在访达中显示)+ 编辑器右键原生菜单(复制/粘贴/查找/全选/源码模式/导出/在访达中显示/在 VS Code 中打开),高频操作不依赖菜单
- **原生菜单**(三平台,全中文):文件(新建/打开/**打开最近**动态子菜单/保存/另存为/**导出**子菜单/在访达中显示(平台化文案)/在 VS Code 中打开/关闭标签)、编辑(撤销/重做/剪切/复制/粘贴/全选/查找——三平台统一自定义中文项)、视图(源码模式/大纲)、macOS 全套 app/窗口菜单
- **导出 PDF**:macOS 用隐藏 WebView 调原生打印对话框(可"存储为 PDF");非 macOS 降级为浏览器打开后打印;导出 HTML 内嵌本地图片(base64)并支持 ==高亮==
- **图片路径可移植**:本地图片经 asset protocol 显示(仅改 DOM,文档不动),保存时自动恢复为相对路径
- **Tab 拖拽排序**、状态栏路径"在文件夹中显示"、多选打开、拖放文件进窗口
- **编码宽容**:chardetng 检测 GBK/Big5 等并转 UTF-8,状态栏标注"保存将转为 UTF-8";拒绝 >50MB 文件
- **在 VS Code 中打开**:文件菜单通过 vscode:// 深链把当前文档交给 VS Code
- 字号/字体设置、导出 HTML(comrak GFM)

## 开发

```bash
pnpm install
pnpm tauri dev      # 开发模式(热更新)
```

检查与构建:

```bash
pnpm check          # svelte-check 类型检查
cargo check -C src-tauri   # Rust 检查
pnpm tauri build    # 打包(产物在 src-tauri/target/release/bundle/)
```

图标重新生成:`node scripts/gen-icon.mjs && pnpm tauri icon app-icon.png`

## 架构

```
前端(WebView)                          Rust(OS 边界)
├── ipc/         invoke/事件封装       ├── open_router.rs  打开请求统一路由(首启/二次启动/macOS)
├── lib/editor/  CrepeBuilder 工厂/插件/roundtrip ├── commands/file_io.rs  编码检测读 + 原子写
│   └── plugins/ ==高亮==/任务快捷键/文内搜索/富文本复制 ├── commands/directory.rs 目录树扫描
├── lib/files/   DocumentSession/watcher/recent/treeStore ├── commands/export.rs  comrak HTML + 预处理
├── lib/tabs/    tabStore(唯一状态中心)├── state.rs        挂起的打开请求
├── lib/outline/ 大纲提取(纯函数)      ├── main.rs/lib.rs  插件装配与生命周期
├── lib/settings/ 设置(store 持久化)
└── components/   11 个哑组件
```

关键原则:

1. **文件是唯一事实来源**;无输入事件不写盘。
2. **前端只做 UI 与编辑,Rust 只做 OS 边界**。
3. **一切能懒加载的都懒加载**:mermaid(按 diagram 类型拆包)、KaTeX、代码高亮语言均由 Vite 动态 import 分包。
4. **单实例多标签**:每个文件一个 tab,随激活切换 create/destroy 编辑器实例。

### 与原始方案(v8)的落地差异

Milkdown **v8 尚未发布**(npm 最新为 7.22.0),按 v7 实测 API 落地,差异如下:

| 方案(v8 设想) | 落地(v7 实测) |
|---|---|
| `@milkdown/plugin-math` 懒加载 | Crepe 内置 Latex 特性;KaTeX 由 crepe 内部动态 import(已独立 chunk) |
| `@milkdown/plugin-diagram` 懒加载 | **已放弃**:7.7.0 与 Crepe 7.22 不兼容(vite 预构建模块身份分裂,动态 use 抛 "plugin is not a function");且运行时 `editor.use()` 触发 Milkdown 重建编辑器,打断输入法合成导致输入回退/内容丢失/高度抖动(浏览器实测复现)。mermaid 以代码块(CodeMirror)呈现,语法无损 |
| `createEditor` 带 features 参数 | **CrepeBuilder + addFeature**:在 create 之前注入配置与自定义插件(==高亮==/文内搜索/富文本复制/任务快捷键),绕开动态 use() 的重建/IME 问题;顺带剔除了 lodash-es defaultsDeep(不再需要 theme:null hack) |
| `setMarkdown`(v8 API) | v7 无此 API,用 parser + `tr.replaceWith` 实现 |
| `tr.getMeta('programmatic')` 判输入 | v7 listener 的 `markdownUpdated` 为 200ms 防抖,改以"程序性设值的内容对比"判定用户输入;listener 注册放在 create 之后(create 前的 config 注册会因 listenerCtx 被 inject 覆盖而丢失) |
| 事件 `file-changed-externally` 走 events.ts | watcher 在前端直接回调 DocumentSession(mtime 对比过滤自写事件) |
| `menu:*` 原生菜单(可选) | 已实现:tauri::menu 构建 + `menu` 事件(payload `{action}`)分发;`recent:*` 项在 Rust 侧直接路由,无需过前端 |
| PDF 导出(后置,WebView print) | 已实现:`Webview::print()` 仅 macOS,隐藏窗口 + 打印对话框(可存 PDF);非 macOS 降级 opener 打开 HTML |
| `==高亮==` mark | 自定义 remark 变换(文本节点拆分)+ `$markSchema` + remark-stringify handlers 回写;代码围栏内不误伤 |
| 待办点击勾选 | Crepe list-item 组件原生支持(onClickLabel);另加 `Mod+Enter` 快捷键 |
| 本地图片显示 | asset protocol(`http://asset.localhost/…`)+ 仅改 DOM img src,文档不动 → 保存自动恢复相对路径 |
| 文内搜索 ⌘F | 自写 ProseMirror 插件(inline decoration + plugin state,不落文档不置脏) |

## 发布

推 tag 触发 `.github/workflows/release.yml`:macOS(aarch64+x86_64)、Ubuntu、Windows 矩阵打包,产物上传 GitHub Release。macOS 签名/公证 secrets 见工作流注释。

## 里程碑

- M1 可用编辑器(打开/保存/编辑)✅
- M2 默认打开方式(文件关联 + 冷启动时序)✅
- M3 多标签 + 大纲 + 状态栏 ✅
- M4 守护逻辑(watcher/冲突/roundtrip/自动保存)✅
- M5 打磨(设置/主题/导出 HTML/CI 发布)✅
- M6 能力补齐(CrepeBuilder 注入/==高亮==/文内搜索/富文本复制/智能换行/源码模式/文件列表面板/Agent 指示器/图片路径/VS Code 集成)✅

## License

MIT
