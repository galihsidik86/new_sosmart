'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { cn } from './cn';
import { controlBase } from './Input';

/**
 * Input nilai uang ber-format currency (Rupiah).
 *
 * Tampilan: prefix "Rp" + pemisah ribuan id-ID (mis. `1.500.000` atau
 * `316.250.000,04`). Nilai yang DIKIRIM ke form/handler selalu string numerik
 * kanonik ber-titik-desimal (mis. `1500000` / `316250000.04`) — aman untuk
 * `moneyDecimal`/decimal.js di backend.
 *
 * Dua mode pakai:
 *  1. FormData (server action): beri `name` → render hidden input berisi raw.
 *     `<MoneyInput name="hargaJualDefault" defaultValue={d.harga} />`
 *  2. Controlled (React state): beri `value` (raw) + `onValueChange(raw)`.
 *     `<MoneyInput value={l.harga} onValueChange={(v) => upd({ harga: v })} />`
 */

// raw kanonik "316250000.04" → display "316.250.000,04"
function rawToDisplay(raw: string): string {
  if (raw === '' || raw == null) return '';
  const neg = raw.startsWith('-');
  const abs = neg ? raw.slice(1) : raw;
  const [intRaw = '', dec] = abs.split('.');
  const intClean = intRaw.replace(/^0+(?=\d)/, '') || '0';
  const grouped = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + grouped + (dec !== undefined ? ',' + dec : '');
}

// Apa pun yang diketik user → raw kanonik. Titik = pemisah ribuan (dibuang),
// koma = desimal (jadi titik). Maksimal 2 angka desimal.
function displayToRaw(display: string): string {
  const neg = display.trim().startsWith('-');
  let s = display.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  s = s.replace(/[^0-9.]/g, '');
  const [intPart = '', ...rest] = s.split('.');
  let raw = intPart;
  if (rest.length > 0) raw += '.' + rest.join('').slice(0, 2);
  raw = raw.replace(/^0+(?=\d)/, '');
  if (raw === '' || raw === '.') return '';
  return (neg ? '-' : '') + raw;
}

interface MoneyInputProps {
  name?: string;
  /** Nilai awal (uncontrolled). String/number raw. */
  defaultValue?: string | number;
  /** Nilai terkontrol (raw). Bila di-set, komponen jadi controlled. */
  value?: string | number;
  /** Dipanggil dengan raw kanonik setiap perubahan. */
  onValueChange?: (raw: string) => void;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  fullWidth?: boolean;
  className?: string;
  id?: string;
  size?: 'sm' | 'md';
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { name, defaultValue, value, onValueChange, invalid, required, disabled, placeholder = '0', fullWidth = true, className, id, size = 'md' },
  ref,
) {
  const controlled = value !== undefined;
  const initRaw = String((controlled ? value : defaultValue) ?? '');
  const [display, setDisplay] = useState<string>(rawToDisplay(initRaw));
  const rawRef = useRef<string>(initRaw);

  // Sinkron bila parent (controlled) mengubah value dari luar.
  useEffect(() => {
    if (!controlled) return;
    const next = String(value ?? '');
    if (next !== rawRef.current) {
      rawRef.current = next;
      setDisplay(rawToDisplay(next));
    }
  }, [controlled, value]);

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = displayToRaw(e.target.value);
    rawRef.current = raw;
    setDisplay(rawToDisplay(raw));
    onValueChange?.(raw);
  };

  const pad = size === 'sm' ? 'pl-7 pr-2 py-1 text-xs' : 'pl-9 pr-3 py-2 text-sm';
  const prefixPos = size === 'sm' ? 'left-2 text-[10px]' : 'left-3 text-xs';

  return (
    <div className={cn('relative', fullWidth ? 'w-full' : 'w-auto', className)}>
      <span className={cn('absolute top-1/2 -translate-y-1/2 text-tanah-500 pointer-events-none select-none', prefixPos)}>
        Rp
      </span>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        onChange={handle}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          'w-full text-right font-mono tabular-nums',
          controlBase.replace('px-3 py-2 ', '').replace('text-sm ', ''),
          pad,
          invalid && 'border-bata-500',
        )}
      />
      {name && <input type="hidden" name={name} value={rawRef.current} required={required} disabled={disabled} />}
    </div>
  );
});
