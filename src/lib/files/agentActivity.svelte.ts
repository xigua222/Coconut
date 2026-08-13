/**
 * Agent 活动指示器状态(标题栏小圆点)。
 * 数据源:文件 watcher 事件(document.svelte.ts)+ 目录面板 rescan(treeStore)。
 * writing=外部(如 Claude Code)正在连续写文件;done=本轮写完,数秒后回落 idle。
 */
export const agentActivity = $state({
  state: "idle" as "idle" | "writing" | "done",
  /** 最近一次外部事件时间戳(供 TopBar 做回落定时) */
  lastEvent: 0,
});

/** 检测到外部写入事件(尚未完成重载/rescan) */
export function markWriting(): void {
  agentActivity.state = "writing";
  agentActivity.lastEvent = Date.now();
}

/** 外部变更处理完成(重载/rescan 结束) */
export function markDone(): void {
  agentActivity.state = "done";
  agentActivity.lastEvent = Date.now();
}
