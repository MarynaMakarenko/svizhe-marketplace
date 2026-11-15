import { query, transaction } from './db.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';

// Дозволені переходи статусу замовлення.
//   new → confirmed → shipped → delivered
//   new / confirmed → cancelled
export const TRANSITIONS = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export const STATUS_LABELS = {
  new: 'Нове',
  confirmed: 'Підтверджено',
  shipped: 'Відправлено',
  delivered: 'Доставлено',
  cancelled: 'Скасовано',
};

// Оформлення замовлення з кошика.
// Усе відбувається в одній транзакції: рядки товарів блокуються (FOR UPDATE),
// тому двоє покупців не можуть одночасно купити останню одиницю товару.
// Кошик ділиться на окремі замовлення — по одному на кожного продавця.
export async function checkout(userId, { delivery_address, phone, comment }) {
  return transaction(async (db) => {
    const { rows: items } = await db.query(
      `SELECT ci.product_id, ci.quantity, p.name, p.price, p.unit, p.stock, p.seller_id,
              (p.is_active AND s.status = 'approved') AS available
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN sellers s  ON s.id = p.seller_id
       WHERE ci.user_id = $1
       ORDER BY p.id
       FOR UPDATE OF p`,
      [userId],
    );
    if (!items.length) throw badRequest('Кошик порожній');

    const problems = [];
    for (const i of items) {
      if (!i.available) problems.push(`«${i.name}» більше не продається`);
      else if (i.stock < i.quantity) problems.push(`«${i.name}»: на складі лише ${i.stock}`);
    }
    if (problems.length) throw conflict('Не вдалося оформити замовлення', problems);

    const bySeller = new Map();
    for (const i of items) {
      if (!bySeller.has(i.seller_id)) bySeller.set(i.seller_id, []);
      bySeller.get(i.seller_id).push(i);
    }

    const orderIds = [];
    for (const [sellerId, sellerItems] of bySeller) {
      const total = sellerItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const { rows } = await db.query(
        `INSERT INTO orders (buyer_id, seller_id, total, delivery_address, phone, comment)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, sellerId, total.toFixed(2), delivery_address, phone, comment],
      );
      const orderId = rows[0].id;
      orderIds.push(orderId);
      for (const i of sellerItems) {
        await db.query(
          `INSERT INTO order_items (order_id, product_id, product_name, unit, price, quantity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, i.product_id, i.name, i.unit, i.price, i.quantity],
        );
        await db.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [
          i.quantity,
          i.product_id,
        ]);
      }
    }
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    return orderIds;
  });
}

// Зміна статусу. Під час скасування товари повертаються на склад.
// actor: { role: 'buyer' | 'seller', userId, sellerId }
export async function changeStatus(orderId, nextStatus, actor) {
  return transaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw notFound('Замовлення не знайдено');

    if (actor.role === 'buyer') {
      if (order.buyer_id !== actor.userId) throw notFound('Замовлення не знайдено');
      if (nextStatus !== 'cancelled' || order.status !== 'new') {
        throw forbidden('Скасувати можна лише замовлення, яке продавець ще не підтвердив');
      }
    } else if (order.seller_id !== actor.sellerId) {
      throw notFound('Замовлення не знайдено');
    }

    if (!TRANSITIONS[order.status].includes(nextStatus)) {
      throw conflict(
        `Неможливо змінити статус «${STATUS_LABELS[order.status]}» на «${STATUS_LABELS[nextStatus] || nextStatus}»`,
      );
    }

    if (nextStatus === 'cancelled') {
      await db.query(
        `UPDATE products p SET stock = p.stock + oi.quantity
         FROM order_items oi WHERE oi.order_id = $1 AND oi.product_id = p.id`,
        [orderId],
      );
    }
    await db.query('UPDATE orders SET status = $1, updated_at = now() WHERE id = $2', [
      nextStatus,
      orderId,
    ]);
    return { ...order, status: nextStatus };
  });
}

// Замовлення разом з позиціями. filter: { buyerId } або { sellerId }, опційно { id, status }.
export async function listOrders(filter) {
  const where = [];
  const params = [];
  for (const [column, value] of [
    ['o.buyer_id', filter.buyerId],
    ['o.seller_id', filter.sellerId],
    ['o.id', filter.id],
    ['o.status', filter.status],
  ]) {
    if (value !== undefined) {
      params.push(value);
      where.push(`${column} = $${params.length}`);
    }
  }
  const { rows } = await query(
    `SELECT o.id, o.status, o.total, o.delivery_address, o.phone, o.comment,
            o.created_at, o.updated_at, o.seller_id, s.shop_name,
            u.full_name AS buyer_name, u.email AS buyer_email,
            COALESCE(json_agg(json_build_object(
              'product_id', oi.product_id, 'name', oi.product_name, 'unit', oi.unit,
              'price', oi.price::FLOAT, 'quantity', oi.quantity
            ) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
     FROM orders o
     JOIN sellers s ON s.id = o.seller_id
     JOIN users u   ON u.id = o.buyer_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE ${where.join(' AND ')}
     GROUP BY o.id, s.shop_name, u.full_name, u.email
     ORDER BY o.created_at DESC, o.id DESC`,
    params,
  );
  return rows;
}
