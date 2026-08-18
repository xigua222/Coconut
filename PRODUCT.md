# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

普通用户：轻度使用 Markdown 的日常人群（非开发者、非笔记工具重度玩家）。他们的情境是——拿到一个 `.md` 文件（或一整个文档目录），想直接读、顺手改，不想为了这个学一个新工具、装一个重型应用。零学习成本是硬性期望：双击即开，即读即写，不要求配置。

## Product Purpose

coconut 是一个本地优先的 Markdown 阅读/编辑器，让"打开一个 .md 文件"这件事轻到可以替代系统默认的纯文本查看器，同时提供所见即所得的完整编辑体验。成功意味着：用户双击 `.md` 文件后进入应用，能读、能写、格式不坏，全程无感——应用本身不挡在文件和用户之间。

## Positioning

轻量极速、本地优先、WYSIWYG 完整语法，三个支柱同时成立，缺一不可：

1. **轻量极速**：包体尽可能小，启动即用，双击即读——做 Typora / Obsidian / VS Code 之外的轻量选择；
2. **本地优先、文件主权**：文件是唯一事实来源，无同步、无锁定、无云端依赖、不联网，数据永远在用户自己手里；
3. **WYSIWYG 完整**：Crepe（ProseMirror）渲染，常用 Markdown 语法（commonmark + gfm：表格、任务列表、删除线、围栏代码、图片、引用、脚注）+ 数学公式（KaTeX）+ Mermaid 图表。

## Operating Context

- **桌面三平台**：macOS / Windows / Linux，Tauri 2 桌面应用；设计语言由 WebView 内 CSS 驱动，三平台同一套视觉系统，但需配合原生菜单、系统快捷键、文件系统集成等原生体验。
- **默认打开方式**：系统文件关联 `.md`，双击即读；macOS Opened / Windows·Linux argv / 二次启动转发（single-instance）三路统一路由，冷启动不丢事件。
- **阅读与编辑一体**：所见即所得编辑与只读查看在同一切换（视图菜单切换只读），多标签承载多个文件，每文件一个 tab。
- **写作工作流配套**：大纲面板、状态栏（字数/编码/保存状态）、Tab 拖拽排序、多选打开、拖放文件进窗口、最近文件动态菜单、"在文件夹中显示"。

## Capabilities and Constraints

已确认能力（README 记录的实现事实）：

- **文件是唯一事实来源**：内存中的编辑器状态只是文件的一个视图，没有用户输入事件绝不写盘；1.5s 自动保存；原子写盘（临时文件 + rename，保留权限）。
- **守护逻辑**：文件外部修改自动重载（watcher + mtime 去抖）、冲突横幅二选一、roundtrip 有损提示。
- **语法完整**：commonmark + gfm 全套 + KaTeX 数学公式 + `==高亮==`（自定义 remark 变换 + mark，roundtrip 无损）；Mermaid 当前以代码块形式呈现（语法无损）——动态挂载 diagram 插件会触发 Milkdown 重建编辑器、打断输入法合成，实测不可行，待 Milkdown v8 恢复。
- **智能换行**：单换行渲染为换行（Milkdown 软换行 hardbreak 机制），序列化回普通 `\n` 无损。
- **编辑器内核**：CrepeBuilder + addFeature 在 create 前注入自定义插件（==高亮==、文内搜索、富文本复制、任务快捷键），绕开 v8 前动态 use() 的重建/IME 问题；listener 注册在 create 后（listenerCtx 被 inject 覆盖的坑）。
- **文内搜索**：⌘/Ctrl+F 匹配高亮 + 上下导航（自写 ProseMirror 插件，不落文档不置脏）。
- **富文本复制**：编辑器内 ⌘C 同时写入内联样式 HTML + 纯文本，微信/公众号粘贴格式保留；代码块内保持纯文本。
- **源码模式**：⌘/Ctrl+E 切换 WYSIWYG ↔ 原始 Markdown（textarea）。
- **单一主题**：暖灰浅色 + 品牌红，不提供主题切换。
- **文件列表面板**：目录树（深度 4，跳隐藏/node_modules/符号链接），fs watch 根目录自动刷新，Agent 新建/删除文件实时可见。
- **Agent 活动指示器**：标题栏圆点，外部进程写入中琥珀色脉冲、完成后绿色数秒回落。
- **导出**：导出 HTML（comrak GFM，==高亮== → mark，本地图片 base64 内嵌）；导出 PDF（macOS 隐藏 WebView 调原生打印对话框可"存储为 PDF"，非 macOS 降级浏览器打开后打印）。
- **图片路径可移植**：asset protocol（`http://asset.localhost/…`）显示本地图片，仅改 DOM 不动文档 → 保存自动恢复相对路径。
- **编码宽容**：chardetng 检测 GBK/Big5 等并转 UTF-8，状态栏标注"保存将转为 UTF-8"；拒绝 >50MB 文件。
- **常用操作外放**：顶栏按钮组（源码模式/导出下拉/在访达中显示）+ 编辑器右键原生菜单（复制/粘贴/查找/全选/源码模式/导出/在访达中显示/在 VS Code 中打开）。
- **原生菜单**（三平台，全中文）：文件/编辑（撤销/重做/剪切/复制/粘贴/全选/查找，三平台统一自定义中文项）/视图（源码模式/大纲）/窗口（macOS 全套），含最近文件动态子菜单、导出子菜单、"在 VS Code 中打开"；"在文件夹中显示"按平台本地化（访达/资源管理器/文件管理器）。
- **设置**：字号/字体设置、只读切换。
- **架构边界**：前端只做 UI 与编辑，Rust 只做 OS 边界；一切能懒加载的都懒加载（KaTeX、代码高亮语言按需分包）。

约束（用户确认的硬约束）：

- **包体小、启动快**：体量是产品身份的一部分，不可为视觉或功能牺牲。
- **本地优先、不联网**：无同步服务、无遥测、纯本地，隐私是承诺，未来功能不得引入网络依赖。

## Brand Commitments

- 产品名 **coconut**，现有图标 `app-icon.png`（已生成全套平台图标）。
- GPL-3.0-or-later: derivatives must be open source.
- Stack: Tauri 2 + React 19 + Milkdown Crepe v7 (upgrade when v8 ships; mermaid plugin can return then).

## Evidence on Hand

- `README.md`：完整的产品事实、架构、与 v8 方案的落地差异表、里程碑记录。
- `app-icon.png`：品牌图标源文件。
- `src/` 与 `src-tauri/`：完整实现（组件、stores、Rust 命令）。
- `screenshots/` 与根目录若干 `*.png`：界面截图证据。
- 无真实用户证言、无市场数据、无定价/部署承诺——未来工作不得虚构。

## Product Principles

1. **文件是唯一事实来源**：应用永远围绕用户自己的文件转，不另立数据权威。
2. **轻量即特性**：包体、启动、内存都在产品身份里；新增任何东西都要付"体积税"。
3. **零学习成本**：目标是普通用户，任何需要配置才能用好的设计都是失败。
4. **语法兼容无损**：用户已有的 Markdown 文件必须原样进、原样出（roundtrip 无损），有损处必须明示。
5. **隐私默认**：不联网、无遥测，本地能力优先于云能力。

## Accessibility & Inclusion

未建立产品级特定标准。既有事实：字号/字体可调、单一固定主题、只读模式与保存状态在状态栏有徽标提示。未来涉及无障碍设计时需以系统原生可达性（macOS/Windows/Linux）为基准补齐，但当前无已确认的硬性要求。
