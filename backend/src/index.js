import { config } from './config.js';
import { createApp } from './app.js';
import { closePool } from './db.js';
import { migrate } from './migrate.js';
import { seedIfEmpty } from './seed.js';

// Порядок запуску: міграції → демо-дані (якщо база порожня) → HTTP-сервер.
async function main() {
  await migrate();
  if (config.seedOnStart) await seedIfEmpty();

  const server = createApp().listen(config.port, () => {
    console.log(`[api] сервер слухає порт ${config.port}`);
  });

  // Коректне завершення: дочекатися активних запитів і закрити з'єднання з базою.
  const shutdown = (signal) => {
    console.log(`[api] отримано ${signal}, завершення роботи`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[api] не вдалося запустити сервер:', err);
  process.exit(1);
});
