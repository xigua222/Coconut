/**
 * 搜索浮层(⌘K):只检索文档级结果——历史文档(recent.json)+ 当前打开的 tab,
 * 不检索文档内的大纲/层级。
 *
 * 动效(motion):面板弹簧入场 + 激活行滑动高亮条(FLIP,仅 transform);
 * 键盘/鼠标共用同一高亮目标,motion 原生接管打断;prefersReducedMotion 时直接落位。
 * 退场由 App 的 AnimatePresence 驱动(微缩合一,同 svelte out:outBox)。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { animate, prefersReducedMotion } from "motion";
import { tabStore } from "../lib/tabs/tabStore";
import { list as listRecent } from "../lib/files/recent";
import { basename, modKey } from "../lib/utils/platform";
import { useStoreVersion } from "../lib/react/reactive";

/** motion 13 中 prefersReducedMotion 是状态对象,null 视为未开启 */
const reduced = prefersReducedMotion.current === true;

interface Hit {
  title: string;
  sub: string;
  go: () => void;
}

export function SearchOverlay() {
  const tabVersion = useStoreVersion(tabStore);
  const [q, setQ] = useState("");
  const [activeHit, setActiveHit] = useState(0);
  /** 历史文档路径列表(最近打开) */
  const [recents, setRecents] = useState<string[]>([]);

  const hlElRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowElsRef = useRef<(HTMLButtonElement | null)[]>([]);
  /** 事件监听用最新快照(避免每次击键重挂监听) */
  const hitsRef = useRef<Hit[]>([]);
  const activeHitRef = useRef(0);
  /** 列表内容指纹:内容变化 → 高亮条直接落位而非滑动 */
  const listKeyRef = useRef("");

  const hits = useMemo((): Hit[] => {
    const query = q.trim().toLowerCase();
    const out: Hit[] = [];
    const seen = new Set<string>();
    // 当前打开的 tab 优先(已打开 → 切换),随后补历史文档(未打开 → 打开)
    for (const tab of tabStore.tabs) {
      const name = tab.session.title;
      const path = tab.session.path ?? "";
      if (path) seen.add(path);
      if (!query || name.toLowerCase().includes(query) || path.toLowerCase().includes(query)) {
        out.push({
          title: name,
          sub: path ? path : "未命名文档",
          go: () => tabStore.activate(tab.id),
        });
      }
    }
    for (const path of recents) {
      if (seen.has(path)) continue;
      seen.add(path);
      const name = basename(path);
      if (!query || name.toLowerCase().includes(query) || path.toLowerCase().includes(query)) {
        out.push({
          title: name,
          sub: path,
          go: () => void tabStore.openPath(path),
        });
      }
    }
    return out;
  }, [q, recents, tabVersion]);

  hitsRef.current = hits;
  activeHitRef.current = activeHit;

  useEffect(() => {
    void listRecent().then(setRecents);
    inputRef.current?.focus();
  }, []);

  /** 高亮条跟随激活行:列表变化 → 直接落位;仅 activeHit 变化 → 弹簧滑动 */
  useEffect(() => {
    const row = rowElsRef.current[activeHit];
    const hl = hlElRef.current;
    if (!row || !hl) return;
    const key = hits.map((h) => h.sub + h.title).join("\n");
    const top = row.offsetTop - 8; // 减去 .results 内边距
    const height = row.offsetHeight;
    row.scrollIntoView({ block: "nearest" });
    if (reduced || key !== listKeyRef.current) {
      listKeyRef.current = key;
      hl.style.transform = `translateY(${top}px)`;
      hl.style.height = `${height}px`;
    } else {
      animate(
        hl,
        { y: top, height },
        { type: "spring", stiffness: 520, damping: 38, mass: 0.85, restDelta: 0.5 },
      );
    }
  }, [activeHit, hits, reduced]);

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        tabStore.searchOpen = false;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveHit((h) => Math.min(hitsRef.current.length - 1, h + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveHit((h) => Math.max(0, h - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = hitsRef.current[activeHitRef.current];
        if (hit) {
          hit.go();
          tabStore.searchOpen = false;
        }
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  function choose(i: number) {
    setActiveHit(i);
    hits[i]?.go();
    tabStore.searchOpen = false;
  }

  return (
    <motion.div
      className="search-mask"
      role="dialog"
      aria-modal="true"
      aria-label="搜索"
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => (tabStore.searchOpen = false)}>
      <motion.div
        className="search-box"
        role="presentation"
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 34, mass: 0.9 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="input-row">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--mut)"
            strokeWidth="2.4"
            strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="20" y1="20" x2="16.2" y2="16.2" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            placeholder="搜索历史文档…"
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setActiveHit(0);
            }}
          />
          <span className="kbd">esc</span>
        </div>

        <div className="results">
          {hits.length > 0 ? (
            <>
              <div className="highlight" ref={hlElRef} />
              {hits.map((hit, i) => (
                <button
                  key={hit.sub + hit.title + i}
                  ref={(el) => {
                    rowElsRef.current[i] = el;
                  }}
                  onMouseEnter={() => setActiveHit(i)}
                  onClick={() => choose(i)}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--mut)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="hit-meta">
                    <span className="hit-title">{hit.title}</span>
                    <span className="hit-sub">{hit.sub}</span>
                  </span>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--mut)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <polyline points="9 5 16 12 9 19" />
                  </svg>
                </button>
              ))}
            </>
          ) : q.trim() ? (
            <div className="no-hits">没有找到「{q}」</div>
          ) : (
            <div className="no-hits">还没有打开过文档,按 {modKey}O 打开</div>
          )}
        </div>

        <div className="footer">↩ 打开 · ESC 关闭</div>
      </motion.div>
    </motion.div>
  );
}
