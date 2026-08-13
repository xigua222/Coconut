use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

/// 扩展名白名单(与 tauri.conf.json 的 fileAssociations 保持一致)
const EXT_WHITELIST: [&str; 5] = ["md", "markdown", "mdown", "mkd", "mdx"];

fn is_openable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => EXT_WHITELIST.iter().any(|w| ext.eq_ignore_ascii_case(w)),
        None => false,
    }
}

fn canonical(path: PathBuf) -> PathBuf {
    path.canonicalize().unwrap_or(path)
}

/// 统一的"要打开某文件"入口。
/// 前端已就绪 → 直接 emit `open-file` 并聚焦主窗口;未就绪 → 压入 PendingOpens。
pub fn route(app: &AppHandle, paths: Vec<PathBuf>) {
    let paths: Vec<PathBuf> = paths.into_iter().filter(|p| is_openable(p)).map(canonical).collect();
    if paths.is_empty() {
        return;
    }
    let state = app.state::<AppState>();
    if state.frontend_ready.load(Ordering::SeqCst) {
        for p in paths {
            emit_open(app, &p);
        }
    } else {
        let mut pending = state.pending_opens.lock().unwrap();
        for p in paths {
            if !pending.contains(&p) {
                pending.push(p);
            }
        }
    }
}

/// frontend_ready command 调用时:标记就绪并 flush 队列
pub fn flush(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.frontend_ready.store(true, Ordering::SeqCst);
    let pending: Vec<PathBuf> = std::mem::take(&mut *state.pending_opens.lock().unwrap());
    for p in pending {
        emit_open(app, &p);
    }
}

fn emit_open(app: &AppHandle, path: &Path) {
    let payload = serde_json::json!({ "path": path.to_string_lossy() });
    let _ = app.emit("open-file", payload);
    // 聚焦并置顶主窗口(二次启动 / macOS Opened 场景)
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}
