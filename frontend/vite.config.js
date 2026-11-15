import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Під час розробки запити до API та фото проксуються на локальний сервер,
// тому інтерфейс завжди звертається до відносних адрес /api та /uploads.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});
