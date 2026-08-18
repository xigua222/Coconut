/*
 * reading-progress.tsx — from ddoemonn/interior (https://github.com/ddoemonn/interior)
 * MIT License, Copyright (c) 2025 interior.dev contributors.
 * Copied for coconut; 视觉层经 interior.css shim 映射到 coconut token。
 */
"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { RollingNumber } from "./rolling-number";

const CROSSFADE = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;
const EASE = [0.23, 1, 0.32, 1] as const;
const DRAW = { duration: 0.3, ease: EASE, delay: 0.08 } as const;
const INSTANT = { duration: 0 } as const;

export type ScrollRef = { readonly current: HTMLElement | null };

export type UseReadingProgressOptions = {
  target?: ScrollRef;
  scroller?: ScrollRef;
  steps?: number;
  words?: number;
  wordsPerMinute?: number;
};

export type ReadingProgressState = {
  step: number;
  steps: number;
  progress: number;
  percent: number;
  minutesLeft: number;
  totalMinutes: number;
  complete: boolean;
};

function clamp01(n: number) {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? 1 : n;
}

export function useReadingProgress({
  target,
  scroller,
  steps = 24,
  words = 0,
  wordsPerMinute = 220,
}: UseReadingProgressOptions = {}): ReadingProgressState {
  const [step, setStep] = useState(0);
  const frame = useRef(0);

  const read = useCallback(() => {
    frame.current = 0;

    const scrollEl = scroller?.current ?? null;
    const targetEl = target?.current ?? null;
    const viewport = scrollEl ? scrollEl.clientHeight : window.innerHeight;

    let ratio: number;
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const base = scrollEl ? scrollEl.getBoundingClientRect().top : 0;
      const travel = rect.height - viewport;
      ratio = travel <= 0 ? 1 : (base - rect.top) / travel;
    } else if (scrollEl) {
      const travel = scrollEl.scrollHeight - scrollEl.clientHeight;
      ratio = travel <= 0 ? 1 : scrollEl.scrollTop / travel;
    } else {
      const doc = document.documentElement;
      const travel = doc.scrollHeight - viewport;
      ratio = travel <= 0 ? 1 : window.scrollY / travel;
    }

    const next = Math.round(clamp01(ratio) * steps);
    setStep((prev) => (prev === next ? prev : next));
  }, [scroller, target, steps]);

  useLayoutEffect(() => {
    const scrollEl = scroller?.current ?? null;
    const targetEl = target?.current ?? null;
    // 调用方传入 scroller 时只监听该容器;coconut 的 body overflow:hidden,
    // 降级到 window 会导致进度永远为 0
    const source: EventTarget | null =
      scroller != null ? scrollEl : scrollEl ?? window;
    if (!source) return;

    const schedule = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(read);
    };

    source.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (observer) {
      if (targetEl) observer.observe(targetEl);
      if (scrollEl) observer.observe(scrollEl);
      if (!targetEl && !scrollEl) observer.observe(document.documentElement);
    }

    read();

    return () => {
      source.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [read, scroller, target]);

  const progress = steps > 0 ? step / steps : 1;
  const totalMinutes = words > 0 ? Math.max(1, Math.ceil(words / wordsPerMinute)) : 0;
  const minutesLeft =
    words > 0 ? Math.ceil(((1 - progress) * words) / wordsPerMinute) : 0;

  return {
    step,
    steps,
    progress,
    percent: Math.round(progress * 100),
    minutesLeft,
    totalMinutes,
    complete: step >= steps,
  };
}

export type ReadingProgressProps = UseReadingProgressOptions & {
  /** 0–1 滚动进度;由外层滚动容器计算后传入(优先于内部 scroller 监听) */
  value?: number;
  label?: string;
  doneLabel?: string;
  className?: string;
};

export function ReadingProgress({
  target,
  scroller,
  value,
  steps = 24,
  words = 0,
  wordsPerMinute = 220,
  label = "Reading progress",
  doneLabel = "End",
  className = "",
}: ReadingProgressProps) {
  const hooked = useReadingProgress({
    target,
    scroller: value != null ? undefined : scroller,
    steps,
    words,
    wordsPerMinute,
  });

  const progress = value != null ? clamp01(value) : hooked.progress;
  const step = Math.round(progress * steps);
  const percent = Math.round(progress * 100);
  const minutesLeft =
    words > 0 ? Math.ceil(((1 - progress) * words) / wordsPerMinute) : 0;
  const complete = step >= steps;

  const reduced = useReducedMotion();
  const fadeTransition = reduced ? INSTANT : CROSSFADE;

  const estimate = words > 0;
  const readout = `还剩 ${minutesLeft} 分钟`;
  const finish = doneLabel;
  const valueText = estimate
    ? complete
      ? `${doneLabel},已读 ${percent}%`
      : `已读 ${percent}%,${readout}`
    : `已读 ${percent}%`;

  return (
    <div className={`reading-progress flex items-center gap-2 ${className}`}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={steps}
        aria-valuenow={step}
        aria-valuetext={valueText}
        className="reading-progress-track min-w-0 flex-1"
      >
        <div
          className="reading-progress-fill"
          style={{ width: `${(step / Math.max(1, steps)) * 100}%` }}
        />
      </div>

      {estimate ? (
        <div className="grid shrink-0 justify-items-end font-mono text-[10.5px] tabular-nums">
          <span
            aria-hidden
            className="invisible col-start-1 row-start-1 flex items-center gap-1 whitespace-nowrap"
          >
            <span className="w-3 shrink-0" />
            {finish}
          </span>
          <motion.span
            aria-hidden
            className="col-start-1 row-start-1 whitespace-nowrap text-stone-500"
            initial={false}
            animate={{ opacity: complete ? 0 : 1 }}
            transition={fadeTransition}
          >
            <RollingNumber value={minutesLeft} prefix="还剩 " suffix=" 分钟" />
          </motion.span>
          <motion.span
            aria-hidden
            className="col-start-1 row-start-1 flex items-center gap-1 whitespace-nowrap text-stone-700"
            initial={false}
            animate={{ opacity: complete ? 1 : 0 }}
            transition={fadeTransition}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 256 256"
              fill="none"
              aria-hidden="true"
            >
              <motion.polyline
                points="216 72 104 184 48 128"
                stroke="currentColor"
                strokeWidth="16"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                animate={{ pathLength: complete ? 1 : 0 }}
                transition={reduced ? INSTANT : DRAW}
              />
            </svg>
            <motion.span
              initial={false}
              animate={{ x: complete ? 0 : 4 }}
              transition={fadeTransition}
            >
              {finish}
            </motion.span>
          </motion.span>
        </div>
      ) : (
        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-stone-500">
          <RollingNumber value={percent} suffix="%" />
        </span>
      )}
    </div>
  );
}
