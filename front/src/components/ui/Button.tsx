import type { ButtonHTMLAttributes, ReactNode } from 'react';
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode };
export function Button({ variant = 'secondary', size = 'md', icon, className = '', children, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`day-button day-button-${variant} day-button-${size} ${className}`} {...props}>{icon}{children}</button>;
}
