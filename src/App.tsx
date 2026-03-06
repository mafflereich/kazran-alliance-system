/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ThemeProvider } from './ThemeContext';
import { AppProvider, useAppContext } from './store';
const Login = React.lazy(() => import('./pages/Login'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const GuildDashboard = React.lazy(() => import('./pages/GuildDashboard'));
const ApplicationMailbox = React.lazy(() => import('./pages/ApplicationMailbox'));
const Arcade = React.lazy(() => import('./pages/Arcade'));
const AllianceRaidRecord = React.lazy(() => import('./pages/AllianceRaidRecord'));
import ToastContainer from './components/Toast';
import { initGA, logPageView } from './analytics';

const AppContent = () => {
  const { db, currentView, currentUser, setCurrentView } = useAppContext();

  const userRole = currentUser ? db.users[currentUser]?.role : null;
  const canAccessAdmin = userRole === 'admin' || userRole === 'creator';

  const getDefaultRoles = (pageId: string): ('member' | 'manager' | 'admin' | 'creator')[] => {
    switch (pageId) {
      case 'costume_list': return ['member', 'manager', 'admin', 'creator'];
      case 'application_mailbox': return ['member', 'manager', 'admin', 'creator'];
      case 'arcade': return ['manager', 'admin', 'creator'];
      case 'alliance_raid_record': return ['creator'];
      default: return ['creator', 'admin'];
    }
  };

  const canAccessPage = (pageId: string) => {
    const roles = db.accessControl?.[pageId]?.roles || getDefaultRoles(pageId);
    if (!currentUser) return false;
    return roles.includes(userRole as any);
  };

  const canAccessArcade = canAccessPage('arcade');
  const canAccessMailbox = canAccessPage('application_mailbox');
  const canAccessAllianceRaidRecord = canAccessPage('alliance_raid_record');
  const canAccessCostumeList = canAccessPage('costume_list');

  React.useEffect(() => {
    let path = '/login';
    if (currentUser) {
      if (!currentView) {
        path = '/';
      } else if (currentView.type === 'admin') {
        path = '/admin';
      } else if (currentView.type === 'application_mailbox') {
        path = '/mailbox';
      } else if (currentView.type === 'arcade') {
        path = '/arcade';
      } else if (currentView.type === 'alliance_raid_record') {
        path = '/alliance_raid_record';
      } else if (currentView.type === 'guild') {
        path = `/guild/${currentView.guildId}`;
      }
    }
    logPageView(path);
  }, [currentView, currentUser]);

  React.useEffect(() => {
    if (currentView?.type === 'admin' && !canAccessAdmin) {
      setCurrentView(null);
    }
    if (currentView?.type === 'application_mailbox' && !canAccessMailbox) {
      setCurrentView(null);
    }
    if (currentView?.type === 'arcade' && !canAccessArcade) {
      setCurrentView(null);
    }
    if (currentView?.type === 'alliance_raid_record' && !canAccessAllianceRaidRecord) {
      setCurrentView(null);
    }
    if (currentView?.type === 'guild' && !canAccessCostumeList) {
      setCurrentView(null);
    }
  }, [currentView, canAccessAdmin, canAccessMailbox, canAccessArcade, canAccessAllianceRaidRecord, canAccessCostumeList, setCurrentView]);

  if (!currentView || !currentUser) {
    return <Login />;
  }

  if (currentView.type === 'admin') {
    return canAccessAdmin ? <AdminDashboard /> : <Login />;
  }

  if (currentView.type === 'application_mailbox') {
    return canAccessMailbox ? <ApplicationMailbox /> : <Login />;
  }

  if (currentView.type === 'arcade') {
    return canAccessArcade ? <Arcade /> : <Login />;
  }

  if (currentView.type === 'alliance_raid_record') {
    return canAccessAllianceRaidRecord ? <AllianceRaidRecord /> : <Login />;
  }

  return canAccessCostumeList ? <GuildDashboard guildId={currentView.guildId} /> : <Login />;
};

const CACHE_NAME = 'bgm-cache-v1';

const AppContentWrapper = () => {
  const { db, userVolume } = useAppContext();
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [audioSrc, setAudioSrc] = React.useState<string>("");
  
  const firstSettingId = db.settings && Object.keys(db.settings).length > 0 ? Object.keys(db.settings)[0] : 'default';
  const BGM_URL = db.settings?.[firstSettingId]?.bgmUrl || "";
  const BGM_DEFAULT_VOLUME = (db.settings?.[firstSettingId]?.bgmDefaultVolume ?? 50) / 100;
  
  const EFFECTIVE_VOLUME = userVolume !== null ? userVolume / 100 : BGM_DEFAULT_VOLUME;
  const isMuted = EFFECTIVE_VOLUME === 0;

  React.useEffect(() => {
    setAudioSrc("");
  }, [BGM_URL]);

  React.useEffect(() => {
    const loadAudio = async () => {
      // Only download if we are unmuted and haven't loaded yet
      if (isMuted || audioSrc || !BGM_URL) return;
      
      let currentUrl = "";
      try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(BGM_URL);
        
        if (cachedResponse) {
          console.log("Loading BGM from cache...");
          const blob = await cachedResponse.blob();
          currentUrl = URL.createObjectURL(blob);
          setAudioSrc(currentUrl);
        } else {
          console.log("Downloading BGM for the first time...");
          const response = await fetch(BGM_URL);
          if (response.ok) {
            const responseToCache = response.clone();
            await cache.put(BGM_URL, responseToCache);
            const blob = await response.blob();
            currentUrl = URL.createObjectURL(blob);
            setAudioSrc(currentUrl);
          }
        }
      } catch (error) {
        console.error("Error loading/caching BGM:", error);
        // Fallback to direct URL if cache fails
        setAudioSrc(BGM_URL);
      }

      return () => {
        if (currentUrl && currentUrl.startsWith('blob:')) {
          URL.revokeObjectURL(currentUrl);
        }
      };
    };

    const cleanup = loadAudio();
    return () => {
      cleanup.then(fn => fn && fn());
    };
  }, [isMuted, audioSrc, BGM_URL]);

  React.useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = EFFECTIVE_VOLUME;
      if (!isMuted && audioSrc) {
        audioRef.current.play().catch(err => console.log("Autoplay blocked or error:", err));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isMuted, audioSrc, EFFECTIVE_VOLUME]);

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100 font-sans">
      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          loop
          autoPlay
        />
      )}
      <React.Suspense fallback={<div className="flex items-center justify-center min-h-screen text-stone-500 dark:text-stone-400">Loading...</div>}>
        <AppContent />
      </React.Suspense>
      <ToastContainer />
    </div>
  );
};

export default function App() {
  React.useEffect(() => {
    initGA();
  }, []);

  return (
    <ThemeProvider>
      <AppProvider>
        <AppContentWrapper />
      </AppProvider>
    </ThemeProvider>
  );
}
