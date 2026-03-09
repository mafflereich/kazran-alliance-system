import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '@/store';
import { 
  Shield, LogIn, LogOut, Settings, Users, User, Lock, 
  AlertCircle, X, Globe, Volume2, VolumeX, Sun, Moon, 
  Monitor, Layout, Mail, Gamepad2, Trophy, BookUser, 
  Wrench, Menu, ChevronDown, ChevronUp 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/app/providers/ThemeContext';
import { logEvent } from '@/analytics';
import { motion, AnimatePresence } from 'motion/react';

import { supabase } from '@/shared/api/supabase';

const DOMAIN_SUFFIX = '@kazran.com';

function LoginModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { setCurrentUser, fetchAllMembers } = useAppContext();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formattedEmail = `${username.toLowerCase()}${DOMAIN_SUFFIX}`;

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: formattedEmail,
        password: password,
      });

      if (authError) {
        throw new Error(t('header.wrong_credentials'));
      }

      setCurrentUser(username.toLowerCase());
      await fetchAllMembers();
      onClose();
    } catch (error: any) {
      setError(error.message);
      console.error(t('header.login_failed'), error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-stone-900/60 dark:bg-black/70 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
      >
        <div className="bg-stone-50 dark:bg-stone-700 px-4 sm:px-6 py-3 sm:py-4 border-b border-stone-200 dark:border-stone-600 flex justify-between items-center">
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2 text-stone-800 dark:text-stone-200">
            <Shield className="w-6 h-6 text-amber-600" /> {t('header.admin_login')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 dark:hover:bg-stone-600 rounded-full transition-colors">
            <X className="w-5 h-5 text-stone-500 dark:text-stone-400" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('header.account')}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 dark:text-stone-500" />
                <input
                  type="text"
                  required
                  className="w-full pl-10 pr-4 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={t('header.enter_account')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('header.password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 dark:text-stone-500" />
                <input
                  type="password"
                  required
                  className="w-full pl-10 pr-4 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('header.enter_password')}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/30 p-2 rounded border border-red-100 dark:border-red-800">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-stone-800 dark:bg-stone-600 text-white hover:bg-stone-700 dark:hover:bg-stone-500 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? t('header.logging_in') : t('header.login')}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Header() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { db, currentUser, setCurrentUser, userVolume, setUserVolume } = useAppContext();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { preference, cycleTheme } = useTheme();
  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (volumeContainerRef.current && !volumeContainerRef.current.contains(event.target as Node)) {
        setIsVolumeHovered(false);
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    logEvent('User', 'Logout', currentUser || 'unknown');
    await supabase.auth.signOut();
    setCurrentUser(null);
    navigate('/');
  };

  const sortedGuilds = (Object.entries(db.guilds) as [string, any][]).sort((a, b) => {
    const tierA = a[1].tier || 99;
    const tierB = b[1].tier || 99;
    if (tierA !== tierB) return tierA - tierB;
    const orderA = a[1].orderNum || 99;
    const orderB = b[1].orderNum || 99;
    return orderA - orderB;
  });

  const userRole = currentUser ? db.users[currentUser]?.role : null;
  const canSeeAllGuilds = userRole === 'admin' || userRole === 'creator' || userRole === 'manager';

  const getDefaultRoles = (pageId: string): ('member' | 'manager' | 'admin' | 'creator')[] => {
    switch (pageId) {
      case 'costume_list': return ['member', 'manager', 'admin', 'creator'];
      case 'application_mailbox': return ['member', 'manager', 'admin', 'creator'];
      case 'arcade': return ['manager', 'admin', 'creator'];
      case 'alliance_raid_record': return ['creator'];
      case 'toolbox': return ['member', 'manager', 'admin', 'creator'];
      default: return ['creator', 'admin'];
    }
  };

  const canAccessPage = (pageId: string) => {
    const roles = db.accessControl?.[pageId]?.roles || getDefaultRoles(pageId);
    if (!currentUser) return false;
    return roles.includes(userRole as any);
  };

  const userGuildId = !canSeeAllGuilds && currentUser ? Object.entries(db.guilds).find(([_, g]) => g.username === currentUser)?.[0] : null;
  const topGuildId = canSeeAllGuilds ? (sortedGuilds.length > 0 ? sortedGuilds[0][0] : null) : userGuildId;

  const navItems = [
    { id: 'costume_list', icon: Users, label: t('header.costume_list'), path: topGuildId ? `/guild/${topGuildId}` : null, active: location.pathname.startsWith('/guild') },
    { id: 'application_mailbox', icon: Mail, label: t('header.application_mailbox'), path: '/mailbox', active: location.pathname === '/mailbox' },
    { id: 'arcade', icon: Gamepad2, label: t('header.arcade'), path: '/arcade', active: location.pathname === '/arcade' },
    { id: 'member_board', icon: BookUser, label: t('header.member_board', "Team Assign Board"), path: '/team', active: location.pathname === '/team' },
    { id: 'toolbox', icon: Wrench, label: t('header.toolbox_title'), path: '/toolbox', active: location.pathname === '/toolbox' },
    { id: 'alliance_raid_record', icon: Trophy, label: t('header.alliance_raid_record'), path: '/raid', active: location.pathname === '/raid' },
    { id: 'admin_settings', icon: Settings, label: t('header.admin_settings'), path: '/admin', active: location.pathname === '/admin' },
  ];

  const firstSettingId = db.settings && Object.keys(db.settings).length > 0 ? Object.keys(db.settings)[0] : 'default';
  const hasBgm = !!db.settings?.[firstSettingId]?.bgmUrl;
  const bgmDefaultVolume = db.settings?.[firstSettingId]?.bgmDefaultVolume ?? 50;
  const currentVolume = userVolume !== null ? userVolume : bgmDefaultVolume;
  const isMuted = currentVolume === 0;

  const toggleMute = () => {
    setUserVolume(isMuted ? (bgmDefaultVolume > 0 ? bgmDefaultVolume : 50) : 0);
  };

  const containerVariants: any = {
    hidden: { height: 0, opacity: 0 },
    visible: { 
      height: 'auto', 
      opacity: 1,
      transition: { 
        duration: 0.4, 
        ease: [0.23, 1, 0.32, 1],
        when: "beforeChildren",
        staggerChildren: 0.05
      }
    },
    exit: { 
      height: 0, 
      opacity: 0,
      transition: { 
        duration: 0.3, 
        ease: [0.23, 1, 0.32, 1],
        when: "afterChildren"
      }
    }
  };

  const itemVariants: any = {
    hidden: { y: 10, opacity: 0 },
    visible: { y: 0, opacity: 1 },
    exit: { y: 10, opacity: 0 }
  };

  return (
    <>
      <header className="bg-stone-950/80 backdrop-blur-md text-white border-b border-stone-800 shrink-0 sticky top-0 z-[100]" ref={menuRef}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex justify-between items-center">
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => navigate('/')}
          >
            <div className="p-2 bg-amber-500/10 rounded-lg group-hover:bg-amber-500/20 transition-colors">
              <Shield className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-bold tracking-tight leading-none">{t('header.system_title')}</span>
              <span className="text-[9px] sm:text-[10px] text-stone-500 uppercase tracking-widest font-mono hidden xs:inline">Alliance OS v2.0</span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-all duration-300 ${
                isMenuOpen ? 'bg-amber-500 text-stone-950 shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 'bg-stone-900 hover:bg-stone-800 text-stone-300'
              }`}
            >
              <Menu className={`w-5 h-5 transition-transform duration-500 ${isMenuOpen ? 'rotate-90' : ''}`} />
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider hidden sm:inline">
                {isMenuOpen ? t('common.close', 'Close') : t('common.menu', 'Menu')}
              </span>
              {isMenuOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {!currentUser && (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="p-2.5 bg-stone-900 hover:bg-stone-800 rounded-lg text-stone-300 transition-colors"
                title={t('header.login_btn')}
              >
                <LogIn className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="overflow-y-auto max-h-[calc(100vh-4rem)] bg-stone-950 border-t border-stone-800 shadow-2xl custom-scrollbar"
            >
              <div className="max-w-6xl mx-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                {/* Navigation Section */}
                <motion.div variants={itemVariants} className="space-y-3 sm:space-y-4">
                  <h3 className="text-[9px] sm:text-[10px] font-bold text-stone-500 uppercase tracking-[0.2em] border-b border-stone-800 pb-2">
                    {t('common.navigation', 'Navigation')}
                  </h3>
                  <div className="grid gap-1">
                    {navItems.map((item) => {
                      const hasAccess = canAccessPage(item.id);
                      if (!hasAccess || !item.path) return null;

                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            navigate(item.path!);
                            setIsMenuOpen(false);
                          }}
                          className={`flex items-center gap-3 px-3 py-3 sm:py-2.5 rounded-lg transition-all group ${
                            item.active 
                              ? 'bg-amber-500/10 text-amber-500' 
                              : 'text-stone-400 hover:bg-stone-900 hover:text-white'
                          }`}
                        >
                          <item.icon className={`w-5 h-5 ${item.active ? 'text-amber-500' : 'text-stone-500 group-hover:text-amber-400'}`} />
                          <span className="text-sm font-medium">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>

                {/* User & Settings Section */}
                <motion.div variants={itemVariants} className="space-y-3 sm:space-y-4">
                  <h3 className="text-[9px] sm:text-[10px] font-bold text-stone-500 uppercase tracking-[0.2em] border-b border-stone-800 pb-2">
                    {t('common.account_settings', 'Account & Settings')}
                  </h3>
                  <div className="space-y-3">
                    {currentUser ? (
                      <div className="p-4 bg-stone-900 rounded-xl border border-stone-800">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-stone-950 font-bold">
                            {currentUser[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white truncate max-w-[150px]">{currentUser}</div>
                            <div className="text-[10px] text-stone-500 uppercase tracking-wider">{userRole}</div>
                          </div>
                        </div>
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-stone-800 hover:bg-red-900/20 hover:text-red-400 text-stone-300 rounded-lg transition-all text-sm font-medium"
                        >
                          <LogOut className="w-4 h-4" />
                          {t('header.logout_simple', 'Logout')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setIsLoginModalOpen(true);
                          setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-3.5 bg-amber-500 text-stone-950 rounded-lg font-bold hover:bg-amber-400 transition-all text-sm"
                      >
                        <LogIn className="w-5 h-5" />
                        {t('header.login_btn')}
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={cycleTheme}
                        className="flex items-center justify-center gap-2 py-3.5 bg-stone-900 hover:bg-stone-800 rounded-lg text-stone-400 transition-all border border-stone-800"
                      >
                        {preference === 'light' && <Sun className="w-4 h-4" />}
                        {preference === 'dark' && <Moon className="w-4 h-4" />}
                        {preference === 'system' && <Monitor className="w-4 h-4" />}
                        <span className="text-xs font-medium">Theme</span>
                      </button>
                      <div className="relative" ref={volumeContainerRef}>
                        <button
                          onClick={() => hasBgm && toggleMute()}
                          className={`w-full flex items-center justify-center gap-2 py-3.5 bg-stone-900 rounded-lg transition-all border border-stone-800 ${
                            hasBgm ? 'hover:bg-stone-800 text-stone-400' : 'opacity-50 cursor-not-allowed'
                          }`}
                        >
                          {isMuted || !hasBgm ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                          <span className="text-xs font-medium">Audio</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Language Section */}
                <motion.div variants={itemVariants} className="space-y-3 sm:space-y-4">
                  <h3 className="text-[9px] sm:text-[10px] font-bold text-stone-500 uppercase tracking-[0.2em] border-b border-stone-800 pb-2">
                    {t('footer.language')}
                  </h3>
                  <div className="grid gap-2">
                    <button
                      onClick={() => i18n.changeLanguage('zh-TW')}
                      className={`flex items-center justify-between px-4 py-3.5 rounded-lg border transition-all ${
                        i18n.language === 'zh-TW' 
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-500' 
                          : 'bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700'
                      }`}
                    >
                      <span className="text-sm font-medium">繁體中文</span>
                      <Globe className="w-4 h-4 opacity-50" />
                    </button>
                    <button
                      onClick={() => i18n.changeLanguage('en')}
                      className={`flex items-center justify-between px-4 py-3.5 rounded-lg border transition-all ${
                        i18n.language === 'en' 
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-500' 
                          : 'bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700'
                      }`}
                    >
                      <span className="text-sm font-medium">English</span>
                      <Globe className="w-4 h-4 opacity-50" />
                    </button>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <AnimatePresence>
        {isLoginModalOpen && (
          <LoginModal onClose={() => setIsLoginModalOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
