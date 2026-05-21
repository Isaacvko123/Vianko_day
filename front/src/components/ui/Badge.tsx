import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./classNames";

type BadgeTone = "neutral" | "blue" | "green" | "amber" | "red" | "slate";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  children: ReactNode;
};

const tones: Record<BadgeTone, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
  slate: "border-slate-300 bg-white text-slate-600"
};

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex w-max items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black leading-none",
        tones[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
