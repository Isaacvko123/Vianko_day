import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cx } from "./classNames";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cx("grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center", className)}>
      <div className="grid max-w-md justify-items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500">
          {icon ?? <Inbox size={22} />}
        </span>
        <div className="grid gap-1">
          <strong className="text-base text-slate-950">{title}</strong>
          {description ? <p className="text-sm leading-6 text-slate-500">{description}</p> : undefined}
        </div>
        {action}
      </div>
    </div>
  );
}
