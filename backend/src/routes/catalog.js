import { Router } from 'express';
import { query } from '../db.js';
import { conflict, forbidden, notFound } from '../errors.js';
import * as v from '../validate.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const SORTS = {
  new: 'created_at DESC, id DESC',
  price_asc: 'price ASC, id ASC',
  price_desc: 'price DESC, id DESC',
  rating: 'rating DESC, reviews_count DESC, id DESC',
};

router.get('/categories', async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.name, c.slug, c.icon, COUNT(cp.id)::INTEGER AS products_count
     FROM categories c LEFT JOIN catalog_products cp ON cp.category_id = c.id
     GROUP BY c.id ORDER BY c.name`,
  );
  res.json({ categories: rows });
});

// Каталог: пошук, фільтри, сортування, посторінковий вивід.
router.get('/products', async (req, res) => {
  const q = req.query;
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (q.search) add('lower(name) LIKE ?', `%${String(q.search).trim().toLowerCase()}%`);
  if (q.category) add('category_slug = ?', String(q.category));
  if (q.seller) add('seller_id = ?', v.int(q.seller, 'seller', { min: 1 }));
  if (q.min_price) add('price >= ?', v.price(q.min_price, 'min_price'));
  if (q.max_price) add('price <= ?', v.price(q.max_price, 'max_price'));
  if (q.in_stock === 'true') where.push('stock > 0');

  const page = v.int(q.page || 1, 'page', { min: 1, max: 10_000 });
  const limit = v.int(q.limit || 12, 'limit', { min: 1, max: 48 });
  const orderBy = SORTS[q.sort] || SORTS.new;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (await query(`SELECT COUNT(*) AS n FROM catalog_products ${whereSql}`, params))
    .rows[0].n;
  const { rows } = await query(
    `SELECT * FROM catalog_products ${whereSql}
     ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  res.json({ products: rows, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/products/:id', async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  const { rows } = await query('SELECT * FROM catalog_products WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Товар не знайдено');
  const reviews = await query(
    `SELECT r.id, r.rating, r.comment, r.created_at, u.full_name AS author
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.product_id = $1 ORDER BY r.created_at DESC`,
    [id],
  );
  res.json({ product: rows[0], reviews: reviews.rows });
});

// Відгук може залишити лише покупець, якому цей товар уже доставили.
router.post('/products/:id/reviews', requireRole('buyer'), async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  const rating = v.int(req.body?.rating, 'Оцінка', { min: 1, max: 5 });
  const comment = v.str(req.body?.comment, 'Коментар', { max: 2000, required: false });

  const bought = await query(
    `SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.buyer_id = $1 AND oi.product_id = $2 AND o.status = 'delivered' LIMIT 1`,
    [req.user.id, id],
  );
  if (!bought.rows[0]) {
    throw forbidden('Відгук можна залишити після отримання замовлення з цим товаром');
  }
  try {
    const { rows } = await query(
      `INSERT INTO reviews (product_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4) RETURNING id, rating, comment, created_at`,
      [id, req.user.id, rating, comment],
    );
    res.status(201).json({ review: { ...rows[0], author: req.user.full_name } });
  } catch (err) {
    if (err.code === '23505') throw conflict('Ви вже залишили відгук на цей товар');
    throw err;
  }
});

// Публічна сторінка магазину.
router.get('/sellers/:id', async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  const { rows } = await query(
    `SELECT s.id, s.shop_name, s.description, s.city, s.created_at,
            (SELECT COUNT(*) FROM catalog_products cp WHERE cp.seller_id = s.id)::INTEGER AS products_count
     FROM sellers s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.status = 'approved' AND NOT u.is_blocked`,
    [id],
  );
  if (!rows[0]) throw notFound('Магазин не знайдено');
  res.json({ seller: rows[0] });
});

export default router;
