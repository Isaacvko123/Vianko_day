import type { ReactNode } from "react";
import { cx } from "./classNames";

type StatTone = "blue" | "green" | "amber" | "red" | "slate";

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  className?: string;
};

const toneClasses: Record<StatTone, string> = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-600"
};

export function StatCard({ label, value, icon, tone = "blue", className }: StatCardProps) {
  return (
    <article className={cx("grid grid-cols-[2.75rem_1fr_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      <span className={cx("grid h-11 w-11 place-items-center rounded-xl", toneClasses[tone])}>{icon}</span>
      <span className="text-sm font-extrabold text-slate-500">{label}</span>
      <strong className="text-2xl font-black text-slate-950">{value}</strong>
    </article>
  );
}
