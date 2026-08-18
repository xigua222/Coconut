"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRightIcon } from "lucide-animated";
import { MovingIcon } from "../MovingIcon";

const EASE = [0.23, 1, 0.32, 1] as const;

const LEAVE = [0.4, 0, 1, 1] as const;

const SMALL = { type: "spring", stiffness: 700, damping: 46, mass: 0.5 } as const;
const PILL = { type: "spring", bounce: 0, duration: 0.28 } as const;

const OPEN_H = { duration: 0.28, ease: EASE } as const;
const OPEN_O = { duration: 0.18, ease: EASE } as const;
const SHUT_H = { duration: 0.2, ease: LEAVE } as const;
const SHUT_O = { duration: 0.14, ease: LEAVE } as const;
const STILL = { duration: 0 } as const;

export type TreeNode = {
  id: string;
  label: string;

  meta?: string;
  children?: TreeNode[];
};

export type TreeRow = {
  node: TreeNode;
  level: number;
  parentId: string | null;
  posinset: number;
  setsize: number;
  branch: boolean;
  open: boolean;
};

function flatten(
  nodes: TreeNode[],
  openSet: ReadonlySet<string>,
  level = 1,
  parentId: string | null = null,
  out: TreeRow[] = [],
): TreeRow[] {
  nodes.forEach((node, i) => {
    const children = node.children ?? [];
    const branch = node.children !== undefined;
    const open = branch && openSet.has(node.id);
    out.push({
      node,
      level,
      parentId,
      posinset: i + 1,
      setsize: nodes.length,
      branch,
      open,
    });
    if (open) flatten(children, openSet, level + 1, node.id, out);
  });
  return out;
}

export type UseTreeViewOptions = {
  nodes: TreeNode[];
  expanded?: string[];
  defaultExpanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
  selected?: string | null;
  defaultSelected?: string | null;
  onSelectedChange?: (selected: string) => void;
  onRenameRequest?: (id: string) => void;
};

export function useTreeView({
  nodes,
  expanded,
  defaultExpanded = [],
  onExpandedChange,
  selected,
  defaultSelected = null,
  onSelectedChange,
  onRenameRequest,
}: UseTreeViewOptions) {
  const [internalOpen, setInternalOpen] = useState<string[]>(defaultExpanded);
  const openControlled = expanded !== undefined;
  const openList = openControlled ? expanded : internalOpen;
  const openSet = new Set(openList);

  const [internalSel, setInternalSel] = useState<string | null>(defaultSelected);
  const selControlled = selected !== undefined;
  const selectedId = selControlled ? selected : internalSel;

  const emitOpen = useRef(onExpandedChange);
  emitOpen.current = onExpandedChange;
  const emitSel = useRef(onSelectedChange);
  emitSel.current = onSelectedChange;
  const emitRename = useRef(onRenameRequest);
  emitRename.current = onRenameRequest;

  const rows = flatten(nodes, openSet);

  const [focusId, setFocusId] = useState<string | null>(null);
  const visible =
    focusId !== null && rows.some((r) => r.node.id === focusId)
      ? focusId
      : (rows.find((r) => r.node.id === selectedId)?.node.id ??
        rows[0]?.node.id ??
        null);

  const refs = useRef(new Map<string, HTMLElement>());
  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  }, []);

  const focusRow = useCallback((id: string) => {
    setFocusId(id);
    refs.current.get(id)?.focus();
  }, []);

  const setOpen = useCallback(
    (next: string[]) => {
      if (!openControlled) setInternalOpen(next);
      emitOpen.current?.(next);
    },
    [openControlled],
  );

  const toggle = useCallback(
    (id: string) => {
      const has = openList.includes(id);
      setOpen(has ? openList.filter((v) => v !== id) : [...openList, id]);
    },
    [openList, setOpen],
  );

  const select = useCallback(
    (id: string) => {
      if (!selControlled) setInternalSel(id);
      emitSel.current?.(id);
    },
    [selControlled],
  );

  const handleKey = useCallback(
    (event: React.KeyboardEvent, row: TreeRow) => {
      const at = rows.findIndex((r) => r.node.id === row.node.id);
      const go = (index: number) => {
        const target = rows[index];
        if (target) focusRow(target.node.id);
      };

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          go(at + 1);
          return;
        case "ArrowUp":
          event.preventDefault();
          go(at - 1);
          return;
        case "ArrowRight":
          event.preventDefault();
          if (row.branch && !row.open) toggle(row.node.id);
          else if (row.open) go(at + 1);
          return;
        case "ArrowLeft":
          event.preventDefault();
          if (row.open) toggle(row.node.id);
          else if (row.parentId) focusRow(row.parentId);
          return;
        case "Home":
          event.preventDefault();
          go(0);
          return;
        case "End":
          event.preventDefault();
          go(rows.length - 1);
          return;
        case "Enter":
        case " ":
          event.preventDefault();
          if (row.branch) toggle(row.node.id);
          else select(row.node.id);
          return;
        case "F2":
          event.preventDefault();
          emitRename.current?.(row.node.id);
          return;
        default:
      }

      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
        const letter = event.key.toLowerCase();
        if (letter === " ") return;
        for (let step = 1; step <= rows.length; step++) {
          const candidate = rows[(at + step) % rows.length];
          if (candidate.node.label.toLowerCase().startsWith(letter)) {
            event.preventDefault();
            focusRow(candidate.node.id);
            return;
          }
        }
      }
    },
    [rows, focusRow, toggle, select],
  );

  return {
    rows,
    openSet,
    selectedId,

    tabStop: visible,
    register,
    focusRow,
    setFocusId,
    toggle,
    select,
    handleKey,
  };
}

