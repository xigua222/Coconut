mod app_menu;
mod commands;
mod open_router;
mod state;

use std::path::PathBuf;

use tauri::RunEvent;
use tauri_plugin_single_instance::init as single_instance;

/// run() 组装一切:
/// 1. 注册全部插件;single-instance 回调把二次启动 argv 交给 open_router;
/// 2. invoke_handler 挂 commands::*;
/// 3. setup() 解析首启 argv 存入 PendingOpens(此时前端未就绪);
/// 4. run 循环处理 macOS 的 RunEvent::Opened → open_router;
/// 5. frontend_ready command 被调用时清空 PendingOpens 逐个 emit open-file。
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(single_instance(|app, argv, _cwd| {
            let paths: Vec<PathBuf> = argv.iter().skip(1).map(PathBuf::from).collect();
            open_router::route(app, paths);
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::file_io::read_document,
            commands::file_io::write_document,
            commands::directory::scan_directory,
            commands::export::export_html,
            commands::export::export_pdf,
            commands::frontend_ready,
            commands::sync_recent_menu,
        ])
        .setup(|app| {
            use tauri::Manager;

            // Windows/Linux 双击关联文件:文件路径以 argv 传入
            let paths: Vec<PathBuf> = std::env::args().skip(1).map(PathBuf::from).collect();
            open_router::route(app.handle(), paths);
            // 原生菜单(含"打开最近"动态子菜单)+ 菜单事件路由
            app.on_menu_event(|app_handle, event| app_menu::handle_menu_event(app_handle, event));
            let menu = app_menu::build(app.handle())?;
            app.set_menu(menu)?;
            // 窗口尺寸合理性校验:window-state 恢复的尺寸若超过显示器工作区
            // (如无头环境下保存了物理像素当逻辑尺寸),重置为默认,避免
            // 窗口超出屏幕导致 UI 溢出/留白。
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = win.current_monitor() {
                    let monitor_size = monitor.size().to_logical::<f64>(monitor.scale_factor());
                    let win_size = win.outer_size().unwrap_or_default().to_logical::<f64>(win.scale_factor().unwrap_or(1.0));
                    if win_size.width > monitor_size.width || win_size.height > monitor_size.height {
                        win.set_size(tauri::LogicalSize::new(1100.0, 760.0))?;
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // macOS:文件关联打开通过 Opened 事件送达
        if let RunEvent::Opened { urls } = event {
            let paths: Vec<PathBuf> = urls.iter().filter_map(|u| u.to_file_path().ok()).collect();
            open_router::route(app_handle, paths);
        }
    });
}
