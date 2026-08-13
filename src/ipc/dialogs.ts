/**
 * 系统对话框封装(dialog 插件走独立 JS API,不是 invoke,
 * 因此单独成文件,保持 commands.ts 只含 invoke 封装)。
 */
import { open, save } from "@tauri-apps/plugin-dialog";

export const MD_FILTERS = [
  {
    name: "Markdown",
    extensions: ["md", "markdown", "mdown", "mkd", "mdx"],
  },
];

/** 打开文件选择对话框,返回选中路径数组(取消返回 []) */
export async function pickFiles(): Promise<string[]> {
  const result = await open({ multiple: true, filters: MD_FILTERS });
  if (result === null) return [];
  return Array.isArray(result) ? result : [result];
}

/** 保存对话框,返回目标路径(取消返回 null) */
export async function pickSavePath(defaultName: string): Promise<string | null> {
  return await save({ defaultPath: defaultName, filters: MD_FILTERS });
}

/** 选择目录(文件列表面板根目录),返回路径(取消返回 null) */
export async function pickFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}
