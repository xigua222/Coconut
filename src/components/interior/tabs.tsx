/*
 * tabs.tsx — from ddoemonn/interior (https://github.com/ddoemonn/interior)
 * MIT License, Copyright (c) 2025 interior.dev contributors.
 * Copied for coconut; 视觉层经 interior.css shim 映射到 coconut token。
 * https://www.interior.dev/docs/tabs
 */
"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
  RefObject,
  WheelEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { useReorderList } from "./reorder-list";

const DRAG_THRESHOLD = 4;

function moveIndex<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [taken] = next.splice(from, 1);
  next.splice(to, 0, taken);
  return next;
}

const INDICATOR = { type: "spring", stiffness: 620, damping: 42, mass: 0.35 } as const;

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const PANEL = { type: "spring", stiffness: 460, damping: 38, mass: 0.8 } as const;

export type TabItem = {
  value: string;
  label: string;
  disabled?: boolean;
  /** 原生 title 提示(标签放全路径等) */
  hint?: string;
};

export type TabsActivation = "automatic" | "manual";
export type UseTabsOptions = {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  activation?: TabsActivation;
};

export function useTabs({
  items,
  value: controlled,
  defaultValue,
  onValueChange,
  activation = "automatic",
}: UseTabsOptions) {
  const base = useId();
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const direction = useRef(1);

  const [internal, setInternal] = useState(
    () => defaultValue ?? items.find((i) => !i.disabled)?.value ?? items[0]?.value ?? "",
  );

  const value = controlled ?? internal;

  const emit = useRef(onValueChange);
  emit.current = onValueChange;

  const select = useCallback(
    (next: string) => {
      if (next === value) return;
      const from = items.findIndex((i) => i.value === value);
      const to = items.findIndex((i) => i.value === next);
      direction.current = to < from ? -1 : 1;
      if (controlled === undefined) setInternal(next);
      emit.current?.(next);
    },
    [controlled, items, value],
  );

  const focusAt = useCallback(
    (i: number) => {
      const item = items[i];
      if (!item) return;
      nodes.current.get(item.value)?.focus();
    },
    [items],
  );

  const nextEnabled = useCallback(
    (from: number, dir: number) => {
      const n = items.length;
      let i = from < 0 ? 0 : from;
      for (let k = 0; k < n; k += 1) {
        i = (i + dir + n) % n;
        if (!items[i].disabled) return i;
      }
      return from;
    },
    [items],
  );

  const endStop = useCallback(
    (dir: number) => {
      const n = items.length;
      if (dir > 0) {
        for (let i = 0; i < n; i += 1) if (!items[i].disabled) return i;
      } else {
        for (let i = n - 1; i >= 0; i -= 1) if (!items[i].disabled) return i;
      }
      return 0;
    },
    [items],
  );

  const getTabProps = useCallback(
    (item: TabItem, index: number) => ({
      id: `${base}-tab-${item.value}`,
      role: "tab" as const,
      type: "button" as const,
      "aria-selected": item.value === value,
      "aria-controls": `${base}-panel-${item.value}`,
      "aria-disabled": item.disabled ? (true as const) : undefined,
      tabIndex: item.value === value ? 0 : -1,
      ref: (node: HTMLButtonElement | null) => {
        if (node) nodes.current.set(item.value, node);
        else nodes.current.delete(item.value);
      },
      onClick: () => {
        if (!item.disabled) select(item.value);
      },
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const to = nextEnabled(index, e.key === "ArrowRight" ? 1 : -1);
          focusAt(to);
          if (activation === "automatic") select(items[to].value);
          return;
        }
        if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          const to = endStop(e.key === "Home" ? 1 : -1);
          focusAt(to);
          if (activation === "automatic") select(items[to].value);
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!item.disabled) select(item.value);
        }
      },
    }),
    [activation, base, endStop, focusAt, items, nextEnabled, select, value],
  );

  const getPanelProps = useCallback(
    (panelValue: string) => ({
      id: `${base}-panel-${panelValue}`,
      role: "tabpanel" as const,
      "aria-labelledby": `${base}-tab-${panelValue}`,
      tabIndex: 0,
    }),
    [base],
  );

  const tabListProps = {
    role: "tablist" as const,
    "aria-orientation": "horizontal" as const,
  };

  return {
    value,
    select,
    direction: direction.current,
    tabListProps,
    getTabProps,
    getPanelProps,
  };
}

