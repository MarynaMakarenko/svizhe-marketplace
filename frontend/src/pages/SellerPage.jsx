import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, money } from '../api.js';
import OrderCard from '../components/OrderCard.jsx';
import { Empty, ErrorBox, Field, Modal, ProductImage, Spinner, Tabs } from '../components/ui.jsx';
import { useApp, useLoad } from '../context.jsx';

// Наступний крок для замовлення з погляду продавця.
const NEXT_STEP = {
  new: { status: 'confirmed', label: 'Підтвердити' },
  confirmed: { status: 'shipped', label: 'Відправлено' },
  shipped: { status: 'delivered', label: 'Доставлено' },
};

const SHOP_STATUS = {
  pending: { tone: 'alert-warn', text: 'Магазин очікує на перевірку адміністратором. Ви вже можете додавати товари — вони з\'являться в каталозі після схвалення.' },
  rejected: { tone: 'alert-error', text: 'Адміністратор відхилив заявку магазину. Товари не показуються в каталозі.' },
};

export default function SellerPage() {
  const { tab = 'orders' } = useParams();
  const navigate = useNavigate();
  const { user } = useApp();
  const stats = useLoad(() => api('/seller/stats'), [tab]);
  const s = stats.data?.stats;
  const notice = SHOP_STATUS[user.seller?.status];

  return (
    <>
      <h1>{user.seller?.shop_name}</h1>
      {notice && <div className={`alert ${notice.tone}`}>{notice.text}</div>}
      {s && (
        <div className="stats">
          <div className="card stat"><span className="stat-value">{s.new_orders}</span><span className="stat-label">Нових замовлень</span></div>
          <div className="card stat"><span className="stat-value">{s.orders}</span><span className="stat-label">Усього замовлень</span></div>
          <div className="card stat"><span className="stat-value">{s.products}</span><span className="stat-label">Товарів{s.out_of_stock > 0 && ` (${s.out_of_stock} закінчились)`}</span></div>
          <div className="card stat"><span className="stat-value">{money(s.revenue)}</span><span className="stat-label">Виручка з доставлених</span></div>
        </div>
      )}
      <Tabs
        active={tab}
        onChange={(id) => navigate(`/seller/${id}`)}
        tabs={[
          { id: 'orders', label: 'Замовлення', count: s?.new_orders },
          { id: 'products', label: 'Товари' },
          { id: 'profile', label: 'Профіль магазину' },
        ]}
      />
      {tab === 'orders' && <SellerOrders onChange={stats.reload} />}
      {tab === 'products' && <SellerProducts onChange={stats.reload} />}
      {tab === 'profile' && <SellerProfile />}
    </>
  );
}

function SellerOrders({ onChange }) {
  const { toast } = useApp();
  const [filter, setFilter] = useState('');
  const { data, error, loading, reload } = useLoad(
    () => api(`/seller/orders${filter ? `?status=${filter}` : ''}`),
    [filter],
  );

  const setStatus = async (id, status) => {
    if (status === 'cancelled' && !window.confirm(`Скасувати замовлення №${id}? Товари повернуться на склад.`)) return;
    try {
      await api(`/seller/orders/${id}/status`, { method: 'PATCH', body: { status } });
      toast('Статус оновлено');
      reload();
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Фільтр за статусом">
          <option value="">Усі статуси</option>
          <option value="new">Нові</option>
          <option value="confirmed">Підтверджені</option>
          <option value="shipped">Відправлені</option>
          <option value="delivered">Доставлені</option>
          <option value="cancelled">Скасовані</option>
        </select>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data?.orders.length === 0 && <Empty icon="📭" title="Замовлень немає" />}
      <div className="orders">
        {data?.orders.map((o) => (
          <OrderCard key={o.id} order={o} side="seller">
            {['new', 'confirmed'].includes(o.status) && (
              <button className="btn btn-small btn-ghost" onClick={() => setStatus(o.id, 'cancelled')}>Скасувати</button>
            )}
            {NEXT_STEP[o.status] && (
              <button className="btn btn-small" onClick={() => setStatus(o.id, NEXT_STEP[o.status].status)}>
                {NEXT_STEP[o.status].label}
              </button>
            )}
          </OrderCard>
        ))}
      </div>
    </>
  );
}

const EMPTY_PRODUCT = { name: '', description: '', price: '', unit: 'шт', stock: '', category_id: '', image_url: '', is_active: true };

