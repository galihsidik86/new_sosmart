import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'soft-sogan'
  | 'soft-emas'
  | 'success'
  | 'soft-bata'
  | 'dashed';

export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-sogan-500 hover:bg-sogan-600 text-cream-50 disabled:bg-cream-400 disabled:text-tanah-500',
  secondary:
    'bg-white hover:bg-cream-50 text-tanah-700 border border-cream-300',
  ghost: 'bg-transparent hover:bg-cream-100 text-tanah-700',
  danger: 'bg-bata-500 hover:bg-bata-700 text-cream-50 disabled:bg-cream-400',
  'soft-sogan':
    'bg-sogan-50 hover:bg-sogan-100 text-sogan-700 border border-sogan-300',
  'soft-emas':
    'bg-emas-100 hover:bg-emas-300 text-emas-700 border border-emas-300',
  success:
    'bg-padi-100 hover:bg-padi-300 text-padi-700 border border-padi-300',
  'soft-bata':
    'bg-bata-100 hover:bg-bata-300 text-bata-700 border border-bata-300',
  dashed:
    'bg-transparent hover:bg-cream-100 text-sogan-500 border border-dashed border-cream-400',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

/** Kelas dasar Sembada untuk tombol — dipakai juga oleh <Link>/<a> via buttonClass(). */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra?: string,
): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
    'transition-colors duration-fast ease-sembada',
    'focus-visible:outline-none focus-visible:shadow-focus',
    'disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
