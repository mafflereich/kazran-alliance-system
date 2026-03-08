import { HashRouter } from 'react-router-dom';
import AppRoutes from './routes';
import { ThemeProvider } from '@app/providers/ThemeContext';
import { AppProvider } from '@/store';
import Header from '@shared/ui/Header';
import Footer from '@shared/ui/Footer';
import Toaster from '@shared/ui/Toast';
import BgmPlayer from '@shared/ui/BgmPlayer';

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
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
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