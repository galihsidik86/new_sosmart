import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Rate-limit percobaan login per email. Sebelum ini, `/auth/login` tidak
 * punya pembatasan sama sekali — attacker bisa brute-force/credential-stuff
 * tanpa hambatan (argon2 cost tinggi membantu sedikit, tapi tidak menutup
 * jalur serangan skala besar dari banyak IP).
 *
 * In-memory, per-proses — cukup untuk single-instance deployment (kondisi
 * saat ini). Kalau API di-scale horizontal, pindahkan state ini ke Redis
 * (sudah ada di docker-compose) supaya limiter konsisten lintas instance.
 */
@Injectable()
export class LoginThrottleService {
  private readonly WINDOW_MS = 15 * 60 * 1000; // 15 menit
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_MS = 15 * 60 * 1000;

  private readonly attempts = new Map<
    string,
    { count: number; windowStartedAt: number; lockedUntil: number | null }
  >();

  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Throw 429 kalau email ini sedang di-lockout. Panggil SEBELUM verify password. */
  assertNotLocked(email: string): void {
    const rec = this.attempts.get(this.key(email));
    if (!rec) return;
    const now = Date.now();
    if (rec.lockedUntil && now < rec.lockedUntil) {
      const sisaMenit = Math.ceil((rec.lockedUntil - now) / 60_000);
      throw new HttpException(
        `Terlalu banyak percobaan login gagal. Coba lagi dalam ${sisaMenit} menit.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Catat percobaan gagal — kunci akun ini sementara kalau sudah melewati batas. */
  recordFailure(email: string): void {
    const k = this.key(email);
    const now = Date.now();
    const rec = this.attempts.get(k);
    if (!rec || now - rec.windowStartedAt > this.WINDOW_MS) {
      this.attempts.set(k, { count: 1, windowStartedAt: now, lockedUntil: null });
      return;
    }
    rec.count += 1;
    if (rec.count >= this.MAX_ATTEMPTS) {
      rec.lockedUntil = now + this.LOCKOUT_MS;
    }
  }

  /** Reset counter setelah login berhasil. */
  recordSuccess(email: string): void {
    this.attempts.delete(this.key(email));
  }
}