function Caret({ open }: { open: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      initial={false}
      animate={{ rotate: open ? 90 : 0 }}
      transition={reduced ? STILL : SMALL}
      className="relative z-[1] flex size-4 shrink-0 items-center justify-center text-stone-400 dark:text-stone-500"
    >
      <MovingIcon icon={ChevronRightIcon} size={10} />
    </motion.span>
  );
}

export type TreeViewProps = {
  nodes: TreeNode[];
  label: string;
  expanded?: string[];
  defaultExpanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
  selected?: string | null;
  defaultSelected?: string | null;
  onSelectedChange?: (selected: string) => void;
  renamingId?: string | null;
  onRenameRequest?: (id: string) => void;
  onRenameCommit?: (id: string, nextLabel: string) => void;
  onRenameCancel?: () => void;
  className?: string;
  /** 跨多棵树共用,选中条会在文件之间滑动 */
  selectionLayoutId?: string;
};

function RenameField({
  label,
  onCommit,
  onCancel,
}: {
  label: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const m = label.match(/^(.*)(\.(md|markdown|mdown|mkd|mdx))$/i);
    if (m) el.setSelectionRange(0, m[1].length);
    else el.select();
  }, [label]);

  const finish = (next: string, cancel = false) => {
    if (done.current) return;
    done.current = true;
    if (cancel) onCancel();
    else onCommit(next);
  };

  return (
    <input
      ref={ref}
      defaultValue={label}
      aria-label="新名字"
      className="tree-rename"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(e.currentTarget.value, true);
        }
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}

