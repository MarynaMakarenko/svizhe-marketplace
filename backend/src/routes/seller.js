import { Router } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { query } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import * as v from '../validate.js';
import { requireRole } from '../middleware/auth.js';
import { changeStatus, listOrders, TRANSITIONS } from '../orders-service.js';

const router = Router();
router.use(requireRole('seller'));

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Фото зберігаються на диску під випадковим ім'ям; у базі лежить лише шлях.
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (req, file, cb) =>
      cb(null, `${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype] || path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    IMAGE_TYPES[file.mimetype]
      ? cb(null, true)
      : cb(badRequest('Дозволені лише зображення JPG, PNG або WebP')),
});

function productInput(body) {
  return {
    name: v.str(body.name, 'Назва', { min: 2, max: 160 }),
    description: v.str(body.description, 'Опис', { max: 4000, required: false }),
    price: v.price(body.price),
    unit: v.str(body.unit || 'шт', 'Одиниця', { max: 20 }),
    stock: v.int(body.stock, 'Залишок', { min: 0, max: 100_000 }),
    category_id: v.int(body.category_id, 'Категорія', { min: 1 }),
    image_url: v.str(body.image_url, 'Фото', { max: 500, required: false }) || null,
    is_active: body.is_active === undefined ? true : Boolean(body.is_active),
  };
}

async function assertCategory(id) {
  const { rows } = await query('SELECT 1 FROM categories WHERE id = $1', [id]);
  if (!rows[0]) throw badRequest('Такої категорії не існує');
}

// --- Профіль магазину ---

router.get('/profile', async (req, res) => {
  const { rows } = await query(
    'SELECT id, shop_name, description, city, status, created_at FROM sellers WHERE id = $1',
    [req.user.seller_id],
  );
  res.json({ seller: rows[0] });
});

router.patch('/profile', async (req, res) => {
  const b = req.body || {};
  try {
    const { rows } = await query(
      `UPDATE sellers SET shop_name = $1, description = $2, city = $3 WHERE id = $4
       RETURNING id, shop_name, description, city, status, created_at`,
      [
        v.str(b.shop_name, 'Назва магазину', { min: 2, max: 120 }),
        v.str(b.description, 'Опис', { max: 2000, required: false }),
        v.str(b.city, 'Місто', { max: 80, required: false }),
        req.user.seller_id,
      ],
    );
    res.json({ seller: rows[0] });
  } catch (err) {
    if (err.code === '23505') throw conflict('Магазин з такою назвою вже існує');
    throw err;
  }
});

// --- Товари ---

router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) throw badRequest('Файл не отримано');
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

router.get('/products', async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, c.name AS category_name FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.seller_id = $1 ORDER BY p.created_at DESC, p.id DESC`,
    [req.user.seller_id],
  );
  res.json({ products: rows });
});

router.post('/products', async (req, res) => {
  const p = productInput(req.body || {});
  await assertCategory(p.category_id);
  const { rows } = await query(
    `INSERT INTO products (seller_id, category_id, name, description, price, unit, stock, image_url, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [req.user.seller_id, p.category_id, p.name, p.description, p.price, p.unit, p.stock, p.image_url, p.is_active],
  );
  res.status(201).json({ product: rows[0] });
});

router.put('/products/:id', async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  const p = productInput(req.body || {});
  await assertCategory(p.category_id);
  const { rows } = await query(
    `UPDATE products SET category_id = $1, name = $2, description = $3, price = $4, unit = $5,
            stock = $6, image_url = $7, is_active = $8
     WHERE id = $9 AND seller_id = $10 RETURNING *`,
    [p.category_id, p.name, p.description, p.price, p.unit, p.stock, p.image_url, p.is_active, id, req.user.seller_id],
  );
  if (!rows[0]) throw notFound('Товар не знайдено');
  res.json({ product: rows[0] });
});

router.delete('/products/:id', async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  const { rowCount } = await query('DELETE FROM products WHERE id = $1 AND seller_id = $2', [
    id,
    req.user.seller_id,
  ]);
  if (!rowCount) throw notFound('Товар не знайдено');
  res.status(204).end();
});

// --- Замовлення ---

router.get('/orders', async (req, res) => {
  const status = req.query.status
    ? v.oneOf(req.query.status, 'status', Object.keys(TRANSITIONS))
    : undefined;
  res.json({ orders: await listOrders({ sellerId: req.user.seller_id, status }) });
});

router.patch('/orders/:id/status', async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  const status = v.oneOf(req.body?.status, 'Статус', Object.keys(TRANSITIONS));
  await changeStatus(id, status, { role: 'seller', sellerId: req.user.seller_id });
  const [order] = await listOrders({ sellerId: req.user.seller_id, id });
  res.json({ order });
});

// --- Зведення для головної сторінки кабінету ---

router.get('/stats', async (req, res) => {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*) FROM products WHERE seller_id = $1)::INTEGER AS products,
       (SELECT COUNT(*) FROM products WHERE seller_id = $1 AND stock = 0)::INTEGER AS out_of_stock,
       (SELECT COUNT(*) FROM orders WHERE seller_id = $1 AND status = 'new')::INTEGER AS new_orders,
       (SELECT COUNT(*) FROM orders WHERE seller_id = $1)::INTEGER AS orders,
       (SELECT COALESCE(SUM(total), 0) FROM orders
         WHERE seller_id = $1 AND status = 'delivered')::FLOAT AS revenue`,
    [req.user.seller_id],
  );
  res.json({ stats: rows[0] });
});

export default router;
