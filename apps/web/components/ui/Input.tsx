import { forwardRef } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

/** Dasar kontrol form Sembada: cream-50 fill, border cream-300, fokus ring sogan. */
export const controlBase =
  'px-3 py-2 bg-cream-50 border border-cream-300 rounded-lg text-sm text-tanah-700 ' +
  'outline-none transition-colors duration-fast placeholder:text-tanah-300 ' +
  'focus:border-sogan-500 focus:shadow-focus disabled:opacity-60 disabled:cursor-not-allowed';

const numericCls = 'text-right font-mono tabular-nums';
const monoCls = 'font-mono';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Angka: rata kanan + JetBrains Mono + tabular-nums. */
  numeric?: boolean;
  mono?: boolean;
  invalid?: boolean;
  /** Lebar penuh (default true). false → w-auto untuk kontrol inline (filter bar). */
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { numeric, mono, invalid, fullWidth = true, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        fullWidth ? 'w-full' : 'w-auto',
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
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, fullWidth = true, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        fullWidth ? 'w-full' : 'w-auto',
        controlBase,
        'cursor-pointer',
        invalid && 'border-bata-500',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, fullWidth = true, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(fullWidth ? 'w-full' : 'w-auto', controlBase, 'resize-y', invalid && 'border-bata-500', className)}
      {...rest}
    />
  );
});
