import { cx } from "./classNames";

type LoadingStateProps = {
  label: string;
  rows?: number;
  className?: string;
};

export function LoadingState({ label, rows = 3, className }: LoadingStateProps) {
  return (
    <div className={cx("grid gap-3 rounded-xl border border-slate-200 bg-white p-4", className)} aria-live="polite">
      <span className="text-sm font-bold text-slate-500">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <span
          className="h-12 animate-pulse rounded-lg bg-slate-100"
          key={`loading-row-${index}`}
        />
      ))}
    </div>
  );
}
