import { forwardRef } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

/** Dasar kontrol form Sembada: cream-50 fill, border cream-300, fokus ring sogan. */
export const controlBase =
  'w-full px-3 py-2 bg-cream-50 border border-cream-300 rounded-lg text-sm text-tanah-700 ' +
  'outline-none transition-colors duration-fast placeholder:text-tanah-300 ' +
  'focus:border-sogan-500 focus:shadow-focus disabled:opacity-60 disabled:cursor-not-allowed';

const numericCls = 'text-right font-mono tabular-nums';
const monoCls = 'font-mono';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Angka: rata kanan + JetBrains Mono + tabular-nums. */
  numeric?: boolean;
  mono?: boolean;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { numeric, mono, invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        controlBase,
        numeric && numericCls,
        mono && !numeric && monoCls,
        invalid && 'border-bata-500',
        className,
      )}
      {...rest}
    />
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(controlBase, 'cursor-pointer', invalid && 'border-bata-500', className)}
      {...rest}
    >
      {children}
    </select>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(controlBase, 'resize-y', invalid && 'border-bata-500', className)}
      {...rest}
    />
  );
});
