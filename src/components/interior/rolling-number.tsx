/*
 * 全局数字更新:transitions.dev「Number pop-in」逐位弹入(样式见 components.css)。
 * 只重播「和上一次不同的那几位」——未变的位保持静止,打字等高频更新不会整段乱闪;
 * 变大从下方进、变小从上方进,同一次变化里多位按 --digit-i 依次错开。
 */
import { useState, type CSSProperties } from "react";

type Snapshot = {
  text: string;
  prev: string;
  value: number;
  id: number;
  dir: 1 | -1;
};

/** 把 i18n 模板「字数 {n}」拆成前后缀,前后缀不参与动画。 */
export function splitCountTemplate(template: string): { prefix: string; suffix: string } {
  const [prefix = "", suffix = ""] = template.split("{n}");
  return { prefix, suffix };
}

export function RollingNumber({
  value,
  prefix = "",
  suffix = "",
  locales,
  className = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  locales?: Intl.LocalesArgument;
  className?: string;
}) {
  const text = value.toLocaleString(locales);
  const [snap, setSnap] = useState<Snapshot>(() => ({
    text,
    prev: text,
    value,
    id: 0,
    dir: 1,
  }));

  // 渲染期同步:本次渲染会被丢弃,下一次立刻用新快照重播变化位。
  if (snap.text !== text) {
    setSnap({
      text,
      prev: snap.text,
      value,
      id: snap.id + 1,
      dir: value < snap.value ? -1 : 1,
    });
  }

  const chars = Array.from(snap.text);
  const prev = Array.from(snap.prev);
  // 数字右对齐比较:99 → 100 时个位/十位才算真的变了。
  const shift = chars.length - prev.length;
  let order = 0;

  return (
    <span
      className={className ? `t-digit-group ${className}` : "t-digit-group"}
      style={{ "--digit-dir-y": snap.dir } as CSSProperties}
      aria-label={`${prefix}${snap.text}${suffix}`}>
      {prefix ? (
        <span className="t-digit-affix" aria-hidden>
          {prefix}
        </span>
      ) : null}
      {chars.map((ch, i) => {
        const changed = ch !== prev[i - shift];
        const slot = chars.length - 1 - i;
        return (
          <span
            key={`${slot}:${changed ? snap.id : "still"}`}
            className={changed ? "t-digit is-animating" : "t-digit"}
            style={changed ? ({ "--digit-i": order++ } as CSSProperties) : undefined}
            aria-hidden>
            {ch}
          </span>
        );
      })}
      {suffix ? (
        <span className="t-digit-affix" aria-hidden>
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
