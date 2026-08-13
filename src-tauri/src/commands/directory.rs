use std::path::Path;

use serde::Serialize;

/// 目录树扫描:递归列出目录与 Markdown 文件(供左侧"文件列表面板")。
/// 与 read_document 同模式 —— std::fs 直读,不依赖 fs 插件 scope。
///
/// 规则:
/// - 深度上限 4(避免超大目录拖死 UI;再深由用户自行展开需求驱动);
/// - 跳过隐藏项(dot 前缀,含 .git)、node_modules、符号链接(防环);
/// - 只收 Markdown 系文件;目录全收。
const MAX_DEPTH: usize = 4;

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// 相对根的层级(根自身为 0)
    pub depth: usize,
}

fn is_markdown(name: &str) -> bool {
    ["md", "markdown", "mdown", "mkd", "mdx"]
        .iter()
        .any(|ext| name.to_lowercase().ends_with(&format!(".{ext}")))
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<DirEntry>) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Ok(());
    }
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .map_err(|e| format!("读取目录失败: {e}"))?
        .filter_map(|e| e.ok())
        .collect();
    // 稳定排序:目录在前,同级按文件名
    entries.sort_by_key(|e| {
        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        (!is_dir, e.file_name())
    });
    for entry in entries {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue; // 隐藏项(.git 等)
        }
        if name == "node_modules" {
            continue;
        }
        let ft = entry.file_type().map_err(|e| format!("读取文件类型失败: {e}"))?;
        // 符号链接(含指向目录的)一律跳过,防循环
        if ft.is_symlink() {
            continue;
        }
        let path = entry.path();
        if ft.is_dir() {
            out.push(DirEntry {
                name: name.clone(),
                path: path.display().to_string(),
                is_dir: true,
                depth,
            });
            walk(&path, depth + 1, out)?;
        } else if ft.is_file() && is_markdown(&name) {
            out.push(DirEntry {
                name,
                path: path.display().to_string(),
                is_dir: false,
                depth,
            });
        }
    }
    Ok(())
}

/// scan_directory:返回扁平目录树(带 depth),前端按 depth 缩进渲染。
#[tauri::command]
pub fn scan_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err("所选路径不是目录".to_string());
    }
    let mut out = Vec::new();
    walk(root, 0, &mut out)?;
    Ok(out)
}
