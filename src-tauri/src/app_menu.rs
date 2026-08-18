use std::path::PathBuf;

use tauri::menu::{Menu, MenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::open_router;

/// "打开最近"子菜单项的 id 前缀,后面直接跟完整路径
const RECENT_PREFIX: &str = "recent:";
const RECENT_MAX: usize = 10;

/// "在文件夹中显示"按平台本地化文案
#[cfg(target_os = "macos")]
const SHOW_IN_FOLDER: &str = "在访达中显示";
#[cfg(target_os = "windows")]
const SHOW_IN_FOLDER: &str = "在资源管理器中显示";
#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
const SHOW_IN_FOLDER: &str = "在文件管理器中显示";

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

/// "打开最近"子菜单:启动/最近文件变化时重建
fn recent_submenu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    let paths = recent_paths(app);
    let mut builder = SubmenuBuilder::new(app, "打开最近");
    if paths.is_empty() {
        let placeholder = MenuItem::with_id(app, "recent:none", "无最近文件", false, None::<&str>)?;
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
        let settings_item = item(app, "settings", "设置…", Some("CmdOrCtrl+,"))?;
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

        let window_menu = SubmenuBuilder::new(app, "窗口")
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
        // 非 macOS:设置项并入"文件"菜单底部
        let file_menu = build_file_menu(app)?;
        file_menu.append(&item(app, "settings", "设置…", Some("CmdOrCtrl+,"))?)?;
        let edit_menu = build_edit_menu(app)?;
        let view_menu = build_view_menu(app)?;
        let tab_menu = build_tab_menu(app)?;
        let menu = Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &tab_menu])?;
        return Ok(menu);
    }
}

fn build_file_menu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    // 导出合并为子菜单(顶栏另有导出按钮)
    let export_menu = SubmenuBuilder::new(app, "导出")
        .item(&item(app, "export-html", "导出 HTML…", None)?)
        .item(&item(app, "export-pdf", "导出 PDF…", None)?)
        .build()?;
    Ok(SubmenuBuilder::new(app, "文件")
        .item(&item(app, "new", "新建", Some("CmdOrCtrl+N"))?)
        .item(&item(app, "open", "打开…", Some("CmdOrCtrl+O"))?)
        .item(&item(app, "open-folder", "添加工作区…", Some("CmdOrCtrl+Shift+O"))?)
        .item(&recent_submenu(app)?)
        .separator()
        .item(&item(app, "save", "保存", Some("CmdOrCtrl+S"))?)
        .item(&item(app, "save-as", "另存为…", Some("CmdOrCtrl+Shift+S"))?)
        .separator()
        .item(&export_menu)
        .separator()
        .item(&item(app, "show-in-finder", SHOW_IN_FOLDER, None)?)
        .item(&item(app, "open-in-vscode", "在 VS Code 中打开", None)?)
        .separator()
        .item(&item(app, "close-tab", "关闭标签", Some("CmdOrCtrl+W"))?)
        .build()?)
}

fn build_edit_menu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    // 三平台统一自定义项:系统内置项在非 macOS 平台不本地化(显示英文),
    // 自定义中文项配合前端 dispatchMenu 处理命令,保证翻译一致。
    Ok(SubmenuBuilder::new(app, "编辑")
        .item(&item(app, "undo", "撤销", Some("CmdOrCtrl+Z"))?)
        .item(&item(app, "redo", "重做", Some("CmdOrCtrl+Shift+Z"))?)
        .separator()
        .item(&item(app, "cut", "剪切", Some("CmdOrCtrl+X"))?)
        .item(&item(app, "copy", "复制", Some("CmdOrCtrl+C"))?)
        .item(&item(app, "paste", "粘贴", Some("CmdOrCtrl+V"))?)
        .item(&item(app, "select-all", "全选", Some("CmdOrCtrl+A"))?)
        .separator()
        .item(&item(app, "find", "查找…", Some("CmdOrCtrl+F"))?)
        .build()?)
}

/// 标签导航:加速键在原生菜单注册后由系统先截获,再 emit 给前端统一处理。
fn build_tab_menu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    Ok(SubmenuBuilder::new(app, "标签")
        .item(&item(app, "prev-tab", "上一个标签", Some("CmdOrCtrl+Shift+BracketLeft"))?)
        .item(&item(app, "next-tab", "下一个标签", Some("CmdOrCtrl+Shift+BracketRight"))?)
        .separator()
        .item(&item(app, "close-other-tabs", "关闭其他标签", None)?)
        .item(&item(app, "close-tabs-right", "关闭右侧标签", None)?)
        .item(&item(app, "close-all-tabs", "关闭全部标签", None)?)
        .build()?)
}

fn build_view_menu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    Ok(SubmenuBuilder::new(app, "视图")
        .item(&item(app, "toggle-sidebar", "显示/隐藏侧栏", Some("CmdOrCtrl+\\"))?)
        .item(&item(app, "toggle-outline", "显示/隐藏大纲", None)?)
        .item(&item(app, "toggle-source", "源码模式", Some("CmdOrCtrl+E"))?)
        .item(&item(app, "reload", "重新从磁盘加载", Some("CmdOrCtrl+Shift+R"))?)
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
