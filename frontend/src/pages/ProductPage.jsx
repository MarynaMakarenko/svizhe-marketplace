import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDate, money } from '../api.js';
import { ErrorBox, Field, ProductImage, Spinner, Stars } from '../components/ui.jsx';
import { useAddToCart } from '../components/useAddToCart.js';
import { useApp, useLoad } from '../context.jsx';

export default function ProductPage() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const { data, error, loading, reload } = useLoad(() => api(`/products/${id}`), [id]);
  const { add, busy, canBuy } = useAddToCart();
  const [quantity, setQuantity] = useState(1);
  const [review, setReview] = useState({ rating: 5, comment: '' });
  const [sending, setSending] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { product: p, reviews } = data;
  const soldOut = p.stock === 0;

  const sendReview = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await api(`/products/${id}/reviews`, { method: 'POST', body: review });
      toast('Дякуємо за відгук!');
      setReview({ rating: 5, comment: '' });
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <nav className="crumbs">
        <Link to="/">Каталог</Link> / <Link to={`/?category=${p.category_slug}`}>{p.category_name}</Link> / <span>{p.name}</span>
      </nav>

      <div className="product-page">
        <div className="card product-page-media">
          <ProductImage src={p.image_url} alt={p.name} />
        </div>
        <div>
          <h1>{p.name}</h1>
          <Stars value={p.rating} count={p.reviews_count} />
          <div className="product-page-price">
            {money(p.price)} <span className="unit">/ {p.unit}</span>
          </div>
          <p className={soldOut ? 'stock stock-out' : 'stock'}>
            {soldOut ? 'Немає в наявності' : `В наявності: ${p.stock}`}
          </p>

          {canBuy && !soldOut && (
            <div className="buy-row">
              <div className="qty">
                <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Менше">−</button>
                <span>{quantity}</span>
                <button onClick={() => setQuantity((q) => Math.min(p.stock, q + 1))} aria-label="Більше">+</button>
              </div>
              <button className="btn btn-big" disabled={busy} onClick={() => add(p.id, quantity, p.name)}>
                Додати в кошик · {money(p.price * quantity)}
              </button>
            </div>
          )}

          <p className="product-description">{p.description}</p>

          <Link to={`/shop/${p.seller_id}`} className="card seller-box">
            <span className="seller-avatar">🏡</span>
            <span>
              <strong>{p.shop_name}</strong>
              <span className="muted"> · {p.seller_city}</span>
              <br />
              <span className="muted">Перейти до магазину →</span>
            </span>
          </Link>
        </div>
      </div>

      <section className="reviews">
        <h2>Відгуки {reviews.length > 0 && <span className="muted">({reviews.length})</span>}</h2>
        {reviews.length === 0 && <p className="muted">Поки що немає відгуків. Будьте першим після отримання замовлення.</p>}
        {reviews.map((r) => (
          <div key={r.id} className="card review">
            <div className="review-head">
              <strong>{r.author}</strong>
              <Stars value={r.rating} />
              <span className="muted">{formatDate(r.created_at)}</span>
            </div>
            {r.comment && <p>{r.comment}</p>}
          </div>
        ))}

        {user?.role === 'buyer' && (
          <form className="card review-form" onSubmit={sendReview}>
            <h3>Залишити відгук</h3>
            <p className="muted">Відгук можна залишити після того, як замовлення з цим товаром доставлено.</p>
            <div className="rating-input" role="radiogroup" aria-label="Оцінка">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  className={n <= review.rating ? 'star on' : 'star'}
                  onClick={() => setReview({ ...review, rating: n })}
                  aria-label={`${n} з 5`}
                >
                  ★
                </button>
              ))}
            </div>
            <Field label="Коментар">
              <textarea
                rows="3"
                maxLength="2000"
                value={review.comment}
                onChange={(e) => setReview({ ...review, comment: e.target.value })}
                placeholder="Що сподобалось, а що ні?"
              />
            </Field>
            <button className="btn" disabled={sending}>Надіслати відгук</button>
          </form>
        )}
      </section>
    </>
  );
}
