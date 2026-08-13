import { watch, type UnwatchFn } from "@tauri-apps/plugin-fs";

/**
 * 封装 tauri-plugin-fs 的 watch。
 * watchFile(path, cb) 返回取消函数;内部 500ms 去抖
 * (编辑器自身保存也会触发事件,由调用方通过 mtime 对比过滤自写事件)。
 */
export function watchFile(path: string, onEvent: () => void): () => void {
  let stopped = false;
  let unlisten: UnwatchFn | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  void watch(path, () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!stopped) onEvent();
    }, 500);
  }).then((u) => {
    if (stopped) u();
    else unlisten = u;
  });

  return () => {
    stopped = true;
    clearTimeout(timer);
    unlisten?.();
  };
}