function SellerProducts({ onChange }) {
  const { toast } = useApp();
  const { data, error, loading, reload } = useLoad(() => api('/seller/products'), []);
  const categories = useLoad(() => api('/categories'), []);
  const [editing, setEditing] = useState(null);

  const remove = async (p) => {
    if (!window.confirm(`Видалити товар «${p.name}»?`)) return;
    try {
      await api(`/seller/products/${p.id}`, { method: 'DELETE' });
      toast('Товар видалено');
      reload();
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <div className="toolbar">
        <button className="btn" onClick={() => setEditing(EMPTY_PRODUCT)}>+ Додати товар</button>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data?.products.length === 0 && (
        <Empty icon="🥕" title="Товарів ще немає"><p>Додайте перший товар, щоб покупці могли його замовити.</p></Empty>
      )}
      {data?.products.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th></th><th>Назва</th><th>Категорія</th><th className="num">Ціна</th><th className="num">Залишок</th><th>Стан</th><th></th></tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.id}>
                  <td className="thumb-cell"><ProductImage src={p.image_url} alt="" /></td>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.category_name}</td>
                  <td className="num">{money(p.price)} <span className="muted">/ {p.unit}</span></td>
                  <td className={p.stock === 0 ? 'num warn' : 'num'}>{p.stock}</td>
                  <td>{p.is_active ? <span className="badge badge-green">У продажу</span> : <span className="badge badge-gray">Приховано</span>}</td>
                  <td className="actions">
                    <button className="btn btn-small btn-ghost" onClick={() => setEditing(p)}>Змінити</button>
                    <button className="btn btn-small btn-danger" onClick={() => remove(p)}>Видалити</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ProductForm
          initial={editing}
          categories={categories.data?.categories || []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
            onChange();
          }}
        />
      )}
    </>
  );
}

function ProductForm({ initial, categories, onClose, onSaved }) {
  const { toast } = useApp();
  const [form, setForm] = useState({ ...initial, image_url: initial.image_url || '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const bind = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });

  const uploadImage = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    setBusy(true);
    try {
      const { url } = await api('/seller/upload', { method: 'POST', formData });
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { ...form, price: Number(form.price), stock: Number(form.stock), category_id: Number(form.category_id) };
    try {
      if (initial.id) await api(`/seller/products/${initial.id}`, { method: 'PUT', body });
      else await api('/seller/products', { method: 'POST', body });
      toast(initial.id ? 'Зміни збережено' : 'Товар додано');
      onSaved();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal title={initial.id ? 'Редагування товару' : 'Новий товар'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {error && <ErrorBox error={error} />}
        <div className="image-picker">
          <div className="image-preview"><ProductImage src={form.image_url} alt="Фото товару" /></div>
          <div>
            <label className="btn btn-small btn-ghost">
              {form.image_url ? 'Замінити фото' : 'Завантажити фото'}
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => uploadImage(e.target.files[0])} />
            </label>
            <p className="muted small">JPG, PNG або WebP до 3 МБ</p>
          </div>
        </div>
        <Field label="Назва"><input required minLength="2" maxLength="160" {...bind('name')} /></Field>
        <Field label="Категорія">
          <select required {...bind('category_id')}>
            <option value="" disabled>Оберіть категорію</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </Field>
        <div className="form-row">
          <Field label="Ціна, ₴"><input required type="number" min="0.01" step="0.01" {...bind('price')} /></Field>
          <Field label="Одиниця"><input required maxLength="20" placeholder="кг, шт, банка 0,5 л" {...bind('unit')} /></Field>
          <Field label="Залишок"><input required type="number" min="0" step="1" {...bind('stock')} /></Field>
        </div>
        <Field label="Опис"><textarea rows="4" maxLength="4000" {...bind('description')} /></Field>
        <label className="check">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Показувати в каталозі
        </label>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Скасувати</button>
          <button className="btn" disabled={busy}>{busy ? 'Зберігаємо…' : 'Зберегти'}</button>
        </div>
      </form>
    </Modal>
  );
}

function SellerProfile() {
  const { user, setUser, toast } = useApp();
  const { data, error, loading, reload } = useLoad(() => api('/seller/profile'), []);
  const [form, setForm] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const current = form || data?.seller;

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const bind = (key) => ({ value: current[key], onChange: (e) => setForm({ ...current, [key]: e.target.value }) });

  const submit = async (e) => {
    e.preventDefault();
    setSaveError(null);
    try {
      const { seller } = await api('/seller/profile', { method: 'PATCH', body: current });
      setUser({ ...user, seller: { ...user.seller, shop_name: seller.shop_name } });
      toast('Профіль збережено');
    } catch (err) {
      setSaveError(err);
    }
  };

  return (
    <form className="card form narrow" onSubmit={submit}>
      {saveError && <ErrorBox error={saveError} />}
      <Field label="Назва магазину"><input required minLength="2" maxLength="120" {...bind('shop_name')} /></Field>
      <Field label="Місто"><input maxLength="80" {...bind('city')} /></Field>
      <Field label="Про магазин" hint="Цей текст бачать покупці на сторінці магазину">
        <textarea rows="5" maxLength="2000" {...bind('description')} />
      </Field>
      <button className="btn">Зберегти</button>
    </form>
  );
}
