import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 語系檔（public/locales/**）檔名固定，瀏覽器與 CDN 會快取舊版本，
// 造成部署後「新增的 i18n key 仍顯示原始 key」。用 build 時間當版本參數，
// 讓 i18next 每次都抓到最新翻譯檔。
const LOCALE_VERSION = Date.now().toString();

export default defineConfig({
  base: './',
  define: {
    __LOCALE_VERSION__: JSON.stringify(LOCALE_VERSION),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@app': path.resolve(__dirname, './src/app'),
      '@features': path.resolve(__dirname, './src/features'),
      '@entities': path.resolve(__dirname, './src/entities'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', '@supabase/supabase-js', 'i18next'],
        },
      },
    },
  },
});
