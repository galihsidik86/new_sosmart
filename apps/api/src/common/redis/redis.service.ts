import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * Client Redis tunggal per proses — dipakai state yang WAJIB konsisten lintas
 * instance API kalau di-scale horizontal (mis. LoginThrottleService, R8).
 * Fallback `redis://localhost:6379` untuk kenyamanan dev, pola sama fallback
 * JWT secret dev-only di `auth.module.ts`.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.client = new Redis(url);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
