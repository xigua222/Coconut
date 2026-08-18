/**
 * lucide-animated(movingicons 的 React 对应包)薄封装:
 * 尊重 prefers-reduced-motion,装饰性 aria-hidden,可选铺满父按钮以便悬停即播动画。
 */
import type { ComponentType, HTMLAttributes } from "react";
import { useReducedMotion } from "motion/react";

export type AnimatedIconProps = HTMLAttributes<HTMLDivElement> & {
  size?: number;
  animateOnHover?: boolean;
};

export function MovingIcon({
  icon: Icon,
  size = 14,
  fill = false,
  className,
  ...rest
}: {
  icon: ComponentType<AnimatedIconProps>;
  size?: number;
  fill?: boolean;
} & Omit<AnimatedIconProps, "size" | "animateOnHover">) {
  const reduced = useReducedMotion();
  return (
    <Icon
      size={size}
      animateOnHover={reduced !== true}
      className={["mi-icon", fill ? "fill" : "", className].filter(Boolean).join(" ")}
      {...rest}
      aria-hidden
    />
  );
}
