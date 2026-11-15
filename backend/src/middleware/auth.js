import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { unauthorized, forbidden } from '../errors.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Читає токен із заголовка Authorization і підвантажує користувача з бази.
// Роль і блокування перевіряються за базою щоразу, тому заблокований
// користувач втрачає доступ одразу, а не коли спливе токен.
async function loadUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  let payload;
  try {
    payload = jwt.verify(header.slice(7), config.jwtSecret);
  } catch {
    return null;
  }
  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.is_blocked,
            s.id AS seller_id, s.shop_name, s.status AS seller_status
     FROM users u LEFT JOIN sellers s ON s.user_id = u.id
     WHERE u.id = $1`,
    [payload.sub],
  );
  return rows[0] || null;
}

export async function requireAuth(req, res, next) {
  const user = await loadUser(req);
  if (!user) throw unauthorized();
  if (user.is_blocked) throw forbidden('Акаунт заблоковано адміністратором');
  req.user = user;
  next();
}

export function requireRole(...roles) {
  return async (req, res, next) => {
    await requireAuth(req, res, () => {});
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    phone: u.phone,
    role: u.role,
    seller: u.seller_id
      ? { id: u.seller_id, shop_name: u.shop_name, status: u.seller_status }
      : null,
  };
}
