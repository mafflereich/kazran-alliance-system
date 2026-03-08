import React, { useState } from 'react';
import { useAppContext } from '../store';
import { Shield, LogIn, LogOut, Settings, Users, User, Lock, AlertCircle, X, Globe, Volume2, VolumeX, Sun, Moon, Monitor, Layout, Mail, Gamepad2, Trophy, BookUser } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../ThemeContext';
import { logEvent } from '../analytics';

import { supabase } from '../supabase';

const DOMAIN_SUFFIX = '@kazran.com';

function LoginModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { db, setCurrentUser, fetchAllMembers } = useAppContext();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formattedEmail = `${username.toLowerCase()}${DOMAIN_SUFFIX}`;

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-stone-900/60 dark:bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="bg-stone-50 dark:bg-stone-700 px-6 py-4 border-b border-stone-200 dark:border-stone-600 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2 text-stone-800 dark:text-stone-200">
            <Shield className="w-6 h-6 text-amber-600" /> {t('header.admin_login')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 dark:hover:bg-stone-600 rounded-full transition-colors">
            <X className="w-5 h-5 text-stone-500 dark:text-stone-400" />
          </button>
        </div>

        <div className="p-6">
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('header.account')}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 dark:text-stone-500" />
                <input
                  type="text"
                  required
                  className="w-full pl-10 pr-4 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-stone-700 dark:text-stone-100"
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
                  className="w-full pl-10 pr-4 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-stone-700 dark:text-stone-100"
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
      </div>
    </div>
  );
}

