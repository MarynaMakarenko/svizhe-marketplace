import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import { useApp } from './context.jsx';
import AdminPage from './pages/AdminPage.jsx';
import CartPage from './pages/CartPage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import ProductPage from './pages/ProductPage.jsx';
import SellerPage from './pages/SellerPage.jsx';
import ShopPage from './pages/ShopPage.jsx';

// Сторінка лише для певної ролі: гостя веде на вхід, іншу роль — на головну.
function Only({ role, children }) {
  const { user } = useApp();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { ready } = useApp();
  if (!ready) return <Spinner full />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CatalogPage />} />
        <Route path="product/:id" element={<ProductPage />} />
        <Route path="shop/:id" element={<ShopPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="cart" element={<Only role="buyer"><CartPage /></Only>} />
        <Route path="checkout" element={<Only role="buyer"><CheckoutPage /></Only>} />
        <Route path="orders" element={<Only role="buyer"><OrdersPage /></Only>} />
        <Route path="seller/:tab?" element={<Only role="seller"><SellerPage /></Only>} />
        <Route path="admin/:tab?" element={<Only role="admin"><AdminPage /></Only>} />
        <Route path="*" element={
          <div className="empty">
            <div className="empty-icon">🧭</div>
            <h2>Такої сторінки немає</h2>
            <p>Можливо, адресу введено з помилкою.</p>
            <a className="btn" href="/">До каталогу</a>
          </div>
        } />
      </Route>
    </Routes>
  );
}
