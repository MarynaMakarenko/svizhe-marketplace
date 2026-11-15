import { formatDate, money } from '../api.js';
import { StatusBadge } from './ui.jsx';

// Картка замовлення: спільна для покупця («Мої замовлення») і продавця.
export default function OrderCard({ order: o, side, children }) {
  return (
    <article className="card order">
      <header className="order-head">
        <div>
          <strong>Замовлення №{o.id}</strong>
          <span className="muted"> · {formatDate(o.created_at)}</span>
        </div>
        <StatusBadge status={o.status} />
      </header>
      <p className="muted">
        {side === 'buyer' ? <>Продавець: {o.shop_name}</> : <>Покупець: {o.buyer_name} · {o.phone}</>}
      </p>
      <ul className="order-items">
        {o.items.map((i, n) => (
          <li key={n}>
            <span>{i.name} <span className="muted">× {i.quantity} {i.unit}</span></span>
            <span>{money(i.price * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">📍 {o.delivery_address}{o.comment && <><br />💬 {o.comment}</>}</p>
      <footer className="order-foot">
        <span className="order-total">{money(o.total)}</span>
        <div className="order-actions">{children}</div>
      </footer>
    </article>
  );
}
