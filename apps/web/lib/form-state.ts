/**
 * State hasil submit form (dipakai dengan useActionState). Server action
 * mengembalikan ini alih-alih melempar error, supaya pesan validasi bisa
 * tampil per kolom, bukan sebagai layar "Application error".
 */
export interface FormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Nilai yang tadi diketik user, untuk mengisi ulang form saat error. */
  values?: Record<string, string>;
  /** Naik tiap submit gagal → dipakai sebagai key remount form. */
  attempt?: number;
}

export const emptyFormState: FormState = { ok: false };

/** Ambil semua field string dari FormData (untuk isi ulang form saat error). */
export function formValues(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string') o[k] = v;
  return o;
}

/**
 * Ubah error dari apiFetch (mis. `Error("API 400: {json}")`) menjadi FormState
 * dengan pesan per kolom dari Zod `issues[]`. Konflik kode (409) dipetakan ke
 * field "kode".
 */
export function apiErrorToState(e: unknown, fd?: FormData): FormState {
  const values = fd ? formValues(fd) : undefined;
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/API \d+:\s*(\{[\s\S]*\})/);
  if (m) {
    try {
      const body = JSON.parse(m[1]) as {
        message?: string;
        issues?: Array<{ path?: unknown; message?: string }>;
      };
      const fieldErrors: Record<string, string> = {};
      if (Array.isArray(body.issues)) {
        for (const iss of body.issues) {
          const key = Array.isArray(iss.path) ? iss.path[0] : iss.path;
          if (key != null && !fieldErrors[String(key)]) {
            fieldErrors[String(key)] = iss.message ?? 'Tidak valid';
          }
        }
      }
      const msg = body.message ?? 'Data tidak valid';
      if (Object.keys(fieldErrors).length === 0 && /kode/i.test(msg)) {
        fieldErrors.kode = msg;
      }
      return {
        ok: false,
        message: msg,
        fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
        values,
      };
    } catch {
      /* jatuh ke pesan mentah di bawah */
    }
  }
  return { ok: false, message: raw.replace(/^API \d+:\s*/, '') || 'Terjadi kesalahan', values };
}
