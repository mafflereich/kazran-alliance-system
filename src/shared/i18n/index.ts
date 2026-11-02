// src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// 語系檔名固定（locales/<lng>/<ns>.json），瀏覽器與 GitHub Pages CDN 會快取
// 舊版本，導致「部署後新增的 i18n key 仍顯示原始 key」（例：
// equipment.resource_visibility）。這裡帶上版本參數強制取得最新檔：
//   * dev：每次頁面載入都換版本（避免本機熱更新後仍吃到舊翻譯）
//   * build：使用 vite.config.ts 注入的 build 版本（部署後才會變）
// 非 Vite 環境（例如 node 測試）沒有注入值時退回 'dev'。
const LOCALE_VERSION = import.meta.env.DEV
    ? Date.now().toString()
    : (typeof __LOCALE_VERSION__ !== 'undefined' ? __LOCALE_VERSION__ : 'dev');

i18n
    .use(initReactI18next)
    .use(LanguageDetector)
    .use(HttpBackend)
    .init({
        // 移除 lng: 'zh-TW' 以允許 LanguageDetector 從 localStorage 讀取
        fallbackLng: {
            'zh-HK': ['zh-TW'],
            'zh-MO': ['zh-TW'],
            'zh-CN': ['zh-TW'],
            'zh': ['zh-TW'],
            'default': ['zh-TW']
        },
        supportedLngs: ['zh-TW', 'en', 'zh', 'zh-HK', 'zh-MO', 'zh-CN'],   // 需保留 zh 系列變體，fallbackLng 才能正確解析；否則 t() 會回傳原始 key
        nonExplicitSupportedLngs: true, // 允許非精確匹配（如 en-US 匹配 en、zh-HK 匹配 zh）
        // 注意：public/locales/*/ 內沒有 common.json，不可把 'common' 放進 ns
        // （否則每次啟動都會多一個 404，拖慢／偶發影響翻譯載入）。
        // `t('common.xxx')` 走的是 defaultNS(translation) 內的 common 物件。
        ns: ['translation', 'admin', 'arcade', 'mailbox', 'toolbox', 'raid'],
        defaultNS: 'translation',
        fallbackNS: 'translation',
        backend: {
            loadPath: `${import.meta.env.BASE_URL}locales/{{lng}}/{{ns}}.json`,
            // 避免舊翻譯檔被快取：每次 build 都帶新的 v 參數，並要求重新驗證
            queryStringParams: { v: LOCALE_VERSION },
            requestOptions: { cache: 'no-cache' },
        },
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: 'i18nextLng', // 使用標準 key 名稱
            caches: ['localStorage'],
        },
        interpolation: {
            escapeValue: false,
        },
        debug: false,
        react: {
            useSuspense: true,
        },
    });

// 強制修正 zh → zh-TW
i18n.on('languageChanged', (lng) => {
    if (lng.startsWith('zh') && lng !== 'zh-TW') {
        i18n.changeLanguage('zh-TW');
    }
});

export default i18n;