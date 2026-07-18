import 'reflect-metadata';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Logger } from '@nestjs/common';
import { installIndonesianErrors } from '@lentera/shared';
import { AppModule } from './app.module.js';
import { assertProductionSecrets } from './common/config/env-guard.js';
import { API_ROOT } from './common/config/paths.js';

async function bootstrap() {
  // Pasang errorMap Bahasa Indonesia pada instance zod milik @lentera/shared
  // (instance yang dipakai semua schema) — melokalkan pesan validasi default.
  installIndonesianErrors();

  // Tolak boot kalau JWT secret / APP_DATABASE_URL tidak aman di produksi.
  assertProductionSecrets();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: true }),
  );

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max — cukup untuk Excel master data
  });
  // Serve file upload publik (logo perusahaan, dll) di luar prefix /api/v1
  // — diregister langsung ke instance Fastify, bukan lewat Nest controller.
  const uploadsRoot = path.join(API_ROOT, 'uploads');
  mkdirSync(uploadsRoot, { recursive: true }); // @fastify/static butuh root ada saat register.
  await app.register(fastifyStatic, {
    root: uploadsRoot,
    prefix: '/uploads/',
  });

  app.enableCors({
    origin: process.env.NEXT_PUBLIC_WEB_URL?.split(',') ?? [
      'http://localhost:3000',
    ],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  // Validasi pakai ZodValidationPipe per-handler — tidak perlu global ValidationPipe
  // dari class-validator.

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen({ port, host: '0.0.0.0' });
  Logger.log(`🚀 Lentera API berjalan di http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((e) => {
  Logger.error(e, 'Bootstrap');
  process.exit(1);
});
