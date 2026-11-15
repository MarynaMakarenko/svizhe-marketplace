import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { query, transaction, closePool } from './db.js';

// Застосовує SQL-файли з каталогу міграцій у порядку назв.
// Уже застосовані файли запам'ятовуються в таблиці schema_migrations,
// тому команду безпечно запускати під час кожного старту.
export async function migrate({ silent = false } = {}) {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const applied = new Set(
    (await query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename),
  );
  const files = (await fs.readdir(config.migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(config.migrationsDir, file), 'utf8');
    await transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    });
    if (!silent) console.log(`[migrate] застосовано ${file}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => console.log('[migrate] базу оновлено'))
    .catch((err) => {
      console.error('[migrate] помилка:', err.message);
      process.exitCode = 1;
    })
    .finally(closePool);
}
