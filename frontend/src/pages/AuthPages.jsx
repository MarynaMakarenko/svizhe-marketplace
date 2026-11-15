import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBox, Field } from '../components/ui.jsx';
import { useApp } from '../context.jsx';

const HOME = { buyer: '/', seller: '/seller', admin: '/admin' };

export function LoginPage() {
  const { user, login } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user && !busy) return <Navigate to={HOME[user.role]} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(form.email, form.password);
      navigate(u.role === 'buyer' ? location.state?.from || '/' : HOME[u.role], { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card form" onSubmit={submit}>
        <h1>Вхід</h1>
        {error && <ErrorBox error={error} />}
        <Field label="Email">
          <input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Пароль">
          <input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <button className="btn btn-big" disabled={busy}>{busy ? 'Входимо…' : 'Увійти'}</button>
        <p className="muted center">Ще немає акаунта? <Link to="/register">Зареєструватися</Link></p>
      </form>
    </div>
  );
}

export function RegisterPage() {
  const { user, register } = useApp();
  const navigate = useNavigate();
  const [role, setRole] = useState('buyer');
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', shop_name: '', city: '', description: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user && !busy) return <Navigate to={HOME[user.role]} replace />;

  const bind = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await register({ ...form, role });
      navigate(HOME[u.role], { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card form" onSubmit={submit}>
        <h1>Реєстрація</h1>
        <div className="segmented" role="radiogroup" aria-label="Тип акаунта">
          <button type="button" className={role === 'buyer' ? 'active' : ''} onClick={() => setRole('buyer')}>🛒 Я покупець</button>
          <button type="button" className={role === 'seller' ? 'active' : ''} onClick={() => setRole('seller')}>🏡 Я продавець</button>
        </div>
        {error && <ErrorBox error={error} />}
        <Field label="Ім'я та прізвище"><input required minLength="2" autoComplete="name" {...bind('full_name')} /></Field>
        <Field label="Email"><input type="email" required autoComplete="email" {...bind('email')} /></Field>
        <Field label="Телефон (необов'язково)"><input type="tel" autoComplete="tel" placeholder="+380 93 123 45 67" {...bind('phone')} /></Field>
        <Field label="Пароль" hint="Щонайменше 6 символів">
          <input type="password" required minLength="6" autoComplete="new-password" {...bind('password')} />
        </Field>
        {role === 'seller' && (
          <>
            <hr />
            <Field label="Назва магазину"><input required minLength="2" placeholder="Ферма «Зелений гай»" {...bind('shop_name')} /></Field>
            <Field label="Місто"><input placeholder="Бровари" {...bind('city')} /></Field>
            <Field label="Про магазин"><textarea rows="3" maxLength="2000" placeholder="Що ви виробляєте і чим особливі" {...bind('description')} /></Field>
            <p className="muted small">Після реєстрації магазин перевірить адміністратор. До схвалення товари не показуються в каталозі.</p>
          </>
        )}
        <button className="btn btn-big" disabled={busy}>{busy ? 'Створюємо акаунт…' : 'Зареєструватися'}</button>
        <p className="muted center">Уже маєте акаунт? <Link to="/login">Увійти</Link></p>
      </form>
    </div>
  );
}
