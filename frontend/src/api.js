// Єдина точка звернення до системної частини.
const TOKEN_KEY = 'svizhe_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: formData || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError("Немає зв'язку із сервером. Перевірте з'єднання та спробуйте ще раз.", 0);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Помилка ${res.status}`, res.status, data.details);
  }
  return data;
}

const uah = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' });
export const money = (n) => uah.format(n || 0);

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

export const STATUS = {
  new: { label: 'Нове', tone: 'blue' },
  confirmed: { label: 'Підтверджено', tone: 'amber' },
  shipped: { label: 'Відправлено', tone: 'violet' },
  delivered: { label: 'Доставлено', tone: 'green' },
  cancelled: { label: 'Скасовано', tone: 'gray' },
};
