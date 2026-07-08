/**
 * Setup global untuk integration tests.
 * Pastikan env DB test di-set; kalau tidak, fail fast.
 */
import 'reflect-metadata';

if (!process.env.TEST_DATABASE_URL) {
  process.env.TEST_DATABASE_URL =
    'postgresql://lentera:lentera_dev_pwd@localhost:5432/lentera_test?schema=public';
}
if (!process.env.TEST_APP_DATABASE_URL) {
  process.env.TEST_APP_DATABASE_URL =
    'postgresql://lentera_app:lentera_app_pwd@localhost:5432/lentera_test?schema=public';
}
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'redis://localhost:6379';
}
// Override env untuk PrismaService.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_DATABASE_URL = process.env.TEST_APP_DATABASE_URL;
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
