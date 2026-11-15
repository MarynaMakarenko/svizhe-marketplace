import { badRequest } from './errors.js';

// Невеликі перевірки вхідних даних. Кожна повертає очищене значення
// або кидає помилку 400 з поясненням для користувача.

export function str(value, field, { min = 1, max = 255, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`Поле «${field}» обов'язкове`);
    return '';
  }
  if (typeof value !== 'string') throw badRequest(`Поле «${field}» має бути рядком`);
  const v = value.trim();
  if (v.length < min) throw badRequest(`Поле «${field}» закоротке (мінімум ${min})`);
  if (v.length > max) throw badRequest(`Поле «${field}» задовге (максимум ${max})`);
  return v;
}

export function email(value) {
  const v = str(value, 'Email', { max: 255 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw badRequest('Некоректний email');
  return v;
}

export function int(value, field, { min = 0, max = 1_000_000, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`Поле «${field}» обов'язкове`);
    return undefined;
  }
  const v = Number(value);
  if (!Number.isInteger(v)) throw badRequest(`Поле «${field}» має бути цілим числом`);
  if (v < min || v > max) throw badRequest(`Поле «${field}» має бути від ${min} до ${max}`);
  return v;
}

export function price(value, field = 'Ціна') {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0 || v > 1_000_000) {
    throw badRequest(`Поле «${field}» має бути додатним числом`);
  }
  return Math.round(v * 100) / 100;
}

export function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw badRequest(`Поле «${field}» має бути одним із: ${allowed.join(', ')}`);
  }
  return value;
}

export function phone(value, { required = true } = {}) {
  const v = str(value, 'Телефон', { max: 30, required });
  if (v && !/^\+?[\d\s()-]{7,20}$/.test(v)) throw badRequest('Некоректний номер телефону');
  return v;
}
