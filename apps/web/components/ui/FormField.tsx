import type { ReactNode } from 'react';
import { cn } from './cn';

export const labelClass =
  'block text-xs font-bold uppercase tracking-wider text-tanah-500 mb-1';

export function Label({
  children,
  required,
  htmlFor,
  className,
}: {
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn(labelClass, className)}>
      {children}
      {required && <span className="text-bata-500"> *</span>}
    </label>
  );
}

interface FormFieldProps {
  label?: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/** Grup field: label (eyebrow) + kontrol + hint/error. */
export function FormField({
  label,
  required,
  hint,
  error,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={className}>
      {label && (
        <Label required={required} htmlFor={htmlFor}>
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-bata-700 mt-1">{error}</p>
      ) : hint ? (
        <p className="text-[10px] text-tanah-500 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}
