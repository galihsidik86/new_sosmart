/**
 * Integration test untuk LoginThrottleService — rate-limit login per email
 * (R8, EVALUASI.md). Pindah dari unit test murni (src/**\/__tests__) ke sini
 * karena sekarang state-nya di Redis asli (bukan Map in-memory lagi), jadi
 * butuh koneksi Redis nyata (docker-compose sudah menyediakan).
 *
 * Cakupan:
 *  - Perilaku lockout dasar (regresi dari versi Map lama): belum lock di
 *    bawah batas, lock setelah 5 gagal beruntun, recordSuccess mereset,
 *    email berbeda independen.
 *  - TTL lock ke-set benar (tidak menunggu 15 menit asli — cukup verifikasi
 *    PTTL yang di-set Redis mendekati LOCKOUT_MS; tes "lockout terangkat
 *    otomatis setelah window berlalu" dari versi lama TIDAK di-port karena
 *    Redis TTL adalah wall-clock asli, tidak bisa di-fake seperti vi.useFakeTimers,
 *    dan constant LOCKOUT_MS hardcoded di service — dicatat sebagai gap yang
 *    disengaja, bukan diklaim ter-cover).
 *  - Cross-instance: state yang ditulis lewat satu instance service HARUS
 *    kebaca oleh instance LAIN yang connect ke Redis yang sama — inilah
 *    alasan R8 (Map lama tidak akan pernah lolos tes ini kalau di-scale
 *    horizontal, tiap instance API punya counter sendiri-sendiri).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../src/common/redis/redis.service.js';
import { LoginThrottleService } from '../src/modules/auth/login-throttle.service.js';

function fakeConfig(): ConfigService {
  return { get: () => process.env.REDIS_URL } as unknown as ConfigService;
}

/** Bikin "instance service" independen — koneksi ioredis sendiri, simulasi 1 proses API. */
function newInstance(): { redis: RedisService; throttle: LoginThrottleService } {
  const redis = new RedisService(fakeConfig());
  return { redis, throttle: new LoginThrottleService(redis) };
}

describe('LoginThrottleService — integration (Redis)', () => {
  let email: string;
  let a: ReturnType<typeof newInstance>;
  let b: ReturnType<typeof newInstance>;

  beforeEach(() => {
    email = `throttle-${randomUUID()}@test.lentera.id`;
    a = newInstance();
    b = newInstance();
  });

  afterEach(async () => {
    await a.throttle.recordSuccess(email); // bersihkan count+lock key
    await a.redis.client.quit();
    await b.redis.client.quit();
  });

  it('tidak lock sebelum mencapai batas percobaan', async () => {
    for (let i = 0; i < 4; i++) await a.throttle.recordFailure(email);
    await expect(a.throttle.assertNotLocked(email)).resolves.toBeUndefined();
  });

  it('lock setelah 5 percobaan gagal beruntun', async () => {
    for (let i = 0; i < 5; i++) await a.throttle.recordFailure(email);
    await expect(a.throttle.assertNotLocked(email)).rejects.toThrow(HttpException);
    await expect(a.throttle.assertNotLocked(email)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('login sukses (recordSuccess) mereset counter', async () => {
    for (let i = 0; i < 4; i++) await a.throttle.recordFailure(email);
    await a.throttle.recordSuccess(email);
    for (let i = 0; i < 4; i++) await a.throttle.recordFailure(email); // kumulatif 8, tapi sudah reset
    await expect(a.throttle.assertNotLocked(email)).resolves.toBeUndefined();
  });

  it('email berbeda punya counter independen', async () => {
    const emailLain = `throttle-lain-${randomUUID()}@test.lentera.id`;
    for (let i = 0; i < 5; i++) await a.throttle.recordFailure(email);
    await expect(a.throttle.assertNotLocked(email)).rejects.toThrow(HttpException);
    await expect(a.throttle.assertNotLocked(emailLain)).resolves.toBeUndefined();
  });

  it('lock key ke-set dengan TTL mendekati LOCKOUT_MS (15 menit)', async () => {
    for (let i = 0; i < 5; i++) await a.throttle.recordFailure(email);
    const ttlMs = await a.redis.client.pttl(`login-throttle:lock:${email.toLowerCase()}`);
    expect(ttlMs).toBeGreaterThan(14 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('state persisten lintas instance — lockout via instance A kebaca oleh instance B', async () => {
    for (let i = 0; i < 5; i++) await a.throttle.recordFailure(email);
    // Instance B tidak pernah panggil recordFailure sama sekali — kalau state
    // masih in-memory per-proses (Map lama), B TIDAK AKAN tahu email ini
    // sedang lockout. Dengan Redis, B harus baca lock yang sama.
    await expect(b.throttle.assertNotLocked(email)).rejects.toThrow(HttpException);

    // recordSuccess via B juga harus menghapus state yang ditulis A.
    await b.throttle.recordSuccess(email);
    await expect(a.throttle.assertNotLocked(email)).resolves.toBeUndefined();
  });
});
