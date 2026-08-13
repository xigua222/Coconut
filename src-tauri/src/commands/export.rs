use comrak::{markdown_to_html, Options};
use std::path::Path;

/// export_html:comrak 开 GFM 全套 options 渲染,配合前端 dialog 存盘。
/// 渲染前预处理:==高亮== → <mark>(编辑器同款语法)、本地图片 → base64
/// 内嵌(打印/分享时图片不依赖原路径)。
#[tauri::command]
pub fn export_html(content: String) -> Result<String, String> {
    let mut opts = Options::default();
    opts.extension.strikethrough = true;
    opts.extension.table = true;
    opts.extension.autolink = true;
    opts.extension.tasklist = true;
    opts.extension.tagfilter = true;
    opts.parse.smart = true;
    // 预处理产物含 <mark> 与 data URI,需要放行原始 HTML
    opts.render.unsafe_ = true;
    let prepared = preprocess(&content);
    Ok(markdown_to_html(&prepared, &opts))
}

/// 逐行预处理(跳过 ``` 围栏代码块):==高亮== → <mark>,图片 → data URI。
fn preprocess(content: &str) -> String {
    let mut out = String::with_capacity(content.len() + content.len() / 8);
    let mut in_fence = false;
    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") {
            in_fence = !in_fence;
            out.push_str(line);
            out.push('\n');
            continue;
        }
        if !in_fence {
            let hl = highlight(line);
            out.push_str(&embed_images(&hl));
            out.push('\n');
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    out
}

/// ==text== → <mark>text</mark>;内容不允许含 =(与编辑器解析一致),
/// 未闭合的 == 原样保留。
fn highlight(line: &str) -> String {
    let bytes = line.as_bytes();
    let mut out = String::with_capacity(line.len());
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'=' && bytes[i + 1] == b'=' {
            if let Some(close_rel) = find_close(bytes, i + 2) {
                let start = i + 2;
                let end = start + close_rel;
                out.push_str("<mark>");
                out.push_str(&line[start..end]);
                out.push_str("</mark>");
                i = end + 2;
                continue;
            }
        }
        let ch_len = utf8_len(bytes[i]);
        out.push_str(&line[i..i + ch_len]);
        i += ch_len;
    }
    out
}

/// 从 start 起找 "==",要求中间非空且不含 '='
fn find_close(bytes: &[u8], start: usize) -> Option<usize> {
    let mut j = start;
    while j + 1 < bytes.len() {
        if bytes[j] == b'=' && bytes[j + 1] == b'=' {
            let mid = &bytes[start..j];
            if !mid.is_empty() && mid.iter().all(|&b| b != b'=') {
                return Some(j - start);
            }
        }
        j += 1;
    }
    None
}

/// UTF-8 首字节 → 字符字节数
fn utf8_len(b: u8) -> usize {
    if b < 0x80 {
        1
    } else if b >> 5 == 0b110 {
        2
    } else if b >> 4 == 0b1110 {
        3
    } else {
        4
    }
}

/// ![alt](本地路径) → base64 data URI;远程/不存在/非图片原样保留。
fn embed_images(line: &str) -> String {
    let bytes = line.as_bytes();
    let mut out = String::with_capacity(line.len());
    let mut i = 0;
    while i < bytes.len() {
        // 找 "!["
        if i + 1 < bytes.len() && bytes[i] == b'!' && bytes[i + 1] == b'[' {
            // 找 "](path)"
            if let Some(open_rel) = find_sub(bytes, i + 2, b']') {
                if open_rel + 1 < bytes.len() - i && bytes[i + 2 + open_rel + 1] == b'(' {
                    let path_start = i + 2 + open_rel + 2;
                    let close = find_close_paren(bytes, path_start);
                    if let Some(close_rel) = close {
                        let path_str = &line[path_start..path_start + close_rel];
                        let data = local_image_data_uri(path_str);
                        match data {
                            Some(uri) => {
                                out.push_str(&line[i..i + 2 + open_rel]); // ![alt]
                                out.push_str("](");
                                out.push_str(&uri);
                                out.push(')');
                                i = path_start + close_rel + 1;
                                continue;
                            }
                            None => {
                                // 非本地图片:原样复制到 "]( 之前,继续扫描
                                out.push_str(&line[i..path_start - 1]);
                                i = path_start - 1;
                                continue;
                            }
                        }
                    }
                }
            }
        }
        let ch_len = utf8_len(bytes[i]);
        out.push_str(&line[i..i + ch_len]);
        i += ch_len;
    }
    out
}