export function TreeView({
  nodes,
  label,
  expanded,
  defaultExpanded,
  onExpandedChange,
  selected,
  defaultSelected,
  onSelectedChange,
  renamingId = null,
  onRenameRequest,
  onRenameCommit,
  onRenameCancel,
  className = "",
  selectionLayoutId,
}: TreeViewProps) {
  const tree = useTreeView({
    nodes,
    expanded,
    defaultExpanded,
    onExpandedChange,
    selected,
    defaultSelected,
    onSelectedChange,
    onRenameRequest,
  });
  const reduced = useReducedMotion();
  const hintId = useId();

  const renderNodes = (list: TreeNode[], level: number) =>
    list.map((node, i) => {
      const row = tree.rows.find((r) => r.node.id === node.id);

      if (!row) return null;

      const isSelected = tree.selectedId === node.id;
      const renaming = renamingId === node.id;

      return (
        <li key={node.id} role="none">
          <div
            role="treeitem"
            data-id={node.id}
            ref={(el) => tree.register(node.id, el)}
            aria-level={level}
            aria-posinset={i + 1}
            aria-setsize={list.length}
            aria-expanded={row.branch ? row.open : undefined}
            aria-selected={isSelected}
            aria-describedby={hintId}
            tabIndex={renaming ? -1 : tree.tabStop === node.id ? 0 : -1}
            onFocus={() => tree.setFocusId(node.id)}
            onKeyDown={(e) => {
              if (!renaming) tree.handleKey(e, row);
            }}
            onClick={() => {
              if (renaming) return;
              tree.focusRow(node.id);
              if (row.branch) {
                tree.toggle(node.id);
                return;
              }
              tree.select(node.id);
            }}
            className={`relative flex h-7 cursor-default select-none items-center gap-1 rounded-[8px] px-1.5 outline-none focus-visible:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--acc)_55%,transparent)] ${
              isSelected ? "is-selected" : "text-stone-600 hover:bg-stone-100/60 dark:text-stone-300 dark:hover:bg-white/[0.04]"
            }`}
          >
            {isSelected ? (
              <motion.span
                aria-hidden
                layoutId={reduced || !selectionLayoutId ? undefined : selectionLayoutId}
                className="tree-sel pointer-events-none absolute inset-0 rounded-[8px]"
                transition={reduced ? STILL : PILL}
              />
            ) : null}

            {row.branch ? <Caret open={row.open} /> : <span className="relative z-[1] size-4 shrink-0" />}

            {renaming ? (
              <RenameField
                label={node.label}
                onCommit={(next) => onRenameCommit?.(node.id, next)}
                onCancel={() => onRenameCancel?.()}
              />
            ) : (
              <span
                className={`relative z-[1] min-w-0 flex-1 truncate text-[12.5px] ${
                  isSelected ? "font-medium" : ""
                }`}
              >
                {node.label}
              </span>
            )}

            {node.meta && !renaming ? (
              <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-stone-400 dark:text-stone-500">
                {node.meta}
              </span>
            ) : null}
          </div>

          {row.branch ? (
            <AnimatePresence initial={false}>
              {row.open ? (
                <motion.ul
                  key="group"
                  role="group"
                  initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={
                    reduced
                      ? { opacity: 0, transition: STILL }
                      : {
                          height: 0,
                          opacity: 0,
                          transition: { height: SHUT_H, opacity: SHUT_O },
                        }
                  }
                  transition={
                    reduced ? STILL : { height: OPEN_H, opacity: OPEN_O }
                  }
                  className="overflow-hidden will-change-[height]"
                >
                  <div className="ml-[13px] border-l border-stone-200/80 pl-[7px] dark:border-white/[0.16]">
                    {renderNodes(node.children ?? [], level + 1)}
                  </div>
                </motion.ul>
              ) : null}
            </AnimatePresence>
          ) : null}
        </li>
      );
    });

  return (
    <div
      className={`rounded-[13px] border border-stone-200 bg-white p-[5px] shadow-[0_1px_2px_rgba(28,25,23,0.06),0_4px_10px_-8px_rgba(28,25,23,0.45)] dark:border-white/[0.16] dark:bg-[#1D1D1A] dark:shadow-[0_1px_6px_rgba(0,0,0,0.45)] ${className}`}
    >
      <ul role="tree" aria-label={label}>
        {renderNodes(nodes, 1)}
      </ul>
      <span id={hintId} className="sr-only">
        Use the arrow keys to move. Right expands a folder, left collapses it
        or climbs to its parent. Home and End jump to the ends, and typing a
        letter jumps to the next name starting with it.
      </span>
    </div>
  );
}
