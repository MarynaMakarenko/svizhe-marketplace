import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApp } from '../context.jsx';

const ROLE_LABEL = { buyer: 'Покупець', seller: 'Продавець', admin: 'Адміністратор' };

export default function Layout() {
  const { user, cartCount, logout } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(search.trim() ? `/?search=${encodeURIComponent(search.trim())}` : '/');
  };

  return (
    <div className="page">
      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="logo" onClick={() => setSearch('')}>
            <img src="/favicon.svg" alt="" width="34" height="34" />
            <span>Свіже</span>
          </Link>

          <form className="search" onSubmit={submitSearch} role="search">
            <input
              type="search"
              placeholder="Пошук: мед, хліб, сир…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Пошук товарів"
            />
            <button type="submit" aria-label="Шукати">🔍</button>
          </form>

          <nav className="nav">
            {!user && (
              <>
                <NavLink to="/login" className="nav-link">Увійти</NavLink>
                <Link to="/register" className="btn btn-small">Реєстрація</Link>
              </>
            )}
            {user?.role === 'buyer' && (
              <>
                <NavLink to="/orders" className="nav-link">Мої замовлення</NavLink>
                <NavLink to="/cart" className="nav-link cart-link">
                  🛒 Кошик{cartCount > 0 && <span className="cart-count">{cartCount}</span>}
                </NavLink>
              </>
            )}
            {user?.role === 'seller' && <NavLink to="/seller" className="nav-link">Кабінет продавця</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin" className="nav-link">Адмін-панель</NavLink>}
            {user && (
              <div className="user-chip">
                <div>
                  <div className="user-name">{user.full_name}</div>
                  <div className="user-role">{ROLE_LABEL[user.role]}</div>
                </div>
                <button
                  className="btn btn-small btn-ghost"
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  Вийти
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="container main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span>© 2026 «Свіже» — маркетплейс локальних виробників</span>
          <span>
            <a href="/api/docs" target="_blank" rel="noreferrer">Документація API</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
