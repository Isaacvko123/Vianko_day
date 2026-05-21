import type { ReactNode } from "react";
import { cx } from "./classNames";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cx("flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : undefined}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : undefined}
    </header>
  );
}
