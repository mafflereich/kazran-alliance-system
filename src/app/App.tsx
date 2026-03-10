import { HashRouter, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import AppRoutes from './routes';
import { ThemeProvider } from '@app/providers/ThemeContext';
import { AppProvider } from '@/store';
import Header from '@shared/ui/Header';
import Footer from '@shared/ui/Footer';
import Toaster from '@shared/ui/Toast';
import BgmPlayer from '@shared/ui/BgmPlayer';
import { logPageView } from '@/analytics';

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
    </div>
  );
}

export default App;