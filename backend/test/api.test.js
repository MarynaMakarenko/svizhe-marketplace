// Інтеграційні тести API. Працюють зі справжньою PostgreSQL:
// створюють окрему базу <назва>_test, застосовують міграції, а після прогону видаляють її.
//   npm test                                  (локально, база на localhost:5433)
//   docker compose exec backend npm test      (усередині контейнера)
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { closePool, query, usePool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const baseUrl = new URL(config.databaseUrl);
const testDbName = `${baseUrl.pathname.slice(1)}_test`;
const testUrl = new URL(config.databaseUrl);
testUrl.pathname = `/${testDbName}`;

let server;
let origin;
const ctx = {}; // токени та ідентифікатори, спільні для тестів

async function adminSql(sql) {
  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function register(email, extra = {}) {
  const r = await api('POST', '/auth/register', {
    body: { email, password: 'secret123', full_name: 'Тест Користувач', ...extra },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

const product = (overrides = {}) => ({
  name: 'Мед тестовий',
  description: 'Опис',
  price: 100,
  unit: 'шт',
  stock: 10,
  category_id: ctx.categoryId,
  ...overrides,
});

before(async () => {
  await adminSql(`DROP DATABASE IF EXISTS ${testDbName} WITH (FORCE)`);
  await adminSql(`CREATE DATABASE ${testDbName}`);
  await usePool(testUrl.toString());
  await migrate({ silent: true });

  await query(
    `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, 'Адмін', 'admin')`,
    ['admin@test.ua', await bcrypt.hash('secret123', 4)],
  );
  const cat = await query(
    `INSERT INTO categories (name, slug, icon) VALUES ('Мед', 'med', '🍯'), ('Хліб', 'khlib', '🍞') RETURNING id`,
  );
  ctx.categoryId = cat.rows[0].id;
  ctx.category2Id = cat.rows[1].id;

  server = createApp({ logRequests: false }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  ctx.admin = (await api('POST', '/auth/login', { body: { email: 'admin@test.ua', password: 'secret123' } })).data.token;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closePool();
  await adminSql(`DROP DATABASE IF EXISTS ${testDbName} WITH (FORCE)`);
});

describe('Акаунт', () => {
  test('перевірка стану повертає ok', async () => {
    const r = await api('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'ok');
  });

  test('реєстрація покупця повертає токен і роль buyer', async () => {
    const data = await register('buyer1@test.ua');
    assert.ok(data.token);
    assert.equal(data.user.role, 'buyer');
    assert.equal(data.user.seller, null);
    ctx.buyer1 = data.token;
    ctx.buyer2 = (await register('buyer2@test.ua')).token;
  });

  test('повторний email відхиляється з кодом 409', async () => {
    const r = await api('POST', '/auth/register', {
      body: { email: 'BUYER1@test.ua', password: 'secret123', full_name: 'Інший' },
    });
    assert.equal(r.status, 409);
  });

  test('короткий пароль і некоректний email відхиляються з кодом 400', async () => {
    const short = await api('POST', '/auth/register', {
      body: { email: 'x@test.ua', password: '123', full_name: 'Хтось' },
    });
    assert.equal(short.status, 400);
    const bad = await api('POST', '/auth/register', {
      body: { email: 'not-an-email', password: 'secret123', full_name: 'Хтось' },
    });
    assert.equal(bad.status, 400);
  });

  test('невірний пароль дає 401, правильний — токен', async () => {
    const wrong = await api('POST', '/auth/login', { body: { email: 'buyer1@test.ua', password: 'nope' } });
    assert.equal(wrong.status, 401);
    const ok = await api('POST', '/auth/login', { body: { email: 'buyer1@test.ua', password: 'secret123' } });
    assert.equal(ok.status, 200);
    assert.ok(ok.data.token);
  });

  test('пароль зберігається лише у вигляді хешу', async () => {
    const { rows } = await query(`SELECT password_hash FROM users WHERE email = 'buyer1@test.ua'`);
    assert.notEqual(rows[0].password_hash, 'secret123');
    assert.match(rows[0].password_hash, /^\$2[aby]\$/);
  });

  test('без токена захищені маршрути повертають 401', async () => {
    assert.equal((await api('GET', '/auth/me')).status, 401);
    assert.equal((await api('GET', '/cart')).status, 401);
    assert.equal((await api('GET', '/auth/me', { token: 'garbage' })).status, 401);
  });
});

describe('Ролі та модерація продавців', () => {
  test('новий продавець отримує статус pending', async () => {
    const a = await register('seller1@test.ua', { role: 'seller', shop_name: 'Пасіка А', city: 'Київ' });
    assert.equal(a.user.role, 'seller');
    assert.equal(a.user.seller.status, 'pending');
    ctx.seller1 = a.token;
    ctx.seller1Id = a.user.seller.id;
    const b = await register('seller2@test.ua', { role: 'seller', shop_name: 'Пекарня Б' });
    ctx.seller2 = b.token;
    ctx.seller2Id = b.user.seller.id;
  });

  test('продавець без назви магазину не реєструється', async () => {
    const r = await api('POST', '/auth/register', {
      body: { email: 's3@test.ua', password: 'secret123', full_name: 'Без магазину', role: 'seller' },
    });
    assert.equal(r.status, 400);
  });

  test('покупець і продавець не мають доступу до адмінки', async () => {
    assert.equal((await api('GET', '/admin/users', { token: ctx.buyer1 })).status, 403);
    assert.equal((await api('GET', '/admin/users', { token: ctx.seller1 })).status, 403);
    assert.equal((await api('GET', '/seller/products', { token: ctx.buyer1 })).status, 403);
    assert.equal((await api('GET', '/cart', { token: ctx.seller1 })).status, 403);
  });

  test('товар несхваленого продавця не видно в каталозі, після схвалення — видно', async () => {
    const created = await api('POST', '/seller/products', { token: ctx.seller1, body: product() });
    assert.equal(created.status, 201);
    ctx.honeyId = created.data.product.id;

    assert.equal((await api('GET', '/products')).data.total, 0);
    assert.equal((await api('GET', `/products/${ctx.honeyId}`)).status, 404);

    for (const id of [ctx.seller1Id, ctx.seller2Id]) {
      const r = await api('PATCH', `/admin/sellers/${id}`, { token: ctx.admin, body: { status: 'approved' } });
      assert.equal(r.status, 200);
    }
    assert.equal((await api('GET', '/products')).data.total, 1);
    assert.equal((await api('GET', `/products/${ctx.honeyId}`)).status, 200);
  });
});

describe('Товари продавця', () => {
  test('некоректні ціна, залишок і категорія відхиляються', async () => {
    for (const bad of [{ price: 0 }, { price: -5 }, { stock: -1 }, { stock: 1.5 }, { category_id: 99999 }, { name: '' }]) {
      const r = await api('POST', '/seller/products', { token: ctx.seller1, body: product(bad) });
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
  });

  test('продавець не може змінити чи видалити чужий товар', async () => {
    const put = await api('PUT', `/seller/products/${ctx.honeyId}`, { token: ctx.seller2, body: product({ price: 1 }) });
    assert.equal(put.status, 404);
    const del = await api('DELETE', `/seller/products/${ctx.honeyId}`, { token: ctx.seller2 });
    assert.equal(del.status, 404);
    assert.equal((await api('GET', `/products/${ctx.honeyId}`)).data.product.price, 100);
  });

  test('прихований товар зникає з каталогу', async () => {
    const hidden = await api('POST', '/seller/products', {
      token: ctx.seller1,
      body: product({ name: 'Прихований', is_active: false }),
    });
    assert.equal(hidden.status, 201);
    const names = (await api('GET', '/products')).data.products.map((p) => p.name);
    assert.ok(!names.includes('Прихований'));
    assert.equal((await api('GET', '/seller/products', { token: ctx.seller1 })).data.products.length, 2);
  });
});

describe('Каталог', () => {
  before(async () => {
    const bread = await api('POST', '/seller/products', {
      token: ctx.seller2,
      body: product({ name: 'Хліб житній', price: 60, stock: 5, category_id: ctx.category2Id }),
    });
    ctx.breadId = bread.data.product.id;
    const bun = await api('POST', '/seller/products', {
      token: ctx.seller2,
      body: product({ name: 'Булочка', price: 30, stock: 0, category_id: ctx.category2Id }),
    });
    ctx.bunId = bun.data.product.id;
  });

  test('пошук не залежить від регістру', async () => {
    const r = await api('GET', `/products?search=${encodeURIComponent('ХЛІБ')}`);
    assert.deepEqual(r.data.products.map((p) => p.name), ['Хліб житній']);
  });

  test('фільтри за категорією, продавцем, ціною та наявністю', async () => {
    assert.equal((await api('GET', '/products?category=khlib')).data.total, 2);
    assert.equal((await api('GET', `/products?seller=${ctx.seller1Id}`)).data.total, 1);
    assert.equal((await api('GET', '/products?min_price=50&max_price=70')).data.total, 1);
    assert.equal((await api('GET', '/products?category=khlib&in_stock=true')).data.total, 1);
  });

  test('сортування за ціною та посторінковий вивід', async () => {
    const asc = await api('GET', '/products?sort=price_asc');
    assert.deepEqual(asc.data.products.map((p) => p.price), [30, 60, 100]);
    const page2 = await api('GET', '/products?sort=price_asc&limit=2&page=2');
    assert.equal(page2.data.pages, 2);
    assert.deepEqual(page2.data.products.map((p) => p.price), [100]);
  });

  test('категорії повертаються з кількістю товарів', async () => {
    const { categories } = (await api('GET', '/categories')).data;
    assert.equal(categories.find((c) => c.slug === 'khlib').products_count, 2);
    assert.equal(categories.find((c) => c.slug === 'med').products_count, 1);
  });
});

describe('Кошик', () => {
  test('додавання сумує кількість і рахує суму', async () => {
    await api('POST', '/cart', { token: ctx.buyer1, body: { product_id: ctx.honeyId, quantity: 2 } });
    const r = await api('POST', '/cart', { token: ctx.buyer1, body: { product_id: ctx.honeyId, quantity: 1 } });
    assert.equal(r.status, 201);
    assert.equal(r.data.items[0].quantity, 3);
    assert.equal(r.data.total, 300);
  });

  test('не можна покласти більше, ніж є на складі', async () => {
    const add = await api('POST', '/cart', { token: ctx.buyer1, body: { product_id: ctx.honeyId, quantity: 8 } });
    assert.equal(add.status, 409);
    const put = await api('PUT', `/cart/${ctx.honeyId}`, { token: ctx.buyer1, body: { quantity: 11 } });
    assert.equal(put.status, 409);
    const sold = await api('POST', '/cart', { token: ctx.buyer1, body: { product_id: ctx.bunId, quantity: 1 } });
    assert.equal(sold.status, 409);
  });

  test('зміна кількості та видалення позиції', async () => {
    const put = await api('PUT', `/cart/${ctx.honeyId}`, { token: ctx.buyer1, body: { quantity: 2 } });
    assert.equal(put.data.total, 200);
    await api('POST', '/cart', { token: ctx.buyer1, body: { product_id: ctx.breadId, quantity: 1 } });
    const del = await api('DELETE', `/cart/${ctx.breadId}`, { token: ctx.buyer1 });
    assert.equal(del.data.items.length, 1);
  });

  test('кошики різних покупців незалежні', async () => {
    assert.equal((await api('GET', '/cart', { token: ctx.buyer2 })).data.items.length, 0);
  });
});

describe('Замовлення', () => {
  const address = { delivery_address: 'м. Київ, вул. Тестова, 1', phone: '+380 93 000 00 00' };

  test('порожній кошик не оформлюється', async () => {
    const r = await api('POST', '/orders', { token: ctx.buyer2, body: address });
    assert.equal(r.status, 400);
  });

  test('кошик ділиться на замовлення по продавцях, склад зменшується, кошик очищується', async () => {
    await api('POST', '/cart', { token: ctx.buyer1, body: { product_id: ctx.breadId, quantity: 1 } });
    const r = await api('POST', '/orders', { token: ctx.buyer1, body: address });
    assert.equal(r.status, 201);
    assert.equal(r.data.orders.length, 2);
    const totals = r.data.orders.map((o) => o.total).sort((a, b) => a - b);
    assert.deepEqual(totals, [60, 200]);
    assert.ok(r.data.orders.every((o) => o.status === 'new'));
    ctx.honeyOrder = r.data.orders.find((o) => o.seller_id === ctx.seller1Id).id;
    ctx.breadOrder = r.data.orders.find((o) => o.seller_id === ctx.seller2Id).id;

    assert.equal((await api('GET', `/products/${ctx.honeyId}`)).data.product.stock, 8);
    assert.equal((await api('GET', `/products/${ctx.breadId}`)).data.product.stock, 4);
    assert.equal((await api('GET', '/cart', { token: ctx.buyer1 })).data.items.length, 0);
  });

  test('останню одиницю товару не можуть купити двоє одночасно', async () => {
    const last = await api('POST', '/seller/products', {
      token: ctx.seller1,
      body: product({ name: 'Остання банка', stock: 1 }),
    });
    const id = last.data.product.id;
    for (const token of [ctx.buyer1, ctx.buyer2]) {
      await api('POST', '/cart', { token, body: { product_id: id, quantity: 1 } });
    }
    const results = await Promise.all(
      [ctx.buyer1, ctx.buyer2].map((token) => api('POST', '/orders', { token, body: address })),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await api('GET', `/products/${id}`)).data.product.stock, 0);
    const winner = results.find((r) => r.status === 201).data.orders[0];
    // прибираємо за собою: скасовуємо від імені продавця
    await api('PATCH', `/seller/orders/${winner.id}/status`, { token: ctx.seller1, body: { status: 'cancelled' } });
    await api('DELETE', '/cart', { token: ctx.buyer1 });
    await api('DELETE', '/cart', { token: ctx.buyer2 });
  });

  test('покупець бачить лише свої замовлення', async () => {
    assert.equal((await api('GET', `/orders/${ctx.honeyOrder}`, { token: ctx.buyer1 })).status, 200);
    assert.equal((await api('GET', `/orders/${ctx.honeyOrder}`, { token: ctx.buyer2 })).status, 404);
  });

  test('продавець бачить лише замовлення свого магазину', async () => {
    const mine = (await api('GET', '/seller/orders', { token: ctx.seller2 })).data.orders;
    assert.deepEqual(mine.map((o) => o.id), [ctx.breadOrder]);
    const foreign = await api('PATCH', `/seller/orders/${ctx.honeyOrder}/status`, {
      token: ctx.seller2,
      body: { status: 'confirmed' },
    });
    assert.equal(foreign.status, 404);
  });

  test('статуси змінюються лише за дозволеним ланцюжком', async () => {
    const set = (status) =>
      api('PATCH', `/seller/orders/${ctx.honeyOrder}/status`, { token: ctx.seller1, body: { status } });
    assert.equal((await set('delivered')).status, 409); // new → delivered заборонено
    assert.equal((await set('confirmed')).status, 200);
    assert.equal((await set('new')).status, 409);
    assert.equal((await set('shipped')).status, 200);
    assert.equal((await set('cancelled')).status, 409); // відправлене не скасовується
    assert.equal((await set('delivered')).data.order.status, 'delivered');
    assert.equal((await set('cancelled')).status, 409);
  });

  test('покупець скасовує лише нове замовлення, товар повертається на склад', async () => {
    const tooLate = await api('POST', `/orders/${ctx.honeyOrder}/cancel`, { token: ctx.buyer1 });
    assert.equal(tooLate.status, 403);

    const ok = await api('POST', `/orders/${ctx.breadOrder}/cancel`, { token: ctx.buyer1 });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.order.status, 'cancelled');
    assert.equal((await api('GET', `/products/${ctx.breadId}`)).data.product.stock, 5);

    const again = await api('POST', `/orders/${ctx.breadOrder}/cancel`, { token: ctx.buyer1 });
    assert.equal(again.status, 403);
    assert.equal((await api('GET', `/products/${ctx.breadId}`)).data.product.stock, 5);
  });

  test('історія замовлення не змінюється після редагування товару', async () => {
    await api('PUT', `/seller/products/${ctx.honeyId}`, {
      token: ctx.seller1,
      body: product({ name: 'Мед перейменований', price: 999, stock: 8 }),
    });
    const { order } = (await api('GET', `/orders/${ctx.honeyOrder}`, { token: ctx.buyer1 })).data;
    assert.equal(order.items[0].name, 'Мед тестовий');
    assert.equal(order.items[0].price, 100);
    assert.equal(order.total, 200);
  });

  test('зведення продавця рахує виручку лише з доставлених замовлень', async () => {
    const { stats } = (await api('GET', '/seller/stats', { token: ctx.seller1 })).data;
    assert.equal(stats.revenue, 200);
    const s2 = (await api('GET', '/seller/stats', { token: ctx.seller2 })).data.stats;
    assert.equal(s2.revenue, 0);
  });
});

describe('Відгуки', () => {
  test('відгук дозволено лише після доставки товару', async () => {
    const notBought = await api('POST', `/products/${ctx.breadId}/reviews`, { token: ctx.buyer1, body: { rating: 5 } });
    assert.equal(notBought.status, 403); // замовлення з хлібом скасовано
    const stranger = await api('POST', `/products/${ctx.honeyId}/reviews`, { token: ctx.buyer2, body: { rating: 1 } });
    assert.equal(stranger.status, 403);
  });

  test('відгук впливає на рейтинг, повторний відхиляється', async () => {
    const bad = await api('POST', `/products/${ctx.honeyId}/reviews`, { token: ctx.buyer1, body: { rating: 6 } });
    assert.equal(bad.status, 400);
    const ok = await api('POST', `/products/${ctx.honeyId}/reviews`, {
      token: ctx.buyer1,
      body: { rating: 4, comment: 'Смачно' },
    });
    assert.equal(ok.status, 201);
    const dup = await api('POST', `/products/${ctx.honeyId}/reviews`, { token: ctx.buyer1, body: { rating: 5 } });
    assert.equal(dup.status, 409);

    const { product: p, reviews } = (await api('GET', `/products/${ctx.honeyId}`)).data;
    assert.equal(p.rating, 4);
    assert.equal(p.reviews_count, 1);
    assert.equal(reviews[0].comment, 'Смачно');
  });
});

describe('Адміністрування', () => {
  test('категорію з товарами видалити не можна, порожню — можна', async () => {
    const busy = await api('DELETE', `/admin/categories/${ctx.categoryId}`, { token: ctx.admin });
    assert.equal(busy.status, 409);
    const created = await api('POST', '/admin/categories', {
      token: ctx.admin,
      body: { name: 'Риба', slug: 'ryba', icon: '🐟' },
    });
    assert.equal(created.status, 201);
    const dup = await api('POST', '/admin/categories', { token: ctx.admin, body: { name: 'Риба', slug: 'ryba2' } });
    assert.equal(dup.status, 409);
    const badSlug = await api('POST', '/admin/categories', { token: ctx.admin, body: { name: 'Гриби', slug: 'гриби' } });
    assert.equal(badSlug.status, 400);
    const del = await api('DELETE', `/admin/categories/${created.data.category.id}`, { token: ctx.admin });
    assert.equal(del.status, 204);
  });

  test('відхилення продавця прибирає його товари з каталогу', async () => {
    const before = (await api('GET', '/products')).data.total;
    await api('PATCH', `/admin/sellers/${ctx.seller2Id}`, { token: ctx.admin, body: { status: 'rejected' } });
    const afterReject = (await api('GET', '/products')).data.total;
    assert.equal(afterReject, before - 2);
    await api('PATCH', `/admin/sellers/${ctx.seller2Id}`, { token: ctx.admin, body: { status: 'approved' } });
  });

  test('заблокований користувач одразу втрачає доступ і не може увійти', async () => {
    const users = (await api('GET', '/admin/users', { token: ctx.admin })).data.users;
    const victim = users.find((u) => u.email === 'buyer2@test.ua');
    const blocked = await api('PATCH', `/admin/users/${victim.id}`, { token: ctx.admin, body: { is_blocked: true } });
    assert.equal(blocked.status, 200);

    assert.equal((await api('GET', '/auth/me', { token: ctx.buyer2 })).status, 403);
    const login = await api('POST', '/auth/login', { body: { email: 'buyer2@test.ua', password: 'secret123' } });
    assert.equal(login.status, 403);

    await api('PATCH', `/admin/users/${victim.id}`, { token: ctx.admin, body: { is_blocked: false } });
    assert.equal((await api('GET', '/auth/me', { token: ctx.buyer2 })).status, 200);
  });

  test('адміністратор не може заблокувати сам себе', async () => {
    const me = (await api('GET', '/auth/me', { token: ctx.admin })).data.user;
    const r = await api('PATCH', `/admin/users/${me.id}`, { token: ctx.admin, body: { is_blocked: true } });
    assert.equal(r.status, 400);
  });

  test('зведення по майданчику', async () => {
    const { stats, orders_by_status } = (await api('GET', '/admin/stats', { token: ctx.admin })).data;
    assert.equal(stats.buyers, 2);
    assert.equal(stats.sellers, 2);
    assert.equal(stats.turnover, 200);
    assert.equal(orders_by_status.find((s) => s.status === 'delivered').count, 1);
  });
});

describe('Обробка помилок', () => {
  test('невідомий маршрут і зіпсований JSON дають зрозумілу відповідь', async () => {
    assert.equal((await api('GET', '/nope')).status, 404);
    const res = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{broken',
    });
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error);
  });
});
