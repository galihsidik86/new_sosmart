import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { LoginThrottleService } from './login-throttle.service.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Tidak ada fallback ke secret hardcoded di produksi — env-guard
        // sudah menolak boot kalau JWT_ACCESS_SECRET kosong. Fallback dev
        // hanya dipakai di luar produksi untuk kenyamanan lokal.
        secret:
          config.get<string>('JWT_ACCESS_SECRET') ??
          (process.env.NODE_ENV === 'production' ? undefined : 'dev-access-local-only'),
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_TTL') ?? '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LoginThrottleService],
  exports: [AuthService],
})
export class AuthModule {}
