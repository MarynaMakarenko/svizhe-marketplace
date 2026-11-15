import { Router } from 'express';
import { notFound } from '../errors.js';
import * as v from '../validate.js';
import { requireRole } from '../middleware/auth.js';
import { changeStatus, checkout, listOrders } from '../orders-service.js';

const router = Router();
router.use(requireRole('buyer'));

router.post('/', async (req, res) => {
  const b = req.body || {};
  const orderIds = await checkout(req.user.id, {
    delivery_address: v.str(b.delivery_address, 'Адреса доставки', { min: 5, max: 300 }),
    phone: v.phone(b.phone),
    comment: v.str(b.comment, 'Коментар', { max: 1000, required: false }),
  });
  const orders = (await listOrders({ buyerId: req.user.id })).filter((o) =>
    orderIds.includes(o.id),
  );
  res.status(201).json({ orders });
});

router.get('/', async (req, res) => {
  res.json({ orders: await listOrders({ buyerId: req.user.id }) });
});

router.get('/:id', async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  const [order] = await listOrders({ buyerId: req.user.id, id });
  if (!order) throw notFound('Замовлення не знайдено');
  res.json({ order });
});

router.post('/:id/cancel', async (req, res) => {
  const id = v.int(req.params.id, 'id', { min: 1 });
  await changeStatus(id, 'cancelled', { role: 'buyer', userId: req.user.id });
  const [order] = await listOrders({ buyerId: req.user.id, id });
  res.json({ order });
});

export default router;
