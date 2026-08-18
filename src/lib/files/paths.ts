/** 路径比较 / 地点归属。分隔符统一为正斜杠,Windows 盘符大小写不敏感。 */

export function normalizePath(path: string): string {
  let n = path.trim();
  if (n.startsWith("file://")) {
    try {
      n = decodeURI(n.slice(7));
    } catch {
      n = n.slice(7);
    }
  }
  n = n.replace(/\\/g, "/");
  if (n.startsWith("//")) n = n.slice(1);
  if (typeof n.normalize === "function") n = n.normalize("NFC");
  if (n === "/" || /^[A-Za-z]:\/?$/.test(n)) return n.endsWith("/") ? n : `${n}/`.replace(/\/+$/, "/");
  return n.replace(/\/+$/, "");
}

function fold(path: string): string {
  return normalizePath(path).toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

/** 文件或目录是否落在 folder 之内(含自身) */
export function isInside(file: string, folder: string): boolean {
  const f = fold(file);
  const d = fold(folder).replace(/\/+$/, "");
  return f === d || f.startsWith(`${d}/`);
}

export function dirname(path: string): string {
  const n = normalizePath(path).replace(/\/+$/, "");
  const i = n.lastIndexOf("/");
  if (i <= 0) return i === 0 ? "/" : n;
  const parent = n.slice(0, i);
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}/`;
  return parent;
}

export function folderName(path: string): string {
  const n = normalizePath(path);
  const parts = n.split("/").filter(Boolean);
  return parts.at(-1) ?? n;
}

export function joinPath(dir: string, name: string): string {
  const d = normalizePath(dir);
  if (d === "/" || /^[A-Za-z]:\/$/.test(d)) return `${d}${name}`;
  return `${d.replace(/\/+$/, "")}/${name}`;
}

/** 相对路径;不在 folder 内则退回文件名 */
export function relativeTo(file: string, folder: string): string {
  const f = normalizePath(file);
  const d = normalizePath(folder).replace(/\/+$/, "");
  const fl = fold(f);
  const dl = fold(d);
  if (fl === dl) return folderName(file);
  if (fl.startsWith(`${dl}/`)) return f.slice(d.length + 1);
  return folderName(file);
}

/** 文件落在哪个地点里(最长前缀,处理地点嵌套) */
export function findContainingPlace(file: string, places: string[]): string | null {
  let best: string | null = null;
  for (const p of places) {
    if (!isInside(file, p)) continue;
    if (!best || normalizePath(p).length > normalizePath(best).length) best = p;
  }
  return best;
}

/** 路径或其子孙:把 from 前缀换成 to */
export function rewritePrefix(path: string, from: string, to: string): string {
  if (samePath(path, from)) return to;
  const p = normalizePath(path);
  const f = normalizePath(from);
  if (fold(p).startsWith(`${fold(f)}/`)) return `${to}${p.slice(f.length)}`;
  return path;
}

export function uniquePaths(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    if (!p) continue;
    if (!out.some((x) => samePath(x, p))) out.push(p);
  }
  return out;
}

const MD_EXT = [".md", ".markdown", ".mdown", ".mkd", ".mdx"];

/** 是否 Markdown 系文件(拖放 / 打开时过滤) */
export function isMarkdownPath(path: string): boolean {
  const n = normalizePath(path).toLowerCase();
  return MD_EXT.some((ext) => n.endsWith(ext));
}
