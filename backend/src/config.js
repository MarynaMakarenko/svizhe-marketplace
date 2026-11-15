import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Усі налаштування беруться зі змінних оточення, щоб один і той самий код
// працював і локально, і в Docker без правок.
export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://svizhe:change_me_please@localhost:5433/svizhe',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  seedOnStart: (process.env.SEED_ON_START || 'true') === 'true',
  uploadsDir: process.env.UPLOADS_DIR || path.join(rootDir, 'uploads'),
  migrationsDir:
    process.env.MIGRATIONS_DIR ||
    (process.env.NODE_ENV === 'production'
      ? path.join(rootDir, 'migrations')
      : path.join(rootDir, '..', 'db', 'migrations')),
};
