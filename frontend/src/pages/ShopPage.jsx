import { Link, useParams } from 'react-router-dom';
import { api, formatDate } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { Empty, ErrorBox, Spinner } from '../components/ui.jsx';
import { useLoad } from '../context.jsx';

export default function ShopPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useLoad(
    () => Promise.all([api(`/sellers/${id}`), api(`/products?seller=${id}&limit=48`)]),
    [id],
  );
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const [{ seller }, { products }] = data;

  return (
    <>
      <nav className="crumbs"><Link to="/">Каталог</Link> / <span>{seller.shop_name}</span></nav>
      <section className="card shop-head">
        <span className="seller-avatar big">🏡</span>
        <div>
          <h1>{seller.shop_name}</h1>
          <p className="muted">
            {seller.city && `${seller.city} · `}на майданчику з {formatDate(seller.created_at)} · товарів: {seller.products_count}
          </p>
          <p>{seller.description}</p>
        </div>
      </section>
      {products.length === 0 ? (
        <Empty title="У магазині поки немає товарів" />
      ) : (
        <div className="grid grid-wide">
          {products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </>
  );
}
