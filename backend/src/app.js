import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { config } from './config.js';
import { query } from './db.js';
import { HttpError } from './errors.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import cartRoutes from './routes/cart.js';
import catalogRoutes from './routes/catalog.js';
import ordersRoutes from './routes/orders.js';
import sellerRoutes from './routes/seller.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ logRequests = true } = {}) {
  const app = express();
  fs.mkdirSync(config.uploadsDir, { recursive: true });

  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  // Журнал запитів: один рядок на запит у stdout (його збирає Docker).
  if (logRequests) {
    app.use((req, res, next) => {
      const started = Date.now();
      res.on('finish', () => {
        if (req.path === '/api/health') return;
        console.log(
          `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`,
        );
      });
      next();
    });
  }

  // Перевірка стану: відповідає 200 лише коли база доступна.
  app.get('/api/health', async (req, res) => {
    await query('SELECT 1');
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  const openapi = YAML.parse(fs.readFileSync(path.join(rootDir, 'openapi.yaml'), 'utf8'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'Свіже API' }));

  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d' }));

  app.use('/api/auth', authRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/seller', sellerRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Маршрут не знайдено' }));

  // Єдиний обробник помилок: усі відповіді з помилкою мають вигляд { error, details? }.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? 'Файл завеликий (максимум 3 МБ)' : 'Помилка завантаження файлу';
      return res.status(400).json({ error: message });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Некоректний JSON у запиті' });
    }
    console.error(`${new Date().toISOString()} ПОМИЛКА ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  });

  return app;
}
