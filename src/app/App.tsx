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

function App() {
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