import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../context.jsx';

// Додавання в кошик з будь-якої сторінки. Гостя спершу відправляє на вхід.
// Продавцям та адміністратору кнопка не показується (canBuy = false).
export function useAddToCart() {
  const { user, setCartCount, toast } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const add = async (productId, quantity, name) => {
    if (!user) {
      toast('Увійдіть, щоб додати товар у кошик', 'info');
      return navigate('/login', { state: { from: window.location.pathname } });
    }
    setBusy(true);
    try {
      const cart = await api('/cart', { method: 'POST', body: { product_id: productId, quantity } });
      setCartCount(cart.count);
      toast(`«${name}» додано в кошик`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return { add, busy, canBuy: !user || user.role === 'buyer' };
}
