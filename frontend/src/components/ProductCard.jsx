import { Link } from 'react-router-dom';
import { money } from '../api.js';
import { ProductImage, Stars } from './ui.jsx';
import { useAddToCart } from './useAddToCart.js';

export default function ProductCard({ product: p }) {
  const { add, busy, canBuy } = useAddToCart();
  const soldOut = p.stock === 0;

  return (
    <article className={soldOut ? 'card product-card sold-out' : 'card product-card'}>
      <Link to={`/product/${p.id}`} className="product-card-media">
        <ProductImage src={p.image_url} alt={p.name} />
        {soldOut && <span className="ribbon">Немає в наявності</span>}
      </Link>
      <div className="product-card-body">
        <Link to={`/shop/${p.seller_id}`} className="shop-link">{p.shop_name}</Link>
        <Link to={`/product/${p.id}`} className="product-name">{p.name}</Link>
        <Stars value={p.rating} count={p.reviews_count} />
        <div className="product-card-foot">
          <div className="price">
            {money(p.price)} <span className="unit">/ {p.unit}</span>
          </div>
          {canBuy && (
            <button
              className="btn btn-small"
              disabled={soldOut || busy}
              onClick={() => add(p.id, 1, p.name)}
              aria-label={`Додати «${p.name}» в кошик`}
            >
              У кошик
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
