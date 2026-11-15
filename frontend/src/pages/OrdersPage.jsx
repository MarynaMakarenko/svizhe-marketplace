import { Link } from 'react-router-dom';
import { api } from '../api.js';
import OrderCard from '../components/OrderCard.jsx';
import { Empty, ErrorBox, Spinner } from '../components/ui.jsx';
import { useApp, useLoad } from '../context.jsx';

export default function OrdersPage() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useLoad(() => api('/orders'), []);

  const cancel = async (id) => {
    if (!window.confirm(`Скасувати замовлення №${id}?`)) return;
    try {
      await api(`/orders/${id}/cancel`, { method: 'POST' });
      toast('Замовлення скасовано');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <>
      <h1>Мої замовлення</h1>
      {data.orders.length === 0 ? (
        <Empty icon="📦" title="Замовлень ще немає">
          <Link to="/" className="btn">До каталогу</Link>
        </Empty>
      ) : (
        <div className="orders">
          {data.orders.map((o) => (
            <OrderCard key={o.id} order={o} side="buyer">
              {o.status === 'new' && (
                <button className="btn btn-small btn-ghost" onClick={() => cancel(o.id)}>Скасувати</button>
              )}
              {o.status === 'delivered' && o.items[0]?.product_id && (
                <Link className="btn btn-small btn-ghost" to={`/product/${o.items[0].product_id}`}>Залишити відгук</Link>
              )}
            </OrderCard>
          ))}
        </div>
      )}
    </>
  );
}
