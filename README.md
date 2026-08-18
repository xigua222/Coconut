# coconut

本地优先的 Markdown 编辑器。文件在磁盘上，编辑器只是视图；双击 `.md` 就能打开，所见即所得，macOS / Windows / Linux。

当前版本 **0.2.0**。技术栈：**Tauri 2 + React 19 + Milkdown Crepe 7**。

## 能做什么

- **所见即所得**：CommonMark + GFM（表格、任务列表、删除线、围栏代码、图片、引用）。`⌘E` 切到源码。
- **工作区与近期**：默认工作区 + 额外文件夹；拖进来的 Markdown 会进「近期访问」；退出时记住打开的标签。
- **搜索**：`⌘K` 搜工作区 / 近期 / 已打开文档（Tantivy）；`⌘F` 搜当前文。
- **侧栏**：目录树、重命名、在访达中显示、在 VS Code 中打开、移到废纸篓。
- **自动保存**：停笔约 1.5 秒写盘。关标签默认静默保存，不打断。
- **外部改动**：磁盘变化自动重载；和未保存内容冲突时横幅二选一。
- **复制**：剪贴板同时有带样式的 HTML 和纯文本，方便贴到微信 / 邮件。代码块里仍是纯文本。
- **导出**：HTML（内嵌本地图）和 PDF（macOS 走系统打印，其它平台打开浏览器）。
- **外观**：浅色 / 深色、中文 / English、字号三档、行宽三档、标题后可选 H1–H6 标记。
- **文件关联**：`.md` / `.markdown` / `.mdown` / `.mkd` / `.mdx`；单实例，第二次启动会把文件交给已开窗口。

编码按 GBK / Big5 等读入并转 UTF-8，超过 50MB 拒绝打开。本地图片用 asset protocol 显示，保存时路径仍是相对路径。

`$…$` 只在看起来像公式时才当公式；金额、整段中文不会被收成不可编辑的公式节点。Mermaid 以代码块呈现（不动态挂 diagram，避免重建编辑器打断输入法）。

## 快捷键

| 键 | 作用 |
| --- | --- |
| `⌘K` | 搜索文档 |
| `⌘F` | 文内查找 |
| `⌘E` | 所见即所得 / 源码 |
| `⌘\` | 侧栏 |
| `⌘N` / `⌘O` / `⌘S` / `⇧⌘S` / `⌘W` | 新建 / 打开 / 保存 / 另存为 / 关标签 |
| `⌘,` | 设置 |
| `Esc` | 关掉当前浮层 |

Windows / Linux 把 `⌘` 换成 `Ctrl`。

## 开发

需要 Node 22、pnpm 9、Rust stable。

```bash
pnpm install
pnpm tauri dev
```

```bash
pnpm check                 # tsc
cargo check -C src-tauri
pnpm tauri build           # 产物在 src-tauri/target/release/bundle/
# 本仓库开发时 macOS 常用:
pnpm tauri build --bundles app
```

图标：`node scripts/gen-icon.mjs && pnpm tauri icon app-icon.png`

浏览器里跑前端（无 Rust IPC）走 `src/mock-tauri.ts`。

## 结构

```
src/                         前端
├── ipc/                     invoke / 对话框 / 事件，其它文件不直接 invoke
├── lib/editor/              CrepeBuilder、主题、高亮 / 查找 / 复制 / 任务列表
├── lib/files/               会话、目录树、近期、watcher、全文检索同步
├── lib/tabs/                标签状态
├── lib/outline/             大纲（纯函数，不改 ProseMirror DOM）
├── lib/settings/            设置 schema 与持久化
├── lib/i18n/                中英对照
└── components/              UI（含 interior 组件）

src-tauri/src/               Rust，只做 OS 边界
├── commands/                读写、扫描、废纸篓、导出、Tantivy 搜索
├── open_router.rs           冷启动 / 二次启动 / macOS Opened 统一开文件
├── app_menu.rs              原生菜单（含「打开最近」）
└── macos.rs                 红绿灯位置
```

约定：没有用户输入不写盘；前端不管文件系统，Rust 不管编辑器 DOM；每个标签一份 Crepe 实例，切走即 `destroy`。

## 发布

推 `v*` tag 走 [`.github/workflows/release.yml`](.github/workflows/release.yml)：macOS arm64 + x64、Ubuntu、Windows。macOS 签名 / 公证相关 secrets 写在工作流注释里。

## License

MIT
