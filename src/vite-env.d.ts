/// <reference types="vite/client" />

/**
 * vite.config.ts 的 `define` 注入值：本次 build 的語系檔版本。
 * 用途：讓 locales 的請求帶上 `?v=<版本>`，避免瀏覽器 / CDN 快取舊翻譯檔。
 */
declare const __LOCALE_VERSION__: string;
