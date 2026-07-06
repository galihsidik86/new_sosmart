/**
 * Unit test untuk LoginThrottleService — rate-limit login per email.
 * Regresi untuk bug: /auth/login sebelumnya tidak punya pembatasan apa pun,
 * jadi brute-force/credential-stuffing bebas dicoba tanpa hambatan.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { LoginThrottleService } from '../login-throttle.service.js';

describe('LoginThrottleService', () => {
  let svc: LoginThrottleService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    svc = new LoginThrottleService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tidak lock sebelum mencapai batas percobaan', () => {
    for (let i = 0; i < 4; i++) svc.recordFailure('a@b.com');
    expect(() => svc.assertNotLocked('a@b.com')).not.toThrow();
  });

  it('lock setelah 5 percobaan gagal beruntun', () => {
    for (let i = 0; i < 5; i++) svc.recordFailure('a@b.com');
    expect(() => svc.assertNotLocked('a@b.com')).toThrow(HttpException);
  });

  it('lockout terangkat otomatis setelah window berlalu', () => {
    for (let i = 0; i < 5; i++) svc.recordFailure('a@b.com');
    expect(() => svc.assertNotLocked('a@b.com')).toThrow();

    vi.advanceTimersByTime(16 * 60 * 1000); // > LOCKOUT_MS (15 menit)
    expect(() => svc.assertNotLocked('a@b.com')).not.toThrow();
  });

  it('login sukses (recordSuccess) mereset counter', () => {
    for (let i = 0; i < 4; i++) svc.recordFailure('a@b.com');
    svc.recordSuccess('a@b.com');
    for (let i = 0; i < 4; i++) svc.recordFailure('a@b.com'); // total kumulatif 8, tapi sudah reset
    expect(() => svc.assertNotLocked('a@b.com')).not.toThrow();
  });

  it('email berbeda punya counter independen', () => {
    for (let i = 0; i < 5; i++) svc.recordFailure('a@b.com');
    expect(() => svc.assertNotLocked('a@b.com')).toThrow();
    expect(() => svc.assertNotLocked('lain@b.com')).not.toThrow();
  });

  it('email tidak case-sensitive', () => {
    for (let i = 0; i < 5; i++) svc.recordFailure('A@B.com');
    expect(() => svc.assertNotLocked('a@b.com')).toThrow();
  });
});
