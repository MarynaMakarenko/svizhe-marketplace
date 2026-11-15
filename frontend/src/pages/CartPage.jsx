import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { Empty, ErrorBox, ProductImage, Spinner } from '../components/ui.jsx';
import { useApp, useLoad } from '../context.jsx';

export default function CartPage() {
  const { setCartCount, toast } = useApp();
  const { data, error, loading, reload } = useLoad(() => api('/cart'), []);
  const [cart, setCart] = useState(null);
  const [busy, setBusy] = useState(false);
  const current = cart || data;

  const change = async (request) => {
    setBusy(true);
    try {
      const next = await request();
      setCart(next);
      setCartCount(next.count);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !current) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (current.items.length === 0) {
    return (
      <Empty icon="🛒" title="Кошик порожній">
        <p>Додайте щось смачне з каталогу.</p>
        <Link to="/" className="btn">До каталогу</Link>
      </Empty>
    );
  }

  // Товари групуються за продавцем: кожна група стане окремим замовленням.
  const groups = Object.values(
    current.items.reduce((acc, item) => {
      (acc[item.seller_id] ||= { shop: item.shop_name, id: item.seller_id, items: [] }).items.push(item);
      return acc;
    }, {}),
  );
  const hasProblems = current.items.some((i) => !i.available || i.quantity > i.stock);

  return (
    <>
      <h1>Кошик</h1>
      <div className="cart-layout">
        <div>
          {groups.map((g) => (
            <section key={g.id} className="card cart-group">
              <h3>🏡 <Link to={`/shop/${g.id}`}>{g.shop}</Link></h3>
              {g.items.map((i) => (
                <div key={i.product_id} className="cart-item">
                  <Link to={`/product/${i.product_id}`} className="cart-thumb">
                    <ProductImage src={i.image_url} alt={i.name} />
                  </Link>
                  <div className="cart-item-info">
                    <Link to={`/product/${i.product_id}`} className="product-name">{i.name}</Link>
                    <span className="muted">{money(i.price)} / {i.unit}</span>
                    {!i.available && <span className="warn">Товар більше не продається — приберіть його</span>}
                    {i.available && i.quantity > i.stock && <span className="warn">На складі лише {i.stock}</span>}
                  </div>
                  <div className="qty">
                    <button
                      disabled={busy || i.quantity <= 1}
                      onClick={() => change(() => api(`/cart/${i.product_id}`, { method: 'PUT', body: { quantity: i.quantity - 1 } }))}
                      aria-label="Менше"
                    >−</button>
                    <span>{i.quantity}</span>
                    <button
                      disabled={busy || i.quantity >= i.stock}
                      onClick={() => change(() => api(`/cart/${i.product_id}`, { method: 'PUT', body: { quantity: i.quantity + 1 } }))}
                      aria-label="Більше"
                    >+</button>
                  </div>
                  <div className="cart-item-sum">{money(i.price * i.quantity)}</div>
                  <button
                    className="icon-btn"
                    disabled={busy}
                    onClick={() => change(() => api(`/cart/${i.product_id}`, { method: 'DELETE' }))}
                    aria-label={`Прибрати «${i.name}»`}
                  >✕</button>
                </div>
              ))}
            </section>
          ))}
        </div>

        <aside className="card summary">
          <h3>Разом</h3>
          <div className="summary-row"><span>Товарів</span><span>{current.count}</span></div>
          <div className="summary-row"><span>Продавців</span><span>{groups.length}</span></div>
          <div className="summary-row total"><span>До сплати</span><span>{money(current.total)}</span></div>
          {groups.length > 1 && (
            <p className="muted small">Товари від різних продавців буде оформлено як {groups.length} окремі замовлення.</p>
          )}
          {hasProblems ? (
            <p className="warn">Виправте позначені позиції, щоб продовжити.</p>
          ) : (
            <Link to="/checkout" className="btn btn-big btn-block">Оформити замовлення</Link>
          )}
        </aside>
      </div>
    </>
  );
}
