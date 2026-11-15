import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../db.js';
import { badRequest, conflict, forbidden, unauthorized } from '../errors.js';
import * as v from '../validate.js';
import { publicUser, requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

const USER_WITH_SELLER = `
  SELECT u.id, u.email, u.full_name, u.phone, u.role, u.is_blocked, u.password_hash,
         s.id AS seller_id, s.shop_name, s.status AS seller_status
  FROM users u LEFT JOIN sellers s ON s.user_id = u.id`;

// Реєстрація покупця або продавця. Продавець одразу отримує магазин
// зі статусом pending і чекає на схвалення адміністратора.
router.post('/register', async (req, res) => {
  const b = req.body || {};
  const role = v.oneOf(b.role || 'buyer', 'Роль', ['buyer', 'seller']);
  const data = {
    email: v.email(b.email),
    full_name: v.str(b.full_name, "Ім'я", { min: 2, max: 120 }),
    phone: v.phone(b.phone, { required: false }),
  };
  const password = v.str(b.password, 'Пароль', { min: 6, max: 72 });
  const shop =
    role === 'seller'
      ? {
          shop_name: v.str(b.shop_name, 'Назва магазину', { min: 2, max: 120 }),
          city: v.str(b.city, 'Місто', { max: 80, required: false }),
          description: v.str(b.description, 'Опис', { max: 2000, required: false }),
        }
      : null;

  const hash = await bcrypt.hash(password, 10);
  let userId;
  try {
    userId = await transaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, full_name, phone, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [data.email, hash, data.full_name, data.phone || null, role],
      );
      if (shop) {
        await db.query(
          `INSERT INTO sellers (user_id, shop_name, city, description) VALUES ($1, $2, $3, $4)`,
          [rows[0].id, shop.shop_name, shop.city, shop.description],
        );
      }
      return rows[0].id;
    });
  } catch (err) {
    if (err.code === '23505') {
      throw conflict(
        err.constraint === 'sellers_shop_name_key'
          ? 'Магазин з такою назвою вже існує'
          : 'Користувач з таким email уже зареєстрований',
      );
    }
    throw err;
  }

  const { rows } = await query(`${USER_WITH_SELLER} WHERE u.id = $1`, [userId]);
  res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
});

router.post('/login', async (req, res) => {
  const b = req.body || {};
  if (!b.email || !b.password) throw badRequest('Вкажіть email і пароль');
  const { rows } = await query(`${USER_WITH_SELLER} WHERE u.email = $1`, [
    String(b.email).trim().toLowerCase(),
  ]);
  const user = rows[0];
  // Однакове повідомлення для «немає користувача» і «невірний пароль»,
  // щоб не підказувати, які email зареєстровані.
  if (!user || !(await bcrypt.compare(String(b.password), user.password_hash))) {
    throw unauthorized('Невірний email або пароль');
  }
  if (user.is_blocked) throw forbidden('Акаунт заблоковано адміністратором');
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch('/me', requireAuth, async (req, res) => {
  const b = req.body || {};
  const full_name = v.str(b.full_name, "Ім'я", { min: 2, max: 120 });
  const phone = v.phone(b.phone, { required: false });
  await query('UPDATE users SET full_name = $1, phone = $2 WHERE id = $3', [
    full_name,
    phone || null,
    req.user.id,
  ]);
  res.json({ user: publicUser({ ...req.user, full_name, phone: phone || null }) });
});

export default router;
