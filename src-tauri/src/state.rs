use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

/// 全局状态:前端就绪前收到的打开请求先入队,就绪后一次性 flush。
#[derive(Default)]
pub struct AppState {
    pub pending_opens: Mutex<Vec<PathBuf>>,
    pub frontend_ready: AtomicBool,
}
