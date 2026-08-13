pub mod directory;
pub mod export;
pub mod file_io;

use crate::{app_menu, open_router};

/// 启动握手:前端事件监听注册完成后调用,清空 PendingOpens 逐个 emit open-file。
#[tauri::command]
pub fn frontend_ready(app: tauri::AppHandle) {
    open_router::flush(&app);
}

/// 最近文件变化时由前端调用:重建"打开最近"子菜单
#[tauri::command]
pub fn sync_recent_menu(app: tauri::AppHandle) -> Result<(), String> {
    let menu = app_menu::build(&app).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}
