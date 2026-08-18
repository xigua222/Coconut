use std::path::PathBuf;

use tauri::menu::{Menu, MenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::open_router;

/// Prefix for Open Recent item ids; the rest of the id is the full path.
const RECENT_PREFIX: &str = "recent:";
const RECENT_MAX: usize = 10;

/// "Show in folder" label by platform.
#[cfg(target_os = "macos")]
const SHOW_IN_FOLDER: &str = "Show in Finder";
#[cfg(target_os = "windows")]
const SHOW_IN_FOLDER: &str = "Show in Explorer";
#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
const SHOW_IN_FOLDER: &str = "Show in File Manager";

/// 读取 recent.json(tauri-plugin-store 格式 {"recent": [...]})前 N 条
fn recent_paths(app: &AppHandle) -> Vec<String> {
    let Ok(data_dir) = app.path().app_data_dir() else { return Vec::new() };
    let Ok(text) = std::fs::read_to_string(data_dir.join("recent.json")) else { return Vec::new() };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return Vec::new() };
    json.get("recent")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|p| p.as_str().map(String::from))
                .take(RECENT_MAX)
                .collect()
        })
        .unwrap_or_default()
}

fn item(app: &AppHandle, id: &str, text: &str, accelerator: Option<&str>) -> tauri::Result<MenuItem<Wry>> {
    Ok(MenuItem::with_id(app, id, text, true, accelerator)?)
}

/// Open Recent submenu; rebuilt when the recents list changes.
fn recent_submenu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    let paths = recent_paths(app);
    let mut builder = SubmenuBuilder::new(app, "Open Recent");
    if paths.is_empty() {
        let placeholder = MenuItem::with_id(app, "recent:none", "No Recent Files", false, None::<&str>)?;
        builder = builder.item(&placeholder);
    } else {
        for p in paths {
            let name = p.split(['/', '\\']).last().unwrap_or(&p).to_string();
            let item = MenuItem::with_id(app, format!("{RECENT_PREFIX}{p}"), name, true, None::<&str>)?;
            builder = builder.item(&item);
        }
    }
    Ok(builder.build()?)
}

/// 构建完整应用菜单(含"打开最近"动态子菜单)
pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    #[cfg(target_os = "macos")]
    {
        let settings_item = item(app, "settings", "Settings…", Some("CmdOrCtrl+,"))?;
        let app_menu = SubmenuBuilder::new(app, "coconut")
            .about(Some(tauri::menu::AboutMetadata::default()))
            .separator()
            .item(&settings_item)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;

        let window_menu = SubmenuBuilder::new(app, "Window")
            .minimize()
            .maximize()
            .separator()
            .close_window()
            .build()?;

        let file_menu = build_file_menu(app)?;
        let edit_menu = build_edit_menu(app)?;
        let view_menu = build_view_menu(app)?;
        let tab_menu = build_tab_menu(app)?;
        let menu = Menu::with_items(
            app,
            &[&app_menu, &file_menu, &edit_menu, &view_menu, &tab_menu, &window_menu],
        )?;
        return Ok(menu);
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Non-macOS: Settings lives at the bottom of File.
        let file_menu = build_file_menu(app)?;
        file_menu.append(&item(app, "settings", "Settings…", Some("CmdOrCtrl+,"))?)?;
        let edit_menu = build_edit_menu(app)?;
        let view_menu = build_view_menu(app)?;
        let tab_menu = build_tab_menu(app)?;
        let menu = Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &tab_menu])?;
        return Ok(menu);
    }
}

fn build_file_menu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    // 导出合并为子菜单(顶栏另有导出按钮)
    let export_menu = SubmenuBuilder::new(app, "Export")
        .item(&item(app, "export-html", "Export HTML…", None)?)
        .item(&item(app, "export-pdf", "Export PDF…", None)?)
        .build()?;
    Ok(SubmenuBuilder::new(app, "File")
        .item(&item(app, "new", "New", Some("CmdOrCtrl+N"))?)
        .item(&item(app, "open", "Open…", Some("CmdOrCtrl+O"))?)
        .item(&item(app, "open-folder", "Add Workspace…", Some("CmdOrCtrl+Shift+O"))?)
        .item(&recent_submenu(app)?)
        .separator()
        .item(&item(app, "save", "Save", Some("CmdOrCtrl+S"))?)
        .item(&item(app, "save-as", "Save As…", Some("CmdOrCtrl+Shift+S"))?)
        .separator()
        .item(&export_menu)
        .separator()
        .item(&item(app, "show-in-finder", SHOW_IN_FOLDER, None)?)
        .item(&item(app, "open-in-vscode", "Open in VS Code", None)?)
        .separator()
        .item(&item(app, "close-tab", "Close Tab", Some("CmdOrCtrl+W"))?)
        .build()?)
}

fn build_edit_menu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    // 三平台统一自定义项:系统内置项在非 macOS 平台不本地化(显示英文),
    // 自定义中文项配合前端 dispatchMenu 处理命令,保证翻译一致。
    Ok(SubmenuBuilder::new(app, "Edit")
        .item(&item(app, "undo", "Undo", Some("CmdOrCtrl+Z"))?)
        .item(&item(app, "redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?)
        .separator()
        .item(&item(app, "cut", "Cut", Some("CmdOrCtrl+X"))?)
        .item(&item(app, "copy", "Copy", Some("CmdOrCtrl+C"))?)
        .item(&item(app, "paste", "Paste", Some("CmdOrCtrl+V"))?)
        .item(&item(app, "select-all", "Select All", Some("CmdOrCtrl+A"))?)
        .separator()
        .item(&item(app, "find", "Find…", Some("CmdOrCtrl+F"))?)
        .build()?)
}

/// 标签导航:加速键在原生菜单注册后由系统先截获,再 emit 给前端统一处理。
fn build_tab_menu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    Ok(SubmenuBuilder::new(app, "Tab")
        .item(&item(app, "prev-tab", "Previous Tab", Some("CmdOrCtrl+Shift+BracketLeft"))?)
        .item(&item(app, "next-tab", "Next Tab", Some("CmdOrCtrl+Shift+BracketRight"))?)
        .separator()
        .item(&item(app, "close-other-tabs", "Close Other Tabs", None)?)
        .item(&item(app, "close-tabs-right", "Close Tabs to the Right", None)?)
        .item(&item(app, "close-all-tabs", "Close All Tabs", None)?)
        .build()?)
}

fn build_view_menu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    Ok(SubmenuBuilder::new(app, "View")
        .item(&item(app, "toggle-sidebar", "Show/Hide Sidebar", Some("CmdOrCtrl+\\"))?)
        .item(&item(app, "toggle-outline", "Show/Hide Outline", None)?)
        .item(&item(app, "toggle-source", "Source Mode", Some("CmdOrCtrl+E"))?)
        .item(&item(app, "reload", "Reload from Disk", Some("CmdOrCtrl+Shift+R"))?)
        .build()?)
}

/// 菜单事件统一入口:"recent:*" 直接走 open_router,其余 emit 到前端。
pub fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref();
    if let Some(path) = id.strip_prefix(RECENT_PREFIX) {
        if path != "none" {
            open_router::route(app, vec![PathBuf::from(path)]);
        }
        return;
    }
    let _ = app.emit("menu", serde_json::json!({ "action": id }));
}
