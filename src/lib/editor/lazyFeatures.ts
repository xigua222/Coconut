/**
 * 内容嗅探(预留)。
 *
 * 注:mermaid 图表渲染在 Milkdown v7 下不可行:
 * - @milkdown/plugin-diagram@7.7.0 与 Crepe 7.22 版本不兼容(vite 预构建下
 *   模块身份分裂,动态挂载抛 "plugin is not a function",升级从未生效);
 * - 动态 editor.use() 会触发 Milkdown 重建编辑器,打断输入法合成
 *   (composition),导致输入回退/内容消失/高度抖动 —— 实测复现。
 * 因此 ```mermaid 等内容以代码块(CodeMirror,语法高亮)形式呈现,
 * 语法无损、roundtrip 无损。待 Milkdown v8 发布后可恢复按需渲染。
 */
export function needsDiagram(_md: string): boolean {
  return false;
}
