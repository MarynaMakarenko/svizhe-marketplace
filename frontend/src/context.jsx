import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setToken, getToken } from './api.js';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// Спільний стан застосунку: хто увійшов, скільки товарів у кошику, спливаючі повідомлення.
export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const toast = useCallback((text, tone = 'ok') => {
    const id = ++toastId.current;
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3500);
  }, []);

  const refreshCart = useCallback(async (role) => {
    if (role !== 'buyer') return setCartCount(0);
    try {
      setCartCount((await api('/cart')).count);
    } catch {
      setCartCount(0);
    }
  }, []);

  // Під час завантаження сторінки відновлюємо сесію за збереженим токеном.
  useEffect(() => {
    if (!getToken()) return setReady(true);
    api('/auth/me')
      .then(({ user }) => {
        setUser(user);
        return refreshCart(user.role);
      })
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, [refreshCart]);

  const signIn = useCallback(
    async (path, payload) => {
      const { token, user } = await api(path, { method: 'POST', body: payload });
      setToken(token);
      setUser(user);
      await refreshCart(user.role);
      return user;
    },
    [refreshCart],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setCartCount(0);
  }, []);

  const value = useMemo(
    () => ({
      user, ready, cartCount, toast, logout, setCartCount, setUser,
      login: (email, password) => signIn('/auth/login', { email, password }),
      register: (payload) => signIn('/auth/register', payload),
    }),
    [user, ready, cartCount, toast, logout, signIn],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

// Завантаження даних зі станами «завантаження / помилка / готово» та ручним оновленням.
export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
