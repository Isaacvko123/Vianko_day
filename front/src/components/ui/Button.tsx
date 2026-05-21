import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./classNames";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary: "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 hover:border-blue-700",
  secondary: "border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50",
  ghost: "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
  danger: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-11 px-5 text-base"
};

export function Button({ variant = "secondary", size = "md", icon, className, children, type = "button", ...props }: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-extrabold tracking-normal transition duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-60",
        "hover:-translate-y-0.5 active:translate-y-0",
        variants[variant],
        sizes[size],
        className
      )}
      type={type}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
