import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./classNames";

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  tone?: "plain" | "muted" | "interactive";
};

export function Card({ children, className, tone = "plain", ...props }: CardProps) {
  return (
    <section
      className={cx(
        "rounded-xl border border-slate-200 bg-white shadow-sm",
        tone === "muted" && "bg-slate-50",
        tone === "interactive" && "transition duration-150 ease-out hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}
