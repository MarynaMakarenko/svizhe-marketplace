import { Router } from 'express';
import { query } from '../db.js';
import { conflict, notFound } from '../errors.js';
import * as v from '../validate.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireRole('buyer'));

export async function loadCart(userId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ci.product_id, ci.quantity, p.name, p.price, p.unit, p.stock, p.image_url,
            p.seller_id, s.shop_name,
            (p.is_active AND s.status = 'approved') AS available
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     JOIN sellers s  ON s.id = p.seller_id
     WHERE ci.user_id = $1 ORDER BY s.shop_name, p.name`,
    [userId],
  );
  const total = rows.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return {
    items: rows,
    total: Math.round(total * 100) / 100,
    count: rows.reduce((n, i) => n + i.quantity, 0),
  };
}

async function getAvailableProduct(productId) {
  const { rows } = await query('SELECT id, stock, name FROM catalog_products WHERE id = $1', [
    productId,
  ]);
  if (!rows[0]) throw notFound('Товар не знайдено або він недоступний');
  return rows[0];
}

router.get('/', async (req, res) => {
  res.json(await loadCart(req.user.id));
});

// Додати товар: якщо він уже в кошику, кількість збільшується.
router.post('/', async (req, res) => {
  const productId = v.int(req.body?.product_id, 'product_id', { min: 1 });
  const quantity = v.int(req.body?.quantity ?? 1, 'Кількість', { min: 1, max: 999 });
  const product = await getAvailableProduct(productId);

  const current = await query(
    'SELECT quantity FROM cart_items WHERE user_id = $1 AND product_id = $2',
    [req.user.id, productId],
  );
  const wanted = (current.rows[0]?.quantity || 0) + quantity;
  if (wanted > product.stock) {
    throw conflict(`«${product.name}»: на складі лише ${product.stock}`);
  }
  await query(
    `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [req.user.id, productId, wanted],
  );
  res.status(201).json(await loadCart(req.user.id));
});

// Встановити точну кількість.
router.put('/:productId', async (req, res) => {
  const productId = v.int(req.params.productId, 'product_id', { min: 1 });
  const quantity = v.int(req.body?.quantity, 'Кількість', { min: 1, max: 999 });
  const product = await getAvailableProduct(productId);
  if (quantity > product.stock) {
    throw conflict(`«${product.name}»: на складі лише ${product.stock}`);
  }
  const { rowCount } = await query(
    'UPDATE cart_items SET quantity = $3 WHERE user_id = $1 AND product_id = $2',
    [req.user.id, productId, quantity],
  );
  if (!rowCount) throw notFound('Цього товару немає в кошику');
  res.json(await loadCart(req.user.id));
});

router.delete('/:productId', async (req, res) => {
  const productId = v.int(req.params.productId, 'product_id', { min: 1 });
  await query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [
    req.user.id,
    productId,
  ]);
  res.json(await loadCart(req.user.id));
});

router.delete('/', async (req, res) => {
  await query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
  res.json(await loadCart(req.user.id));
});

export default router;
