# coconut2 前端全面迁移:Svelte 5 → React 19 + interior.dev 组件落地

## 迁移原则
- **保留不动**:src-tauri/ 全部(Rust/IPC/权限/assetProtocol)、src/ipc/、src/lib/editor/(除 findUI)、editorTheme.css、app.css、extractOutline、utils、recent/watcher/export、mock-tauri.ts、vite port 1420、Tauri conf、单主题 coconut
- **零新运行时依赖**(React 生态本身除外):状态层自研 ~40 行响应式 store
- **保真迁移**:方法签名、交互行为、快捷键、无障碍、prefers-reduced-motion 逐项对应

## Phase 0 — 安全网 + 构建底座
1. 目录当前**不是 git 仓库**(迁移会删几十个 Svelte 文件,无回滚手段)→ 先 `git init` + 首次 commit 作为安全网
2. package.json:删 `svelte`/`@sveltejs/vite-plugin-svelte`/`svelte-check`;加 `react@^19`、`react-dom@^19`、`@types/react`、`@types/react-dom`、`@vitejs/plugin-react`;`check` 脚本改 `tsc --noEmit`
3. vite.config.ts:plugins 换 `@vitejs/plugin-react`(port/es2022/chunkSizeWarningLimit 保留);删 svelte.config.js;tsconfig include `*.svelte`→`*.tsx` + `"jsx": "react-jsx"`
4. main.ts → main.tsx:React 根挂载,启动顺序不变(`settingsStore.init()` → `registerAll()` → `createRoot().render(<App/>)` → `frontendReady()`)
5. mock.html 入口改 `/src/main.tsx`;test-*.html / test-*.ts 是纯调试件且耦合 Svelte,删除(浏览器验证走 mock.html)

## Phase 1 — 状态层(最大块,先立基)
- 新增 `src/lib/react/reactive.ts`(~40 行):`ReactiveStore` 基类(subscribe/notify)+ `createStore<T>` 工厂(模块级对象)+ `useStore(store, selector)` hook(React 内置 `useSyncExternalStore` 封装)
- 6 个 `.svelte.ts` → `.ts`,结构 1:1 平移:
  - `tabStore`/`settingsStore`/`treeStore`/`document` 保持类形态 extends ReactiveStore:`$state` 字段→普通字段,每个 mutator 末尾 `notify()`;`#confirm` Promise 桥、CSS 变量注入、300ms 防抖落盘全部原样
  - `findUI`/`agentActivity`(模块级 `$state` 对象)→ `createStore` 单例 —— 这是编辑器插件与 UI 的唯一纽带,findPlugin.ts 里的读写改为 `findUI.get()/set()`
  - 跨 store 联动:`treeStore.root` 从 `$derived` 改为 getter 读 settingsStore;Sidebar 用 useEffect 依赖 `folderRoot` 触发 `refresh()`
- 检验:全部方法签名不动,tsc 通过

## Phase 2 — 纯展示组件(.svelte → .tsx)
StatusBar、TocPanel、WelcomePage、ConflictBanner、NormalizeNotice:`$derived` → useMemo/直接计算,裸 store 访问 → useStore 订阅,`{#each}` → .map+key,`class:xxx` → className

## Phase 3 — 交互组件
- TopBar:导出菜单外点关闭、agent dot 4s 回落($effect → useEffect);`-webkit-app-region: drag` 保留
- Sidebar:树渲染/收展、tab 列表;`in:fly`/`out:fade`/`animate:flip` → motion 重写
- 浮层组:ConfirmModal(transition:fade/scale)、SettingsDrawer、SearchOverlay(现用 motion vanilla,保留 FLIP 高亮条)、FindBar —— 挂载/卸载动画用 motion `AnimatePresence` 等价实现

## Phase 4 — App.tsx + EditorPane.tsx(难点)
- App.tsx:全局键盘(⌘K/F/S/W/O/E/N/,/Esc 逐层关闭)、`win.onCloseRequested` + closing 防重入、`onDragDropEvent` 拖放打开、滚动侦察(rAF + extractOutline → progress/activeToc)、窗口标题跟随
- EditorPane.tsx(最重要约束):
  - `createEditor.ts` **零改动**(CrepeBuilder 命令式工厂,框架无关),React 只换挂载壳:useRef 挂载点 + useEffect,依赖数组**只含 session 身份 + mode**(复刻 untrack 语义,绝不能追踪 md)+ mountToken 竞态防护(异步挂载期间切 tab 作废)
  - 源码模式 textarea 改受控组件(Tab 缩进逻辑保留);右键原生菜单动态 import 不变;400ms onMd 防抖保留

## Phase 5 — interior.dev 组件落地(核心+体验增强 ~10 件)
- 从 `github.com/ddoemonn/interior`(MIT)复制源文件到 `src/components/interior/`,**保留 MIT 版权头注释**;重样式到 coconut token(--panel/--ink/--acc/--ease-*)
- 落地映射:
  - `press-depth` → TopBar/Sidebar 按钮按压
  - `value-flash` → StatusBar 字数/保存状态跳动
  - `drawer` → SettingsDrawer 重做
  - `modal` → ConfirmModal 重做
  - `collapsible-banner` → ConflictBanner/NormalizeNotice
  - `copy-button` → 顶栏/欢迎页
  - `command-palette` → SearchOverlay(⌘K)重做,数据模型适配为「已开 tab + 最近文档」
  - `reading-progress` → 顶部阅读进度条(复用现成 `tabStore.progress`)
  - `hide-on-scroll` → TopBar 滚动隐藏
  - `skeleton-swap` → 目录树加载骨架
- 适配注意:interior 组件依赖 `motion/react`(已随 motion 包可用);如有共享内部依赖文件一并复制;键盘/aria/reduced-motion 质量点保留

## Phase 6 — 验证
1. `pnpm install` → `pnpm check`(tsc)→ `pnpm build` 通过
2. mock.html 浏览器验证:按既有工作流用 locator.evaluate 读 getComputedStyle 验证渲染与动画落位(不依赖截图)
3. `pnpm tauri dev` 真机验证:编辑器挂载/切 tab/搜索/保存/冲突横幅/⌘K 全链路
4. 全部通过后删除 src 下残留 .svelte 文件,收尾 commit

## 风险与保真要点
- 编辑器硬约束(必须原样保留):插件 create 前注入、禁止动态 use()(会打断 IME)、listener 必须在 create 后注册、Crepe 200ms + 外层 400ms 双防抖
- 挂载 effect 不得依赖 md;`editor-host` 独立挂载点隔离(横幅与挂载点兄弟关系)
- 单主题 coconut 固定、token 体系、editorTheme.css 全部不动
- 非 git 仓库 → Phase 0 先建立版本控制,任何一步出错可回滚