import type { CSSProperties } from "react";

/** 系统标题栏拖拽条:交给 Tauri 的 data-tauri-drag-region(单击拖、双击缩放)。 */
export function WindowDragRegion({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={className} style={style} data-tauri-drag-region />;
}
