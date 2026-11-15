import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { Empty, ErrorBox, Spinner } from '../components/ui.jsx';
import { useLoad } from '../context.jsx';

const SORTS = [
  ['new', 'Спочатку нові'],
  ['price_asc', 'Спочатку дешевші'],
  ['price_desc', 'Спочатку дорожчі'],
  ['rating', 'За рейтингом'],
];

// Усі фільтри зберігаються в адресі сторінки, тому посиланням
// на знайдене можна поділитися, а кнопка «Назад» працює передбачувано.
export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'new';
  const inStock = params.get('in_stock') === 'true';
  const page = Number(params.get('page') || 1);

  const set = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  const categories = useLoad(() => api('/categories'), []);
  const products = useLoad(() => {
    const q = new URLSearchParams({ sort, page, limit: 12 });
    if (search) q.set('search', search);
    if (category) q.set('category', category);
    if (inStock) q.set('in_stock', 'true');
    return api(`/products?${q}`);
  }, [search, category, sort, inStock, page]);

  const activeCategory = categories.data?.categories.find((c) => c.slug === category);
  const title = search ? `Результати пошуку «${search}»` : activeCategory?.name || 'Усі товари';

  return (
    <>
      {!search && !category && page === 1 && (
        <section className="hero">
          <div>
            <h1>Продукти від тих, хто їх вирощує</h1>
            <p>Овочі з грядки, сир із сироварні, хліб із печі. Замовляйте напряму у фермерів і ремісників без посередників.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <img src="/hero/bread.jpg" alt="" width="150" height="150" />
            <img src="/hero/berries.jpg" alt="" width="150" height="150" />
            <img src="/hero/honey.jpg" alt="" width="150" height="150" />
          </div>
        </section>
      )}

      <div className="catalog">
        <aside className="sidebar">
          <h3>Категорії</h3>
          <ul className="category-list">
            <li>
              <button className={!category ? 'category active' : 'category'} onClick={() => set({ category: '' })}>
                <span>🛍️ Усі товари</span>
              </button>
            </li>
            {categories.data?.categories.map((c) => (
              <li key={c.id}>
                <button
                  className={category === c.slug ? 'category active' : 'category'}
                  onClick={() => set({ category: c.slug })}
                >
                  <span>{c.icon} {c.name}</span>
                  <span className="category-count">{c.products_count}</span>
                </button>
              </li>
            ))}
          </ul>
          <label className="check">
            <input type="checkbox" checked={inStock} onChange={(e) => set({ in_stock: e.target.checked ? 'true' : '' })} />
            Лише в наявності
          </label>
        </aside>

        <section>
          <div className="catalog-head">
            <div>
              <h2>{title}</h2>
              {products.data && <span className="muted">Знайдено: {products.data.total}</span>}
            </div>
            <div className="catalog-controls">
              {(search || category || inStock) && (
                <button className="btn btn-small btn-ghost" onClick={() => setParams({})}>Скинути фільтри</button>
              )}
              <select value={sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Сортування">
                {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>

          {products.loading && !products.data && <Spinner />}
          {products.error && <ErrorBox error={products.error} onRetry={products.reload} />}
          {products.data && products.data.products.length === 0 && (
            <Empty icon="🔎" title="Нічого не знайдено">
              <p>Спробуйте змінити запит або скинути фільтри.</p>
            </Empty>
          )}
          {products.data && (
            <div className={products.loading ? 'grid is-loading' : 'grid'}>
              {products.data.products.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
          {products.data?.pages > 1 && (
            <nav className="pagination" aria-label="Сторінки">
              {Array.from({ length: products.data.pages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  className={n === page ? 'page-btn active' : 'page-btn'}
                  onClick={() => {
                    set({ page: n === 1 ? '' : String(n) });
                    window.scrollTo({ top: 0 });
                  }}
                >
                  {n}
                </button>
              ))}
            </nav>
          )}
        </section>
      </div>
    </>
  );
}