export type UseTabsReturn = ReturnType<typeof useTabs>;

export type TabsProps = {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  activation?: TabsActivation;
  renderPanel?: (value: string) => ReactNode;
  label?: string;
  panelClassName?: string;
  className?: string;
  /** 渲染在 tablist 末尾(如新建),与标签同一条轨道,不参与横向滚动与换位 */
  trailing?: ReactNode;
  /** 每个标签右侧附加内容(如关闭),点按需自行 stopPropagation */
  renderTabEnd?: (item: TabItem, selected: boolean) => ReactNode;
  /** 传入后可拖动换位;值为各 tab 的 value,顺序即新次序 */
  onReorder?: (values: string[]) => void;
  /**
   * 右键标签轨道:落在某个标签上给它的 value,落在空隙里给 null。
   * 不 preventDefault,便于外层 ContextMenu 在冒泡阶段接着开菜单。
   */
  onTabContextMenu?: (value: string | null) => void;
  /** 中键点击某个标签(浏览器风格的关闭手势) */
  onTabAuxClick?: (value: string) => void;
};

const TAB_BTN =
  "relative flex h-8 min-w-0 shrink-0 items-center justify-start gap-1 rounded-t-[8px] px-3.5 text-[12.5px] outline-none transition-colors duration-150 after:pointer-events-none after:absolute after:inset-0 after:rounded-t-[8px] after:content-[''] focus-visible:after:shadow-[inset_0_0_0_1px_#4568FF] dark:focus-visible:after:shadow-[inset_0_0_0_1px_#93B0FF]";

function tabTone(item: TabItem, selected: boolean) {
  if (item.disabled) return "cursor-default text-stone-400 dark:text-stone-500";
  if (selected) return "text-stone-800 dark:text-stone-100";
  return "text-stone-500 hover:bg-stone-200/50 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-white/[0.05] dark:hover:text-stone-200";
}

function TabLabel({ label, selected }: { label: string; selected: boolean }) {
  return (
    <span className="relative grid min-w-0 items-center justify-items-stretch leading-none">
      <span aria-hidden className="invisible col-start-1 row-start-1 truncate font-medium">
        {label}
      </span>
      <span className={`col-start-1 row-start-1 truncate ${selected ? "font-medium" : ""}`}>{label}</span>
    </span>
  );
}

function ReorderTab({
  item,
  selected,
  disabled,
  lifted,
  tabProps,
  hintId,
  renderTabEnd,
  register,
  onKeyDown,
  dragBind,
  suppressClick,
  onContextMenu,
  onAuxClick,
}: {
  item: TabItem;
  selected: boolean;
  disabled: boolean;
  lifted: boolean;
  tabProps: ReturnType<UseTabsReturn["getTabProps"]>;
  hintId: string;
  renderTabEnd?: (item: TabItem, selected: boolean) => ReactNode;
  register: (id: string, node: HTMLElement | null) => void;
  onKeyDown: (id: string) => (event: KeyboardEvent<HTMLElement>) => void;
  dragBind: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => void;
  };
  /** 拖动刚结束时抑制紧随其后的 click,避免"拖完又跳选" */
  suppressClick: RefObject<boolean>;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  onAuxClick?: (event: MouseEvent<HTMLElement>) => void;
}) {
  return (
    <div
      ref={(node) => register(item.value, node)}
      className={`relative z-[1] flex h-8 shrink-0 ${lifted ? "is-dragging z-[8] cursor-grabbing" : "cursor-grab"}`}
      style={{ touchAction: "none" }}
      onContextMenu={onContextMenu}
      onAuxClick={onAuxClick}
      {...(disabled ? {} : dragBind)}
    >
      <button
        {...tabProps}
        ref={tabProps.ref}
        title={item.hint}
        aria-describedby={hintId}
        aria-pressed={lifted || undefined}
        className={`${TAB_BTN} ${tabTone(item, selected)}`}
        onClick={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            return;
          }
          tabProps.onClick();
        }}
        onKeyDown={(event) => {
          onKeyDown(item.value)(event);
          if (!event.defaultPrevented) tabProps.onKeyDown(event);
        }}
      >
        <TabLabel label={item.label} selected={selected} />
        {renderTabEnd ? <span data-tab-end>{renderTabEnd(item, selected)}</span> : null}
      </button>
    </div>
  );
}

