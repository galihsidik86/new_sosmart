import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: true }),
  );

  await app.register(fastifyCookie);

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
