import { z, type ZodErrorMap } from 'zod';

/**
 * ErrorMap global Bahasa Indonesia untuk Zod.
 *
 * Zod hanya memakai errorMap ini untuk issue yang TIDAK punya pesan kustom di
 * schema (pesan `.refine(..., 'pesan')` / `.regex(re, 'pesan')` tetap menang).
 * Jadi ini hanya melokalkan pesan default (required, panjang, email, enum, dst.)
 * tanpa menimpa pesan domain yang sudah kita tulis manual.
 *
 * WAJIB dipasang via {@link installIndonesianErrors} pada instance zod yang sama
 * dengan yang dipakai schema (yaitu zod milik paket ini).
 */
export const idErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type: {
      if (issue.received === 'undefined' || issue.received === 'null') {
        return { message: 'Wajib diisi' };
      }
      const map: Record<string, string> = {
        string: 'Harus berupa teks',
        number: 'Harus berupa angka',
        boolean: 'Harus ya/tidak',
        date: 'Harus berupa tanggal',
        array: 'Harus berupa daftar',
      };
      return { message: map[String(issue.expected)] ?? 'Tipe data tidak sesuai' };
    }

    case z.ZodIssueCode.too_small: {
      const min = issue.minimum as number | bigint;
      if (issue.type === 'string') {
        return { message: Number(min) <= 1 ? 'Wajib diisi' : `Minimal ${min} karakter` };
      }
      if (issue.type === 'number') {
        return { message: `Nilai minimal ${min}` };
      }
      if (issue.type === 'array') {
        return { message: `Minimal ${min} item` };
      }
      return { message: `Nilai terlalu kecil (min ${min})` };
    }

    case z.ZodIssueCode.too_big: {
      const max = issue.maximum as number | bigint;
      if (issue.type === 'string') {
        return { message: `Maksimal ${max} karakter` };
      }
      if (issue.type === 'number') {
        return { message: `Nilai maksimal ${max}` };
      }
      if (issue.type === 'array') {
        return { message: `Maksimal ${max} item` };
      }
      return { message: `Nilai terlalu besar (maks ${max})` };
    }

    case z.ZodIssueCode.invalid_string: {
      if (issue.validation === 'email') return { message: 'Format email tidak valid' };
      if (issue.validation === 'url') return { message: 'URL tidak valid' };
      if (issue.validation === 'uuid') return { message: 'Pilihan tidak valid' };
      if (issue.validation === 'datetime') return { message: 'Format tanggal/waktu tidak valid' };
      return { message: 'Format tidak sesuai' };
    }

    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Pilihan tidak valid' };

    case z.ZodIssueCode.invalid_date:
      return { message: 'Tanggal tidak valid' };

    case z.ZodIssueCode.invalid_union:
      return { message: 'Nilai tidak valid' };

    case z.ZodIssueCode.not_multiple_of:
      return { message: `Harus kelipatan ${issue.multipleOf}` };

    case z.ZodIssueCode.unrecognized_keys:
      return { message: 'Ada field yang tidak dikenal' };

    default:
      return { message: ctx.defaultError };
  }
};

/**
 * Pasang {@link idErrorMap} sebagai errorMap global Zod. Panggil sekali saat
 * bootstrap aplikasi (mis. di `main.ts` API) SEBELUM ada request divalidasi.
 */
export function installIndonesianErrors(): void {
  z.setErrorMap(idErrorMap);
}