export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  activation = "automatic",
  renderPanel,
  label = "Tabs",
  panelClassName = "",
  className = "",
  trailing,
  renderTabEnd,
  onReorder,
  onTabContextMenu,
  onTabAuxClick,
}: TabsProps) {
  const tabs = useTabs({ items, value, defaultValue, onValueChange, activation });
  const reduced = useReducedMotion() === true;
  const reorderable = typeof onReorder === "function";
  const hintId = useId();

  const reorder = useReorderList({
    items,
    getId: (item) => item.value,
    getLabel: (item) => item.label,
    onReorder: (next) => onReorder?.(next.map((item) => item.value)),
    disabled: !reorderable,
    axis: "x",
  });

  const rowRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [plateau, setPlateau] = useState({ x: 0, width: 0, ready: false });
  const ids = items.map((item) => item.value).join("\0");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const suppressClick = useRef(false);
  const swapLock = useRef(false);
  const lastPointerX = useRef(0);
  const drag = useRef<{
    id: string;
    pointerId: number;
    grabOffset: number;
    originX: number;
    active: boolean;
    captured: boolean;
  } | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const register = useCallback((id: string, node: HTMLElement | null) => {
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  }, []);

  const applyDragTransform = useCallback((id: string, pointerX: number, grabOffset: number) => {
    const el = itemRefs.current.get(id);
    const row = rowRef.current;
    if (!el || !row) return;
    const layoutLeft = row.getBoundingClientRect().left + el.offsetLeft - row.scrollLeft;
    el.style.transform = `translate3d(${pointerX - grabOffset - layoutLeft}px,0,0)`;
  }, []);

  const clearDragTransform = useCallback((id: string) => {
    const el = itemRefs.current.get(id);
    if (el) el.style.transform = "";
  }, []);

  const maybeSwap = useCallback((id: string) => {
    if (swapLock.current) return;
    const el = itemRefs.current.get(id);
    if (!el) return;
    const values = itemsRef.current.map((item) => item.value);
    const from = values.indexOf(id);
    if (from < 0) return;
    const visual = el.getBoundingClientRect();
    const center = visual.left + visual.width / 2;
    const prev = from > 0 ? itemRefs.current.get(values[from - 1]) : undefined;
    const next = from < values.length - 1 ? itemRefs.current.get(values[from + 1]) : undefined;
    let to = from;
    if (prev) {
      const box = prev.getBoundingClientRect();
      if (center < box.left + box.width / 2) to = from - 1;
    }
    if (to === from && next) {
      const box = next.getBoundingClientRect();
      if (center > box.left + box.width / 2) to = from + 1;
    }
    if (to === from) return;
    swapLock.current = true;
    onReorderRef.current?.(moveIndex(values, from, to));
  }, []);

  useIsoLayoutEffect(() => {
    swapLock.current = false;
    const session = drag.current;
    if (!session?.active) return;
    applyDragTransform(session.id, lastPointerX.current, session.grabOffset);
  }, [applyDragTransform, ids]);

  /** 收尾:清变换、放捕获、必要时通知拖动结束 */
  const endDrag = useCallback(
    (id: string, node: HTMLElement | null, pointerId: number) => {
      const session = drag.current;
      drag.current = null;
      clearDragTransform(id);
      setDraggingId(null);
      if (session?.captured && node?.hasPointerCapture(pointerId)) {
        node.releasePointerCapture(pointerId);
      }
      if (session?.active) {
        reorder.onDragEnd(id);
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 40);
      }
    },
    [clearDragTransform, reorder],
  );

  const bindDrag = useCallback(
    (id: string) => ({
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest("[data-tab-end]")) return;
        const el = itemRefs.current.get(id);
        if (!el) return;
        drag.current = {
          id,
          pointerId: event.pointerId,
          grabOffset: event.clientX - el.getBoundingClientRect().left,
          originX: event.clientX,
          active: false,
          captured: false,
        };
        lastPointerX.current = event.clientX;
        suppressClick.current = false;
        // 按下即切换,与系统标签栏一致;也让"按住拖走"的那一下先选中自己。
        tabs.select(id);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const session = drag.current;
        if (!session || session.id !== id || session.pointerId !== event.pointerId) return;
        lastPointerX.current = event.clientX;
        if (!session.active) {
          if (Math.abs(event.clientX - session.originX) < DRAG_THRESHOLD) return;
          session.active = true;
          suppressClick.current = true;
          // 捕获必须等真拖起来再要:在 pointerdown 阶段捕获会把 mousedown/
          // mouseup/click 一并改投到捕获元素上,内层 <button> 的 onClick
          // 就再也收不到,标签会变成"点了没反应"。
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
            session.captured = true;
          } catch {
            // 指针已抬起等竞态:退化为不捕获,拖动仍能跟手
          }
          setDraggingId(id);
          reorder.onDragStart(id);
        }
        applyDragTransform(id, event.clientX, session.grabOffset);
        maybeSwap(id);
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        const session = drag.current;
        if (!session || session.id !== id || session.pointerId !== event.pointerId) return;
        endDrag(id, event.currentTarget, event.pointerId);
      },
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => {
        const session = drag.current;
        if (!session || session.id !== id) return;
        endDrag(id, event.currentTarget, event.pointerId);
      },
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
        const session = drag.current;
        if (!session || session.id !== id || session.pointerId !== event.pointerId) return;
        endDrag(id, null, event.pointerId);
      },
    }),
    [applyDragTransform, endDrag, maybeSwap, reorder, tabs],
  );

  // 指针在未越过阈值时被移出标签(快速甩动)会让 pointerup 落到别处,
  // 这里兜底清掉悬空的拖动会话,避免下一次按下读到旧状态。
  useEffect(() => {
    const bail = () => {
      const session = drag.current;
      if (!session || session.active) return;
      drag.current = null;
    };
    window.addEventListener("pointerup", bail);
    window.addEventListener("pointercancel", bail);
    return () => {
      window.removeEventListener("pointerup", bail);
      window.removeEventListener("pointercancel", bail);
    };
  }, []);

  useIsoLayoutEffect(() => {
    if (reorderable) return;
    const row = rowRef.current;
    const node = itemRefs.current.get(tabs.value);
    if (!row || !node) return;

    const read = () => {
      const x = node.offsetLeft;
      const width = node.offsetWidth;
      setPlateau((prev) =>
        prev.x === x && prev.width === width && prev.ready ? prev : { x, width, ready: true },
      );
    };

    read();
    const observer = new ResizeObserver(read);
    observer.observe(row);
    observer.observe(node);
    row.addEventListener("scroll", read, { passive: true });
    return () => {
      observer.disconnect();
      row.removeEventListener("scroll", read);
    };
  }, [reorderable, tabs.value, ids]);

  // 用键盘/快捷键切走的标签可能在横向溢出区外,跟着滚回视野
  useEffect(() => {
    const row = rowRef.current;
    const node = itemRefs.current.get(tabs.value);
    if (!row || !node || drag.current) return;
    const left = node.offsetLeft;
    const right = left + node.offsetWidth;
    const pad = 8;
    if (left - pad < row.scrollLeft) {
      row.scrollTo({ left: Math.max(0, left - pad), behavior: reduced ? "auto" : "smooth" });
    } else if (right + pad > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: right + pad - row.clientWidth, behavior: reduced ? "auto" : "smooth" });
    }
  }, [tabs.value, ids, reduced]);

  /** 竖向滚轮也能横向翻标签(触控板横滑保持原生) */
  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const row = event.currentTarget;
    if (row.scrollWidth <= row.clientWidth) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    row.scrollLeft += event.deltaY;
  }, []);

  const tabHandlers = useCallback(
    (value: string) => ({
      onContextMenu: onTabContextMenu ? () => onTabContextMenu(value) : undefined,
      onAuxClick: onTabAuxClick
        ? (event: MouseEvent<HTMLElement>) => {
            if (event.button !== 1) return;
            event.preventDefault();
            onTabAuxClick(value);
          }
        : undefined,
    }),
    [onTabAuxClick, onTabContextMenu],
  );

  const list = (
    <>
      {!reorderable ? (
        <motion.span
          aria-hidden
          style={{
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            left: plateau.x,
            width: plateau.width,
            opacity: plateau.ready ? 1 : 0,
          }}
          className="pointer-events-none absolute bottom-[-1px] top-1 z-0 bg-white dark:bg-[#1D1D1A]"
          transition={reduced ? { duration: 0 } : INDICATOR}
        >
          <span
            aria-hidden
            style={{ borderTopLeftRadius: 8, borderTopRightRadius: 8 }}
            className="absolute inset-0 border border-b-0 border-stone-200 dark:border-white/[0.16]"
          />
        </motion.span>
      ) : null}

      {reorderable
        ? items.map((item, index) => {
            const selected = item.value === tabs.value;
            return (
              <ReorderTab
                key={item.value}
                item={item}
                selected={selected}
                disabled={item.disabled === true}
                lifted={
                  draggingId === item.value ||
                  reorder.grabbed === item.value ||
                  reorder.dragging === item.value
                }
                tabProps={tabs.getTabProps(item, index)}
                hintId={hintId}
                renderTabEnd={renderTabEnd}
                register={register}
                onKeyDown={reorder.rowKeyDown}
                dragBind={bindDrag(item.value)}
                suppressClick={suppressClick}
                {...tabHandlers(item.value)}
              />
            );
          })
        : items.map((item, index) => {
            const selected = item.value === tabs.value;
            const tabProps = tabs.getTabProps(item, index);
            return (
              <button
                key={item.value}
                {...tabProps}
                ref={(node) => {
                  tabProps.ref(node);
                  register(item.value, node);
                }}
                title={item.hint}
                {...tabHandlers(item.value)}
                className={`${TAB_BTN} ${tabTone(item, selected)}`}
              >
                <TabLabel label={item.label} selected={selected} />
                {renderTabEnd?.(item, selected)}
              </button>
            );
          })}
    </>
  );

  return (
    <div
      className={`w-full overflow-hidden rounded-[12px] border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.06),0_4px_10px_-8px_rgba(28,25,23,0.45)] dark:border-white/[0.16] dark:bg-[#1D1D1A] dark:shadow-[0_1px_6px_rgba(0,0,0,0.45)] ${className}`}
    >
      <div className="tabs-track relative flex min-w-0 w-full border-b border-stone-200 bg-stone-50 dark:border-white/[0.16] dark:bg-[#1D1D1A]">
        <div
          {...tabs.tabListProps}
          ref={rowRef}
          aria-label={label}
          onWheel={onWheel}
          onContextMenuCapture={onTabContextMenu ? () => onTabContextMenu(null) : undefined}
          className="relative m-0 flex min-w-0 gap-1 overflow-x-auto p-0"
        >
          {list}
        </div>
        {trailing ? <div className="tabs-trailing">{trailing}</div> : null}
      </div>
      {reorderable ? (
        <>
          <span id={hintId} className="sr-only">
            Drag to reorder. With the keyboard, Space grabs the tab, the arrow keys
            move it, Space drops it, and Escape puts everything back.
          </span>
          <span role="status" aria-live="polite" className="sr-only">
            {reorder.spoken}
          </span>
        </>
      ) : null}

      {renderPanel ? (
        <motion.div
          key={tabs.value}
          custom={tabs.direction}
          {...tabs.getPanelProps(tabs.value)}
          initial={reduced ? false : { opacity: 0, x: tabs.direction * 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduced ? { duration: 0 } : PANEL}
          className={`rounded-[11px] text-[13.5px] leading-relaxed text-stone-700 outline-none focus-visible:shadow-[inset_0_0_0_1px_#4568FF] dark:text-stone-200 dark:focus-visible:shadow-[inset_0_0_0_1px_#93B0FF] ${panelClassName}`}
        >
          {renderPanel(tabs.value)}
        </motion.div>
      ) : null}
    </div>
  );
}
