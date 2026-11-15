import { useEffect } from 'react';
import { STATUS } from '../api.js';

export function Spinner({ full }) {
  return (
    <div className={full ? 'spinner-wrap spinner-full' : 'spinner-wrap'}>
      <div className="spinner" aria-label="Завантаження" />
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="alert alert-error">
      <div>
        <strong>{error.message}</strong>
        {error.details?.length > 0 && (
          <ul>{error.details.map((d) => <li key={d}>{d}</li>)}</ul>
        )}
      </div>
      {onRetry && <button className="btn btn-small btn-ghost" onClick={onRetry}>Спробувати ще раз</button>}
    </div>
  );
}

export function Empty({ icon = '🧺', title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function Stars({ value, count }) {
  const rounded = Math.round(value);
  return (
    <span className="stars" title={`Оцінка ${Number(value).toFixed(1)} з 5`}>
      <span aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={i <= rounded ? 'star on' : 'star'}>★</span>
        ))}
      </span>
      {count !== undefined && <span className="stars-count">{count > 0 ? `${Number(value).toFixed(1)} (${count})` : 'немає відгуків'}</span>}
    </span>
  );
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, tone: 'gray' };
  return <span className={`badge badge-${s.tone}`}>{s.label}</span>;
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children }) {
  // Закриття клавішею Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрити">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ProductImage({ src, alt }) {
  return src ? (
    <img className="product-img" src={src} alt={alt} loading="lazy" />
  ) : (
    <div className="product-img product-img-empty" aria-label={alt}>🧺</div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={active === t.id ? 'tab active' : 'tab'}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count > 0 && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
