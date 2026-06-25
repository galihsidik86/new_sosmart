import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@lentera/db';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        // Runtime app pakai APP_DATABASE_URL (user non-superuser) supaya RLS aktif.
        // Fallback ke DATABASE_URL kalau APP_DATABASE_URL belum di-set.
        db: { url: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL },
      },
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
