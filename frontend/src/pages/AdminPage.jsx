import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatDate, money, STATUS } from '../api.js';
import { ErrorBox, Field, Modal, Spinner, Tabs } from '../components/ui.jsx';
import { useApp, useLoad } from '../context.jsx';

const SELLER_STATUS = {
  pending: { label: 'Очікує', tone: 'amber' },
  approved: { label: 'Схвалено', tone: 'green' },
  rejected: { label: 'Відхилено', tone: 'gray' },
};
const ROLE = { buyer: 'Покупець', seller: 'Продавець', admin: 'Адміністратор' };

export default function AdminPage() {
  const { tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const stats = useLoad(() => api('/admin/stats'), [tab]);

  return (
    <>
      <h1>Адмін-панель</h1>
      <Tabs
        active={tab}
        onChange={(id) => navigate(id === 'overview' ? '/admin' : `/admin/${id}`)}
        tabs={[
          { id: 'overview', label: 'Огляд' },
          { id: 'sellers', label: 'Продавці', count: stats.data?.stats.pending_sellers },
          { id: 'users', label: 'Користувачі' },
          { id: 'categories', label: 'Категорії' },
        ]}
      />
      {tab === 'overview' && <Overview stats={stats} />}
      {tab === 'sellers' && <Sellers onChange={stats.reload} />}
      {tab === 'users' && <Users />}
      {tab === 'categories' && <Categories />}
    </>
  );
}

function Overview({ stats }) {
  if (stats.loading && !stats.data) return <Spinner />;
  if (stats.error) return <ErrorBox error={stats.error} onRetry={stats.reload} />;
  const { stats: s, orders_by_status } = stats.data;
  const max = Math.max(1, ...orders_by_status.map((o) => o.count));
  return (
    <>
      <div className="stats">
        <div className="card stat"><span className="stat-value">{s.buyers}</span><span className="stat-label">Покупців</span></div>
        <div className="card stat"><span className="stat-value">{s.sellers}</span><span className="stat-label">Активних продавців{s.pending_sellers > 0 && ` (+${s.pending_sellers} очікують)`}</span></div>
        <div className="card stat"><span className="stat-value">{s.products}</span><span className="stat-label">Товарів у продажу</span></div>
        <div className="card stat"><span className="stat-value">{money(s.turnover)}</span><span className="stat-label">Оборот (доставлені)</span></div>
      </div>
      <section className="card pad">
        <h3>Замовлення за статусами — усього {s.orders}</h3>
        <div className="bars">
          {Object.keys(STATUS).map((key) => {
            const count = orders_by_status.find((o) => o.status === key)?.count || 0;
            return (
              <div key={key} className="bar-row">
                <span className="bar-label">{STATUS[key].label}</span>
                <div className="bar-track"><div className={`bar bar-${STATUS[key].tone}`} style={{ width: `${(count / max) * 100}%` }} /></div>
                <span className="bar-value">{count}</span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Sellers({ onChange }) {
  const { toast } = useApp();
  const { data, error, loading, reload } = useLoad(() => api('/admin/sellers'), []);
  const setStatus = async (seller, status) => {
    try {
      await api(`/admin/sellers/${seller.id}`, { method: 'PATCH', body: { status } });
      toast(`«${seller.shop_name}»: ${SELLER_STATUS[status].label.toLowerCase()}`);
      reload();
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead><tr><th>Магазин</th><th>Власник</th><th>Місто</th><th className="num">Товарів</th><th>Статус</th><th></th></tr></thead>
        <tbody>
          {data.sellers.map((s) => (
            <tr key={s.id}>
              <td><strong>{s.shop_name}</strong><br /><span className="muted small">{s.description}</span></td>
              <td>{s.full_name}<br /><span className="muted small">{s.email}</span></td>
              <td>{s.city}</td>
              <td className="num">{s.products_count}</td>
              <td><span className={`badge badge-${SELLER_STATUS[s.status].tone}`}>{SELLER_STATUS[s.status].label}</span></td>
              <td className="actions">
                {s.status !== 'approved' && <button className="btn btn-small" onClick={() => setStatus(s, 'approved')}>Схвалити</button>}
                {s.status !== 'rejected' && <button className="btn btn-small btn-danger" onClick={() => setStatus(s, 'rejected')}>Відхилити</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Users() {
  const { user: me, toast } = useApp();
  const { data, error, loading, reload } = useLoad(() => api('/admin/users'), []);
  const toggle = async (u) => {
    if (!u.is_blocked && !window.confirm(`Заблокувати ${u.email}? Користувач одразу втратить доступ.`)) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { is_blocked: !u.is_blocked } });
      toast(u.is_blocked ? 'Користувача розблоковано' : 'Користувача заблоковано');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead><tr><th>Користувач</th><th>Роль</th><th>Телефон</th><th>Зареєстровано</th><th>Стан</th><th></th></tr></thead>
        <tbody>
          {data.users.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.full_name}</strong><br /><span className="muted small">{u.email}</span></td>
              <td>{ROLE[u.role]}{u.shop_name && <><br /><span className="muted small">{u.shop_name}</span></>}</td>
              <td>{u.phone || '—'}</td>
              <td>{formatDate(u.created_at)}</td>
              <td>{u.is_blocked ? <span className="badge badge-red">Заблоковано</span> : <span className="badge badge-green">Активний</span>}</td>
              <td className="actions">
                {u.id !== me.id && (
                  <button className={u.is_blocked ? 'btn btn-small btn-ghost' : 'btn btn-small btn-danger'} onClick={() => toggle(u)}>
                    {u.is_blocked ? 'Розблокувати' : 'Заблокувати'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Categories() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useLoad(() => api('/categories'), []);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setFormError(null);
    const body = { name: editing.name, slug: editing.slug, icon: editing.icon };
    try {
      if (editing.id) await api(`/admin/categories/${editing.id}`, { method: 'PUT', body });
      else await api('/admin/categories', { method: 'POST', body });
      toast('Категорію збережено');
      setEditing(null);
      reload();
    } catch (err) {
      setFormError(err);
    }
  };
  const remove = async (c) => {
    if (!window.confirm(`Видалити категорію «${c.name}»?`)) return;
    try {
      await api(`/admin/categories/${c.id}`, { method: 'DELETE' });
      toast('Категорію видалено');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const bind = (key) => ({ value: editing[key], onChange: (e) => setEditing({ ...editing, [key]: e.target.value }) });

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <>
      <div className="toolbar">
        <button className="btn" onClick={() => { setFormError(null); setEditing({ name: '', slug: '', icon: '🛒' }); }}>+ Додати категорію</button>
      </div>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Категорія</th><th>Адреса (slug)</th><th className="num">Товарів у каталозі</th><th></th></tr></thead>
          <tbody>
            {data.categories.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.icon} {c.name}</strong></td>
                <td><code>{c.slug}</code></td>
                <td className="num">{c.products_count}</td>
                <td className="actions">
                  <button className="btn btn-small btn-ghost" onClick={() => { setFormError(null); setEditing(c); }}>Змінити</button>
                  <button className="btn btn-small btn-danger" onClick={() => remove(c)}>Видалити</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal title={editing.id ? 'Редагування категорії' : 'Нова категорія'} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={save}>
            {formError && <ErrorBox error={formError} />}
            <Field label="Назва"><input required minLength="2" maxLength="80" {...bind('name')} /></Field>
            <Field label="Адреса (slug)" hint="Латинські літери, цифри та дефіс. Використовується в посиланні: /?category=ryba">
              <input required pattern="[a-z0-9\-]+" maxLength="80" {...bind('slug')} />
            </Field>
            <Field label="Іконка (емодзі)"><input maxLength="16" {...bind('icon')} /></Field>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Скасувати</button>
              <button className="btn">Зберегти</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
