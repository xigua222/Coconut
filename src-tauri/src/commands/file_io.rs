use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// 拒绝 > 50 MB 的文件
pub(crate) const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;
pub(crate) const PREVIEW_CHARS: usize = 32_000;

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

pub(crate) fn mtime_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 读 bytes → chardetng 检测 → encoding_rs 解码为 UTF-8。
pub(crate) fn decode(bytes: &[u8]) -> (String, String) {
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

pub(crate) fn take_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    s.chars().take(max).collect()
}

/// 搜索索引用:读失败返回 None。
pub(crate) fn read_preview(path: &Path) -> Option<(String, u64)> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() > MAX_FILE_SIZE {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let (content, _) = decode(&bytes);
    Some((take_chars(&content, PREVIEW_CHARS), mtime_ms(&meta)))
}

/// write_document:原子写(同目录临时文件 + rename),保留原文件权限;
/// 始终以 UTF-8 写出(打开非 UTF-8 文件时前端状态栏会标注"保存将转为 UTF-8")。
/// expected_mtime 为 None 时跳过校验(强制写,用于新建、"保留当前版本"与另存为)。
#[tauri::command]
pub fn write_document(
    path: String,
    content: String,
    expected_mtime: Option<u64>,
) -> Result<serde_json::Value, WriteError> {
    let path = Path::new(&path);
    let meta = std::fs::metadata(path).ok();

    if let Some(meta) = &meta {
        if let Some(expected) = expected_mtime {
            if mtime_ms(meta) != expected {
                return Err(WriteError::conflict("文件已被外部修改,保存已中止"));
            }
        }
    } else if expected_mtime.is_some() {
        return Err(WriteError::io("找不到文件"));
    } else if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(WriteError::io)?;
    }

    atomic_write(path, &content, meta.as_ref().map(|m| m.permissions()))?;
    let new_meta = std::fs::metadata(path).map_err(WriteError::io)?;
    Ok(serde_json::json!({ "mtime": mtime_ms(&new_meta) }))
}

fn atomic_write(path: &Path, content: &str, permissions: Option<std::fs::Permissions>) -> Result<(), WriteError> {
    let dir = path.parent().unwrap_or(Path::new("."));
    let file_name = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "document.md".to_string());
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let tmp_path = dir.join(format!(".{file_name}.{}.{nanos}.tmp", std::process::id()));

    if let Err(e) = std::fs::write(&tmp_path, content.as_bytes()) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(WriteError::io(format!("写入临时文件失败: {e}")));
    }
    if let Some(perm) = permissions {
        let _ = std::fs::set_permissions(&tmp_path, perm);
    }
    if let Err(e) = std::fs::rename(&tmp_path, path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(WriteError::io(format!("替换目标文件失败: {e}")));
    }
    Ok(())
}

/// 同目录改名。`to_name` 只允许文件/文件夹名,不能含路径分隔符。
#[tauri::command]
pub fn rename_path(from: String, to_name: String) -> Result<String, String> {
    let from_path = Path::new(&from);
    if !from_path.exists() {
        return Err("找不到这个文件".into());
    }
    let name = to_name.trim();
    if name.is_empty() {
        return Err("名字不能为空".into());
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') || name == "." || name == ".." {
        return Err("名字无效".into());
    }
    let parent = from_path.parent().ok_or("无法改名")?;
    let dest = parent.join(name);
    if dest == from_path {
        return Ok(from);
    }
    if dest.exists() {
        let same = match (std::fs::canonicalize(from_path), std::fs::canonicalize(&dest)) {
            (Ok(a), Ok(b)) => a == b,
            _ => false,
        };
        if !same {
            return Err("已有同名文件".into());
        }
        // 大小写-only 改名:先挪到临时名再落到目标(大小写不敏感磁盘)
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let tmp = parent.join(format!(".{}.{nanos}.rename-tmp", std::process::id()));
        std::fs::rename(from_path, &tmp).map_err(|e| format!("改名失败: {e}"))?;
        if let Err(e) = std::fs::rename(&tmp, &dest) {
            let _ = std::fs::rename(&tmp, from_path);
            return Err(format!("改名失败: {e}"));
        }
        return Ok(dest.to_string_lossy().into_owned());
    }
    std::fs::rename(from_path, &dest).map_err(|e| format!("改名失败: {e}"))?;
    Ok(dest.to_string_lossy().into_owned())
}

/// 移到系统废纸篓/回收站(可还原)。走 std::fs 之外的 trash crate,不依赖 fs 插件 remove 权限。
#[tauri::command]
pub fn trash_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("找不到这个文件".into());
    }
    trash::delete(p).map_err(|e| format!("无法移到废纸篓: {e}"))
}

#[derive(Serialize)]
pub struct FileStat {
    pub path: String,
    pub size: Option<u64>,
    pub mtime: Option<u64>,
}

/// 批量读文件大小与修改时间;缺失文件 size/mtime 为 None,不中断整表。
#[tauri::command]
pub fn stat_files(paths: Vec<String>) -> Vec<FileStat> {
    paths
        .into_iter()
        .map(|path| match std::fs::metadata(&path) {
            Ok(meta) => FileStat {
                path,
                size: Some(meta.len()),
                mtime: Some(mtime_ms(&meta)),
            },
            Err(_) => FileStat {
                path,
                size: None,
                mtime: None,
            },
        })
        .collect()
}