export default function Header() {
  const { t, i18n } = useTranslation();
  const { db, currentUser, setCurrentUser, currentView, setCurrentView, userVolume, setUserVolume } = useAppContext();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const { preference, cycleTheme } = useTheme();
  const volumeHoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const volumeContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (volumeContainerRef.current && !volumeContainerRef.current.contains(event.target as Node)) {
        setIsVolumeHovered(false);
        if (volumeHoverTimeoutRef.current) {
          clearTimeout(volumeHoverTimeoutRef.current);
          volumeHoverTimeoutRef.current = null;
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleVolumeMouseEnter = () => {
    if (volumeHoverTimeoutRef.current) {
      clearTimeout(volumeHoverTimeoutRef.current);
      volumeHoverTimeoutRef.current = null;
    }
    setIsVolumeHovered(true);
  };

  const handleVolumeMouseLeave = () => {
    volumeHoverTimeoutRef.current = setTimeout(() => {
      setIsVolumeHovered(false);
    }, 300); // 300ms delay before hiding
  };

  const handleLogout = async () => {
    logEvent('User', 'Logout', currentUser || 'unknown');
    await supabase.auth.signOut();
    setCurrentUser(null);
    setCurrentView(null);
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

  const userGuildId = !canSeeAllGuilds && currentUser ? Object.entries(db.guilds).find(([_, g]) => g.username === currentUser)?.[0] : null;

  const topGuildId = canSeeAllGuilds ? (sortedGuilds.length > 0 ? sortedGuilds[0][0] : null) : userGuildId;

  const isCostumeListActive = currentView?.type === 'guild';
  const isAdminActive = currentView?.type === 'admin';

  const firstSettingId = db.settings && Object.keys(db.settings).length > 0 ? Object.keys(db.settings)[0] : 'default';
  const hasBgm = !!db.settings?.[firstSettingId]?.bgmUrl;
  const bgmDefaultVolume = db.settings?.[firstSettingId]?.bgmDefaultVolume ?? 50;
  const currentVolume = userVolume !== null ? userVolume : bgmDefaultVolume;
  const isMuted = currentVolume === 0;

  const toggleMute = () => {
    if (isMuted) {
      setUserVolume(bgmDefaultVolume > 0 ? bgmDefaultVolume : 50);
    } else {
      setUserVolume(0);
    }
  };

  return (
    <>
      <header className="bg-stone-900 text-white p-4 shadow-md shrink-0 sticky top-0 z-[100]">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1
            className="text-xl font-bold flex items-center gap-2 cursor-pointer hover:text-amber-400 transition-colors"
            onClick={() => setCurrentView(null)}
          >
            <Shield className="w-6 h-6 text-amber-500" />
            <span className="hidden sm:inline">{t('header.system_title')}</span>
          </h1>
          <div className="flex items-center gap-6 text-sm font-medium">
            <button
              onClick={() => {
                if (topGuildId) {
                  logEvent('Navigation', 'Click', 'Costume List');
                  setCurrentView({ type: 'guild', guildId: topGuildId });
                }
              }}
              disabled={isCostumeListActive || !topGuildId}
              className={`flex items-center gap-2 transition-colors ${isCostumeListActive ? 'text-amber-500 cursor-default' : 'hover:text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed'} ${!canAccessPage('costume_list') ? 'hidden' : ''}`}
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">{t('header.costume_list')}</span>
            </button>

            {canAccessPage('application_mailbox') && (
              <button
                onClick={() => {
                  logEvent('Navigation', 'Click', 'Application Mailbox');
                  setCurrentView({ type: 'application_mailbox' });
                }}
                disabled={currentView?.type === 'application_mailbox'}
                className={`flex items-center gap-2 transition-colors ${currentView?.type === 'application_mailbox' ? 'text-amber-500 cursor-default' : 'hover:text-amber-400'}`}
              >
                <Mail className="w-4 h-4" />
                <span className="hidden sm:inline">{t('header.application_mailbox')}</span>
              </button>
            )}

            {canAccessPage('arcade') && (
              <button
                onClick={() => {
                  logEvent('Navigation', 'Click', 'Arcade');
                  setCurrentView({ type: 'arcade' });
                }}
                disabled={currentView?.type === 'arcade'}
                className={`flex items-center gap-2 transition-colors ${currentView?.type === 'arcade' ? 'text-amber-500 cursor-default' : 'hover:text-amber-400'}`}
              >
                <Gamepad2 className="w-4 h-4" />
                <span className="hidden sm:inline">{t('header.arcade')}</span>
              </button>
            )}

            {canAccessPage('member_board') && (
              <button
                onClick={() => {
                  logEvent('Navigation', 'Click', 'Team Assign Board');
                  setCurrentView({ type: 'member_board' });
                }}
                disabled={currentView?.type === 'member_board'}
                className={`flex items-center gap-2 transition-colors ${currentView?.type === 'member_board' ? 'text-amber-500 cursor-default' : 'hover:text-amber-400'}`}
              >
                <BookUser className="w-4 h-4" />
                <span className="hidden sm:inline">{t('header.member_board', "Team Assign Board")}</span>
              </button>
            )}

            {currentUser ? (
              <div className="flex items-center gap-6">
                {canAccessPage('alliance_raid_record') && (
                  <button
                    onClick={() => {
                      logEvent('Navigation', 'Click', 'Alliance Raid Record');
                      setCurrentView({ type: 'alliance_raid_record' });
                    }}
                    disabled={currentView?.type === 'alliance_raid_record'}
                    className={`flex items-center gap-2 transition-colors ${currentView?.type === 'alliance_raid_record' ? 'text-amber-500 cursor-default' : 'hover:text-amber-400'}`}
                  >
                    <Trophy className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('header.alliance_raid_record')}</span>
                  </button>
                )}

                {canAccessAdmin && (
                  <button
                    onClick={() => {
                      logEvent('Navigation', 'Click', 'Admin Settings');
                      setCurrentView({ type: 'admin' });
                    }}
                    disabled={isAdminActive}
                    className={`flex items-center gap-2 transition-colors ${isAdminActive ? 'text-amber-500 cursor-default' : 'hover:text-amber-400'}`}
                  >
                    <Settings className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('header.admin_settings')}</span>
                  </button>
                )}

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 hover:text-amber-400 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('header.logout', { user: currentUser })}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="flex items-center gap-2 hover:text-amber-400 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">{t('header.login_btn')}</span>
              </button>
            )}

            <div className="flex items-center gap-4 border-l border-stone-800 pl-4">
              <div className="relative">
                <button
                  onClick={cycleTheme}
                  className="flex items-center justify-center hover:text-amber-400 transition-colors p-1"
                  title={preference === 'system' ? t('header.theme_system') : preference === 'light' ? t('header.theme_light') : t('header.theme_dark')}
                >
                  {preference === 'light' && <Sun className="w-4 h-4" />}
                  {preference === 'dark' && <Moon className="w-4 h-4" />}
                  {preference === 'system' && <Monitor className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative" ref={volumeContainerRef}>
                <button
                  onMouseEnter={handleVolumeMouseEnter}
                  onMouseLeave={handleVolumeMouseLeave}
                  onClick={() => hasBgm && toggleMute()}
                  disabled={!hasBgm}
                  className={`flex items-center justify-center transition-colors p-1 ${hasBgm ? 'hover:text-amber-400' : 'text-stone-600 cursor-not-allowed'}`}
                  title={!hasBgm ? t('common.no_bgm') : isMuted ? t('common.unmute') : t('common.mute')}
                >
                  {isMuted || !hasBgm ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {isVolumeHovered && hasBgm && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 bg-stone-800 p-3 rounded-lg shadow-xl z-[100] flex flex-col items-center gap-2 w-10 h-32 border border-stone-700">
                    <div className="h-24 flex items-center justify-center">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={currentVolume}
                        onChange={(e) => setUserVolume(Number(e.target.value))}
                        className="h-20 w-1 appearance-none bg-stone-600 rounded-lg accent-amber-500 cursor-pointer"
                        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                      />
                    </div>
                    <span className="text-[10px] text-stone-400 font-mono">{currentVolume}</span>
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                  className="flex items-center justify-center hover:text-amber-400 transition-colors p-1"
                  title={t('footer.language')}
                >
                  <Globe className="w-4 h-4" />
                </button>

                {isLangDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[90]"
                      onClick={() => setIsLangDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-32 bg-stone-800 border border-stone-700 rounded-lg shadow-xl z-[100] overflow-hidden">
                      <button
                        onClick={() => {
                          i18n.changeLanguage('zh-TW');
                          setIsLangDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs hover:bg-stone-700 transition-colors ${i18n.language === 'zh-TW' ? 'text-amber-500 font-bold' : 'text-stone-300'}`}
                      >
                        繁體中文
                      </button>
                      <button
                        onClick={() => {
                          i18n.changeLanguage('en');
                          setIsLangDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs hover:bg-stone-700 transition-colors ${i18n.language === 'en' ? 'text-amber-500 font-bold' : 'text-stone-300'}`}
                      >
                        English
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {isLoginModalOpen && (
        <LoginModal onClose={() => setIsLoginModalOpen(false)} />
      )}
    </>
  );
}
