/**
 * switch.tsx — coconut 自研(interior 上游无 switch 组件),按 interior 惯例:
 * 无头 hook(useSwitch)+ 样式化组件;弹簧 knob、键盘 Space/Enter、
 * prefers-reduced-motion 降级、role="switch" 语义。
 * 视觉层用 interior.css shim 类 + coconut token。
 */
"use client";

import { useCallback, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const KNOB = { type: "spring", stiffness: 640, damping: 32, mass: 0.9 } as const;
const STILL = { duration: 0 } as const;

export type UseSwitchOptions = {
  /** 受控:传入 checked 后由外部驱动 */
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
};

export type UseSwitchResult = {
  checked: boolean;
  toggle: () => void;
};

export function useSwitch({
  checked: controlled,
  defaultChecked = false,
  onCheckedChange,
  disabled = false,
}: UseSwitchOptions = {}): UseSwitchResult {
  const [uncontrolled, setUncontrolled] = useState(defaultChecked);
  const checked = controlled ?? uncontrolled;

  const changed = useRef(onCheckedChange);
  changed.current = onCheckedChange;

  const toggle = useCallback(() => {
    if (disabled) return;
    const next = !checked;
    if (controlled === undefined) setUncontrolled(next);
    changed.current?.(next);
  }, [checked, controlled, disabled]);

  return { checked, toggle };
}

export type SwitchProps = UseSwitchOptions & {
  /** aria-label(必填,无可见文本) */
  label: string;
  className?: string;
};

export function Switch({ label, className = "", ...rest }: SwitchProps) {
  const reduced = useReducedMotion();
  const { checked, toggle } = useSwitch(rest);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={rest.disabled}
      onClick={toggle}
      onKeyDown={(e) => {
        // 空格/回车切换(role=switch 的键盘惯例)
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggle();
        }
      }}
      className={`relative h-5 w-9 shrink-0 select-none rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 disabled:opacity-50 ${className}`}
      style={{
        background: checked
          ? "var(--acc)"
          : "color-mix(in srgb, var(--mut) 40%, transparent)",
      }}>
      <motion.span
        aria-hidden
        className="absolute left-[2px] top-[2px] block h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(32,30,29,0.25)]"
        initial={false}
        animate={{ x: checked ? 16 : 0 }}
        transition={reduced ? STILL : KNOB}
      />
    </button>
  );
}
