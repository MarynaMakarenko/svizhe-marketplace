import pg from 'pg';
import { config } from './config.js';

// NUMERIC та BIGINT pg за замовчуванням віддає рядками — перетворюємо на числа.
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

let pool = new pg.Pool({ connectionString: config.databaseUrl });

// Дозволяє тестам підмінити підключення на окрему тестову базу.
export async function usePool(connectionString) {
  await pool.end();
  pool = new pg.Pool({ connectionString });
}

export function query(text, params) {
  return pool.query(text, params);
}

export async function closePool() {
  await pool.end();
}

// Виконує функцію в межах транзакції: COMMIT, якщо все добре, інакше ROLLBACK.
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
