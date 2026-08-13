/** 平台判定与键位显示归一(⌘ vs Ctrl)。 */

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
export const isWindows = typeof navigator !== "undefined" && /Win/.test(navigator.userAgent);
export const isLinux = !isMac && !isWindows;

/** 修饰键显示名:macOS 显示 ⌘,其余显示 Ctrl */
export const modKey = isMac ? "⌘" : "Ctrl";

/** 生成短唯一 id(WebView 非安全上下文时 crypto.randomUUID 不可用) */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** 取路径的文件名(兼容 win/mac 分隔符) */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
