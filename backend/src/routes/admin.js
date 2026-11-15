import { Router } from 'express';
import { query } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import * as v from '../validate.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireRole('admin'));

router.get('/stats', async (req, res) => {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role = 'buyer')::INTEGER AS buyers,
       (SELECT COUNT(*) FROM sellers WHERE status = 'approved')::INTEGER AS sellers,
       (SELECT COUNT(*) FROM sellers WHERE status = 'pending')::INTEGER AS pending_sellers,
       (SELECT COUNT(*) FROM products WHERE is_active)::INTEGER AS products,
       (SELECT COUNT(*) FROM orders)::INTEGER AS orders,
       (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'delivered')::FLOAT AS turnover`,
  );
  const byStatus = await query(
    `SELECT status, COUNT(*)::INTEGER AS count FROM orders GROUP BY status`,
  );
  res.json({ stats: rows[0], orders_by_status: byStatus.rows });
});

// --- Продавці ---

router.get('/sellers', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.status) {
    params.push(v.oneOf(req.query.status, 'status', ['pending', 'approved', 'rejected']));
    where = 'WHERE s.status = $1';
  }
  const { rows } = await query(
    `SELECT s.id, s.shop_name, s.description, s.city, s.status, s.created_at,
            u.email, u.full_name, u.phone,
            (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id)::INTEGER AS products_count
     FROM sellers s JOIN users u ON u.id = s.user_id ${where}
     ORDER BY (s.status = 'pending') DESC, s.created_at DESC`,
    params,
  );
  res.json({ sellers: rows });
});

router.patch('/sellers/:id', async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  const status = v.oneOf(req.body?.status, 'Статус', ['pending', 'approved', 'rejected']);
  const { rows } = await query(
    'UPDATE sellers SET status = $1 WHERE id = $2 RETURNING id, shop_name, status',
    [status, id],
  );
  if (!rows[0]) throw notFound('Продавця не знайдено');
  res.json({ seller: rows[0] });
});

// --- Користувачі ---

router.get('/users', async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.is_blocked, u.created_at,
            s.shop_name
     FROM users u LEFT JOIN sellers s ON s.user_id = u.id
     ORDER BY u.created_at DESC, u.id DESC`,
  );
  res.json({ users: rows });
});

router.patch('/users/:id', async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  if (typeof req.body?.is_blocked !== 'boolean') throw badRequest('Вкажіть is_blocked: true/false');
  if (id === req.user.id) throw badRequest('Не можна заблокувати власний акаунт');
  const { rows } = await query(
    'UPDATE users SET is_blocked = $1 WHERE id = $2 RETURNING id, email, is_blocked',
    [req.body.is_blocked, id],
  );
  if (!rows[0]) throw notFound('Користувача не знайдено');
  res.json({ user: rows[0] });
});

// --- Категорії ---

function categoryInput(body) {
  const name = v.str(body.name, 'Назва', { min: 2, max: 80 });
  const slug = v.str(body.slug, 'Адреса (slug)', { min: 2, max: 80 }).toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw badRequest('Slug може містити лише латинські літери, цифри та дефіс');
  }
  return { name, slug, icon: v.str(body.icon || '🛒', 'Іконка', { max: 16 }) };
}

router.post('/categories', async (req, res) => {
  const c = categoryInput(req.body || {});
  try {
    const { rows } = await query(
      'INSERT INTO categories (name, slug, icon) VALUES ($1, $2, $3) RETURNING *',
      [c.name, c.slug, c.icon],
    );
    res.status(201).json({ category: rows[0] });
  } catch (err) {
    if (err.code === '23505') throw conflict('Категорія з такою назвою або slug уже існує');
    throw err;
  }
});

router.put('/categories/:id', async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  const c = categoryInput(req.body || {});
  try {
    const { rows } = await query(
      'UPDATE categories SET name = $1, slug = $2, icon = $3 WHERE id = $4 RETURNING *',
      [c.name, c.slug, c.icon, id],
    );
    if (!rows[0]) throw notFound('Категорію не знайдено');
    res.json({ category: rows[0] });
  } catch (err) {
    if (err.code === '23505') throw conflict('Категорія з такою назвою або slug уже існує');
    throw err;
  }
});

router.delete('/categories/:id', async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  try {
    const { rowCount } = await query('DELETE FROM categories WHERE id = $1', [id]);
    if (!rowCount) throw notFound('Категорію не знайдено');
    res.status(204).end();
  } catch (err) {
    // 23503 — на категорію посилаються товари (ON DELETE RESTRICT)
    if (err.code === '23503') throw conflict('У категорії є товари — спершу перенесіть їх');
    throw err;
  }
});

export default router;