/// 找目标字节的位置(相对 start)
fn find_sub(bytes: &[u8], start: usize, target: u8) -> Option<usize> {
    (start..bytes.len()).find(|&i| bytes[i] == target).map(|i| i - start)
}

/// 找未转义闭合括号(简单处理:不处理括号嵌套,遇转义跳过)
fn find_close_paren(bytes: &[u8], start: usize) -> Option<usize> {
    let mut i = start;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            i += 2;
            continue;
        }
        if bytes[i] == b')' {
            return Some(i - start);
        }
        i += 1;
    }
    None
}

/// 本地图片文件 → "data:<mime>;base64,<...>";否则 None
fn local_image_data_uri(path_str: &str) -> Option<String> {
    let path = Path::new(path_str.trim());
    if !path.is_file() {
        return None;
    }
    let mime = match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        _ => return None,
    };
    use base64::Engine;
    let bytes = std::fs::read(path).ok()?;
    // 拒绝超大图(>8MB),防止导出 HTML 膨胀
    if bytes.len() > 8 * 1024 * 1024 {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{mime};base64,{b64}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn highlight_basic() {
        assert_eq!(highlight("a ==高亮== b"), "a <mark>高亮</mark> b");
        assert_eq!(highlight("==开头== 和 ==结尾=="), "<mark>开头</mark> 和 <mark>结尾</mark>");
    }

    #[test]
    fn highlight_untouched() {
        // 未闭合/内容含 = /围栏内
        assert_eq!(highlight("未闭合 == 保留"), "未闭合 == 保留");
        assert_eq!(highlight("===x==="), "=<mark>x</mark>=");
        let src = "```\n==围栏内==\n```";
        let out = preprocess(src);
        assert!(out.contains("==围栏内=="), "围栏内不应被替换: {out}");
        assert!(!out.contains("<mark>"), "围栏内不应出现 mark: {out}");
    }

    #[test]
    fn preprocess_skips_fence() {
        let src = "正文 ==高亮==\n\n```js\nconst s = \"==原样==\";\n```";
        let out = preprocess(src);
        assert!(out.contains("<mark>高亮</mark>"));
        assert!(out.contains("\"==原样==\""));
    }

    #[test]
    fn image_remote_untouched() {
        assert_eq!(embed_images("![a](https://x.com/a.png)"), "![a](https://x.com/a.png)");
        assert_eq!(embed_images("![a](/nonexistent.png)"), "![a](/nonexistent.png)");
    }
}

/// export_pdf:把渲染好的完整 HTML 通过隐藏 WebView 的原生打印对话框输出
/// (macOS 打印面板自带"存储为 PDF");非 macOS 降级为用系统默认浏览器
/// 打开生成的 HTML,由用户自行打印/存 PDF。
#[tauri::command]
pub fn export_pdf(app: tauri::AppHandle, html: String) -> Result<(), String> {
    use tauri::Manager;

    let cache_dir = app.path().app_cache_dir().map_err(|e| format!("无法定位缓存目录: {e}"))?;
    let print_dir = cache_dir.join("print");
    std::fs::create_dir_all(&print_dir).map_err(|e| format!("无法创建打印目录: {e}"))?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let html_path = print_dir.join(format!("print-{nanos}.html"));
    std::fs::write(&html_path, html).map_err(|e| format!("无法写入临时文件: {e}"))?;

    #[cfg(target_os = "macos")]
    {
        use tauri::webview::PageLoadEvent;
        use tauri::{WebviewUrl, WebviewWindowBuilder};

        let url = tauri::Url::from_file_path(&html_path).map_err(|_| "无法解析临时文件路径".to_string())?;
        let label = format!("print-{nanos}");
        let html_path_inner = html_path.clone();
        let _window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
            .inner_size(800.0, 1100.0)
            .visible(false)
            .on_page_load(move |win, payload| {
                if payload.event() == PageLoadEvent::Finished {
                    let _ = win.print();
                    let _ = std::fs::remove_file(&html_path_inner);
                    let _ = win.destroy();
                }
            })
            .build()
            .map_err(|e| format!("无法创建打印窗口: {e}"))?;

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_opener::OpenerExt;
        let _ = app.opener().open_path(html_path, None::<&str>);
        Ok(())
    }
}
