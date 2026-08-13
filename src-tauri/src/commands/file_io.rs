use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// 拒绝 > 50 MB 的文件
const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;

#[derive(Serialize)]
pub struct ReadResult {
    pub content: String,
    pub encoding: String,
    pub mtime: u64,
}

/// 写盘错误:kind="conflict" 表示 mtime 冲突(文件被外部修改),
/// 前端据此弹 ConflictBanner 流程;其余为 io 错误。
#[derive(Serialize)]
pub struct WriteError {
    pub kind: &'static str,
    pub message: String,
}

impl WriteError {
    fn conflict(msg: impl Into<String>) -> Self {
        Self { kind: "conflict", message: msg.into() }
    }
    fn io(msg: impl std::fmt::Display) -> Self {
        Self { kind: "io", message: msg.to_string() }
    }
}

fn mtime_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 读 bytes → chardetng 检测 → encoding_rs 解码为 UTF-8。
fn decode(bytes: &[u8]) -> (String, String) {
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    let encoding = detector.guess(None, true);

    let mut content = if encoding == encoding_rs::UTF_8 {
        String::from_utf8_lossy(bytes).into_owned()
    } else {
        let (cow, _enc, had_errors) = encoding.decode(bytes);
        let mut s = cow.into_owned();
        if had_errors {
            // 检测失败:退化为 UTF-8 无损读取
            s = String::from_utf8_lossy(bytes).into_owned();
            return (strip_bom(&s), "UTF-8(检测不准)".to_string());
        }
        strip_bom(&s)
    };
    // 去掉 UTF-8 BOM
    if let Some(stripped) = content.strip_prefix('\u{feff}') {
        content = stripped.to_string();
    }
    let label = if encoding == encoding_rs::UTF_8 { "UTF-8".to_string() } else { encoding.name().to_string() };
    (content, label)
}

fn strip_bom(s: &str) -> String {
    match s.strip_prefix('\u{feff}') {
        Some(rest) => rest.to_string(),
        None => s.to_string(),
    }
}

/// read_document:编码检测转 UTF-8,返回 { content, encoding, mtime }。
#[tauri::command]
pub fn read_document(path: String) -> Result<ReadResult, String> {
    let path = Path::new(&path);
    let meta = std::fs::metadata(path).map_err(|e| format!("无法读取文件元数据: {e}"))?;
    if meta.len() > MAX_FILE_SIZE {
        return Err("文件超过 50MB,拒绝打开".to_string());
    }
    let bytes = std::fs::read(path).map_err(|e| format!("无法读取文件: {e}"))?;
    let (content, encoding) = decode(&bytes);
    Ok(ReadResult { content, encoding, mtime: mtime_ms(&meta) })
}

/// write_document:原子写(同目录临时文件 + rename),保留原文件权限;
/// 始终以 UTF-8 写出(打开非 UTF-8 文件时前端状态栏会标注"保存将转为 UTF-8")。
/// expected_mtime 为 None 时跳过校验(强制写,用于"保留当前版本"与另存为)。
#[tauri::command]
pub fn write_document(
    path: String,
    content: String,
    expected_mtime: Option<u64>,
) -> Result<serde_json::Value, WriteError> {
    let path = Path::new(&path);
    let meta = std::fs::metadata(path).map_err(WriteError::io)?;

    if let Some(expected) = expected_mtime {
        if mtime_ms(&meta) != expected {
            return Err(WriteError::conflict("文件已被外部修改,保存已中止"));
        }
    }

    // 原子写:同目录临时文件 + rename;保留原文件权限
    let dir = path.parent().unwrap_or(Path::new("."));
    let file_name = path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_else(|| "document.md".to_string());
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let tmp_path = dir.join(format!(".{file_name}.{}.{nanos}.tmp", std::process::id()));

    if let Err(e) = std::fs::write(&tmp_path, content.as_bytes()) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(WriteError::io(format!("写入临时文件失败: {e}")));
    }
    let _ = std::fs::set_permissions(&tmp_path, meta.permissions());
    if let Err(e) = std::fs::rename(&tmp_path, path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(WriteError::io(format!("替换目标文件失败: {e}")));
    }

    let new_meta = std::fs::metadata(path).map_err(WriteError::io)?;
    Ok(serde_json::json!({ "mtime": mtime_ms(&new_meta) }))
}
