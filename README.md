# coconut

Local-first Markdown editor. The file on disk is the source of truth; the editor is just a view. Double-click a `.md` file, edit WYSIWYG, on macOS / Windows / Linux.

Version **0.2.0**. Stack: **Tauri 2 + React 19 + Milkdown Crepe 7**. UI is English by default; Chinese is available in Settings.

## What it does

- **WYSIWYG**: CommonMark + GFM (tables, task lists, strikethrough, fenced code, images, quotes). `⌘E` toggles source.
- **Workspaces & recents**: default workspace plus extra folders; dropped Markdown files land in Recents; open tabs are restored on launch.
- **Search**: `⌘K` searches workspaces, recents, and open docs (Tantivy); `⌘F` searches the current file.
- **Sidebar**: tree, rename, Show in Finder, Open in VS Code, Move to Trash.
- **Autosave**: writes about 1.5s after you stop typing. Closing a tab saves quietly.
- **External edits**: reload when the file changes on disk; a banner if that conflicts with unsaved work.
- **Copy**: clipboard gets styled HTML and plain text (for mail / chat). Code blocks stay plain text.
- **Export**: HTML (local images inlined) and PDF (system print on macOS; browser elsewhere).
- **Appearance**: light / dark, English / 中文, three type sizes, three line widths, optional H1–H6 marks after headings.
- **File types**: `.md` / `.markdown` / `.mdown` / `.mkd` / `.mdx`. Single instance: a second launch hands files to the open window.

GBK / Big5 and similar encodings are read as UTF-8. Files over 50MB are refused. Local images use the asset protocol; saved paths stay relative.

`$…$` becomes math only when it looks like math; currency and Chinese prose are not locked into formula nodes. Mermaid stays a code block (no live diagram plugin — that rebuilt the editor and broke IME).

## Shortcuts

| Key | Action |
| --- | --- |
| `⌘K` | Search documents |
| `⌘F` | Find in file |
| `⌘E` | WYSIWYG / source |
| `⌘\` | Sidebar |
| `⌘N` / `⌘O` / `⌘S` / `⇧⌘S` / `⌘W` | New / Open / Save / Save As / Close tab |
| `⌘,` | Settings |
| `Esc` | Dismiss overlay |

On Windows / Linux, `⌘` is `Ctrl`.

## Develop

Node 22, pnpm 9, Rust stable.

```bash
pnpm install
pnpm tauri dev
```

```bash
pnpm check                 # tsc
cargo check -C src-tauri
pnpm tauri build           # artifacts in src-tauri/target/release/bundle/
# macOS .app only:
pnpm tauri build --bundles app
```

Icons: `node scripts/gen-icon.mjs && pnpm tauri icon app-icon.png`

Frontend without Rust IPC uses `src/mock-tauri.ts`.

## Layout

```
src/                         frontend
├── ipc/                     invoke / dialogs / events (nothing else calls invoke)
├── lib/editor/              CrepeBuilder, theme, highlight / find / copy / tasks
├── lib/files/               sessions, tree, recents, watcher, search sync
├── lib/tabs/                tab state
├── lib/outline/             outline (pure; does not mutate ProseMirror DOM)
├── lib/settings/            settings schema + persistence
├── lib/i18n/                English + Chinese
└── components/              UI (including interior)

src-tauri/src/               Rust, OS boundary only
├── commands/                read/write, scan, trash, export, Tantivy
├── open_router.rs           cold start / second instance / macOS Opened
├── app_menu.rs              native menu (including Open Recent)
└── macos.rs                 traffic-light layout
```

Rules: no write without user input; the frontend does not touch the filesystem; Rust does not touch editor DOM; one Crepe instance per tab, destroyed when the tab goes away.

## Release

Push a `v*` tag to run [`.github/workflows/release.yml`](.github/workflows/release.yml): macOS arm64 + x64, Ubuntu, Windows. macOS signing / notarization secrets are in the workflow comments.

## License

[GPL-3.0-or-later](LICENSE). You may use, modify, and distribute. If you ship a modified version (or a larger work that includes this project), it must also be GPL and you must provide complete corresponding source.

## 中文

本地优先的 Markdown 编辑器。文件在磁盘上，编辑器只是视图；双击 `.md` 即可打开，所见即所得。默认界面为英文，设置里可切回中文。协议为 GPL-3.0-or-later：修改后再发布，必须同样开源并提供完整源码。
