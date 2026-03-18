import { HashRouter, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import AppRoutes from './routes';
import { ThemeProvider } from '@app/providers/ThemeContext';
import { AppProvider, useAppContext } from '@/store';
import Header from '@shared/ui/Header';
import Footer from '@shared/ui/Footer';
import Toaster from '@shared/ui/Toast';
import BgmPlayer from '@shared/ui/BgmPlayer';
import { logPageView } from '@/analytics';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { VersionUpdateToast } from '@/components/VersionUpdateToast';
import { supabase } from '@/shared/api/supabase';

function App() {
  const { loadDiscordRoles } = useAppContext();
  useEffect(() => {
    const checkAuth = async () => {
      // 1. 強制等待一下下，讓 Supabase 有時間處理網址
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // 2. 只有確定有 session，才去呼叫 Edge Function
        console.log("Token 確認有效，開始呼叫 Function");
        loadDiscordRoles();
      } else if (window.location.hash.includes('access_token')) {
        // 3. 如果網址有 token 但 session 還是空的，代表還在解析中
        console.log("Token 正在解析中，請稍候...");
      }
    };

    checkAuth();
  }, []);

  return (
    <AppProvider>
      <ThemeProvider>
        <HashRouter>
          <AppContent />
        </HashRouter>
      </ThemeProvider>
    </AppProvider>
  );
}

function AppContent() {
  const location = useLocation();
  const { hasNewVersion, reloadPage } = useVersionCheck(5); // 檢查間隔：5分鐘

  useEffect(() => {
    logPageView(location.pathname + location.search);
  }, [location]);

  return (
    <div className="flex min-h-screen flex-col bg-stone-100 dark:bg-zinc-950 text-stone-800 dark:text-white">
      <BgmPlayer />
      <Header />
      <main className="flex-1">
        <AppRoutes />
      </main>
      <Footer />
      <Toaster />
      <VersionUpdateToast hasNewVersion={hasNewVersion} onReload={reloadPage} />
    </div>
  );
}

export default App;