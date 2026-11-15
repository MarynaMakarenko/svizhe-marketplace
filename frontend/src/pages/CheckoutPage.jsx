import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, money } from '../api.js';
import { ErrorBox, Field, Spinner } from '../components/ui.jsx';
import { useApp, useLoad } from '../context.jsx';

export default function CheckoutPage() {
  const { user, setCartCount, toast } = useApp();
  const navigate = useNavigate();
  const { data: cart, loading } = useLoad(() => api('/cart'), []);
  const [form, setForm] = useState({ delivery_address: '', phone: user.phone || '', comment: '' });
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  if (loading && !cart) return <Spinner />;
  if (cart && cart.items.length === 0 && !sending) return <Navigate to="/cart" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const { orders } = await api('/orders', { method: 'POST', body: form });
      setCartCount(0);
      toast(orders.length > 1 ? `Оформлено замовлень: ${orders.length}` : 'Замовлення оформлено');
      navigate('/orders');
    } catch (err) {
      setError(err);
      setSending(false);
    }
  };
  const bind = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });

  return (
    <>
      <nav className="crumbs"><Link to="/cart">Кошик</Link> / <span>Оформлення</span></nav>
      <h1>Оформлення замовлення</h1>
      <div className="cart-layout">
        <form className="card form" onSubmit={submit}>
          {error && <ErrorBox error={error} />}
          <Field label="Адреса доставки">
            <input required minLength="5" maxLength="300" placeholder="м. Київ, вул. Володимирська, 60, кв. 12" {...bind('delivery_address')} />
          </Field>
          <Field label="Телефон" hint="Продавець зателефонує, щоб узгодити доставку">
            <input required type="tel" placeholder="+380 93 123 45 67" {...bind('phone')} />
          </Field>
          <Field label="Коментар до замовлення (необов'язково)">
            <textarea rows="3" maxLength="1000" placeholder="Наприклад: зателефонуйте за годину до доставки" {...bind('comment')} />
          </Field>
          <div className="pay-note">💵 Оплата при отриманні — готівкою або карткою кур'єру.</div>
          <button className="btn btn-big" disabled={sending}>
            {sending ? 'Оформлюємо…' : `Підтвердити замовлення · ${money(cart.total)}`}
          </button>
        </form>

        <aside className="card summary">
          <h3>Ваше замовлення</h3>
          {cart.items.map((i) => (
            <div key={i.product_id} className="summary-row">
              <span>{i.name} × {i.quantity}</span>
              <span>{money(i.price * i.quantity)}</span>
            </div>
          ))}
          <div className="summary-row total"><span>До сплати</span><span>{money(cart.total)}</span></div>
        </aside>
      </div>
    </>
  );
}
