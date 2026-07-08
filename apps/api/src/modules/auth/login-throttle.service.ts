import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service.js';

/**
 * Rate-limit percobaan login per email. Sebelum ini, `/auth/login` tidak
 * punya pembatasan sama sekali — attacker bisa brute-force/credential-stuff
 * tanpa hambatan (argon2 cost tinggi membantu sedikit, tapi tidak menutup
 * jalur serangan skala besar dari banyak IP).
 *
 * State di Redis (R8, EVALUASI.md) — SEBELUMNYA in-memory per-proses (Map),
 * yang berarti kalau API di-scale horizontal (>1 instance), tiap instance
 * punya counter sendiri-sendiri: attacker bisa dapat 5×N percobaan (N =
 * jumlah instance) sebelum ke-lockout, bukan 5 total. Redis bikin counter
 * benar-benar dibagi lintas instance.
 */
@Injectable()
export class LoginThrottleService {
  private readonly WINDOW_MS = 15 * 60 * 1000; // 15 menit
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_MS = 15 * 60 * 1000;

  constructor(private readonly redis: RedisService) {}

  private key(email: string): string {
    return email.trim().toLowerCase();
  }
  private countKey(email: string): string {
    return `login-throttle:count:${this.key(email)}`;
  }
  private lockKey(email: string): string {
    return `login-throttle:lock:${this.key(email)}`;
  }

  /** Throw 429 kalau email ini sedang di-lockout. Panggil SEBELUM verify password. */
  async assertNotLocked(email: string): Promise<void> {
    const ttlMs = await this.redis.client.pttl(this.lockKey(email));
    if (ttlMs > 0) {
      const sisaMenit = Math.ceil(ttlMs / 60_000);
      throw new HttpException(
        `Terlalu banyak percobaan login gagal. Coba lagi dalam ${sisaMenit} menit.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Catat percobaan gagal — kunci akun ini sementara kalau sudah melewati batas. */
  async recordFailure(email: string): Promise<void> {
    const ck = this.countKey(email);
    // INCR bikin key kalau belum ada (mulai dari 0 → 1). PEXPIRE cuma di-set
    // sekali di awal window (count === 1) — fixed window per WINDOW_MS, sama
    // persis semantik versi Map lama (reset penuh kalau window sudah lewat).
    const count = await this.redis.client.incr(ck);
    if (count === 1) {
      await this.redis.client.pexpire(ck, this.WINDOW_MS);
    }
    if (count >= this.MAX_ATTEMPTS) {
      await this.redis.client.set(this.lockKey(email), '1', 'PX', this.LOCKOUT_MS);
    }
  }

  /** Reset counter setelah login berhasil. */
  async recordSuccess(email: string): Promise<void> {
    await this.redis.client.del(this.countKey(email), this.lockKey(email));
  }
}
