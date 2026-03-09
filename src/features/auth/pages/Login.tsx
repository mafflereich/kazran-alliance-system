import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/store';
import { Shield, Users, ChevronRight, Lock, X, AlertCircle, Info } from 'lucide-react';
import { getTierColor, getTierTextColor, getTierBorderHoverClass, getTierTextHoverClass } from '@/shared/lib/utils';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/shared/api/supabase';
import { logEvent } from '@/analytics';

const DOMAIN_SUFFIX = '@kazran.com';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { db, fetchAllMembers, setCurrentView, setCurrentUser, currentUser, isRoleLoading } = useAppContext();
  const [selectedGuildForLogin, setSelectedGuildForLogin] = useState<{ id: string, name: string } | null>(null);
  const [guildPassword, setGuildPassword] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const userRole = currentUser ? db.users[currentUser]?.role : null;
  const canSeeAllGuilds = userRole === 'admin' || userRole === 'creator' || userRole === 'manager';
  const userGuildId = !canSeeAllGuilds && currentUser ? Object.entries(db.guilds).find(([_, g]) => g.username === currentUser)?.[0] : null;

  useEffect(() => {
    fetchAllMembers();
  }, []);

  const handleGuildSelect = async (guildId: string, guildName: string) => {
    if (currentUser) {
      if (!canSeeAllGuilds && guildId !== userGuildId) return;
      navigate(`/guild/${guildId}`);
      return;
    }

    setSelectedGuildForLogin({ id: guildId, name: guildName });
    setGuildPassword('');
    setError('');
  };

  const handleGuildLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuildForLogin) return;

    const guild = db.guilds[selectedGuildForLogin.id];
    const username = guild?.username;

    if (!username) {
      setError(t('login.no_login_account'));
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const formattedEmail = `${username.toLowerCase()}${DOMAIN_SUFFIX}`;

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: formattedEmail,
        password: guildPassword,
      });

      if (authError) {
        throw new Error(t('login.wrong_password'));
      }

      logEvent('User', 'Login', username.toLowerCase());

      setCurrentUser(username.toLowerCase());
      await fetchAllMembers();
      navigate(`/guild/${selectedGuildForLogin.id}`);
    } catch (error: any) {
      setError(error.message);
      console.error(t('login.login_failed'), error);
    } finally {
      setIsVerifying(false);
    }
  };

  const sortedGuilds = React.useMemo(() => {
    return (Object.entries(db.guilds) as [string, any][]).sort((a, b) => {
      const tierA = a[1].tier || 99;
      const tierB = b[1].tier || 99;
      if (tierA !== tierB) return tierA - tierB;
      const orderA = a[1].orderNum || 99;
      const orderB = b[1].orderNum || 99;
      return orderA - orderB;
    });
  }, [db.guilds]);

  const newCostume = React.useMemo(() => {
    return Object.values(db.costumes).find((costume) => costume.isNew);
  }, [db.costumes]);

  const guildStats = React.useMemo(() => {
    const stats: Record<string, { rate: number; is100: boolean; count: number }> = {};

    if (!newCostume) return stats;

    Object.entries(db.guilds).forEach(([id, guild]) => {
      const membersInGuild = Object.values(db.members).filter((member) => member.guildId === id && member.status === "active");

      if (membersInGuild.length === 0) {
        stats[id] = { rate: 0, is100: false, count: 0 };
        return;
      }

      const ownedCount = membersInGuild.filter((member) =>
        member.records && member.records[newCostume.id] && (+member.records[newCostume.id].level) >= 0
      ).length;

      const rate = Math.round((ownedCount / membersInGuild.length) * 100);
      stats[id] = {
        rate,
        is100: rate === 100,
        count: membersInGuild.length
      };
    });

    return stats;
  }, [db.guilds, db.members, newCostume]);

  const indexPercentType = db.settings && Object.values(db.settings)[0]?.indexPercentType;

  return (
    <div className="flex flex-col min-h-screen bg-stone-200 dark:bg-stone-950">
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4">
        <div className="bg-white dark:bg-stone-800 p-4 sm:p-8 rounded-2xl shadow-xl w-full max-w-5xl transition-all duration-300">
          <h1 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8 text-stone-800 dark:text-stone-200">{t('login.system_title')}</h1>

          <div className="space-y-6 sm:space-y-8">
            <div className="p-4 sm:p-6 border border-stone-200 dark:border-stone-700 rounded-xl bg-stone-50 dark:bg-stone-700">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 sm:mb-8 gap-4">
                <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                  <Users className="w-5 h-5" /> {t('login.select_guild')}
                </h2>

                {Object.values(db.settings)[0]?.indexMessage && (
                  <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-4 py-2 rounded-lg">
                    <p className="text-amber-800 dark:text-amber-200 text-sm font-bold flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      {Object.values(db.settings)[0].indexMessage}
                    </p>
                  </div>
                )}
              </div>

              {isRoleLoading ? (
                <div className="text-center text-stone-500 dark:text-stone-400 py-8 flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-stone-500 dark:border-stone-400 border-t-transparent rounded-full animate-spin"></div>
                  {t('common.loading', '載入中...')}
                </div>
              ) : Object.keys(db.guilds).length === 0 ? (
                <div className="text-center text-stone-500 dark:text-stone-400 py-8">
                  {t('login.no_guilds')}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[1, 2, 3, 4].map(tier => {
                    const tierGuilds = sortedGuilds.filter(g => (g[1].tier || 1) === tier && g[1].isDisplay !== false);
                    if (tierGuilds.length === 0) return null;
                    return (
                      <div key={tier} className="space-y-3">
                        <h3 className={`font-bold text-center py-2 rounded-lg border ${getTierColor(tier)}`}>{t('guilds.tier')} {tier}</h3>
                        {tierGuilds.map(([id, guild]: [string, any]) => {
                          const isDisabled = currentUser && !canSeeAllGuilds && id !== userGuildId;
                          const stats = guildStats[id] || { rate: 0, is100: false, count: 0 };
                          const { rate: newCostumeRate, is100 } = stats;

                          // Determine classes based on state and tier
                          let buttonClasses = "w-full flex items-center justify-between p-4 bg-white dark:bg-stone-800 border rounded-xl transition-all group overflow-hidden relative disabled:opacity-50";

                          const showPercent = currentUser && indexPercentType === 'new_costumes_owned';

                          let textClasses = (showPercent && is100) ? getTierTextColor(tier) : `font-medium transition-colors text-stone-800 dark:text-stone-200 ${getTierTextHoverClass(tier)}`;
                          let iconClasses = `w-5 h-5 transition-colors ${isDisabled ? 'text-stone-300 dark:text-stone-600' : getTierTextHoverClass(tier)}`;

                          if (isDisabled) {
                            buttonClasses += " border-stone-200 dark:border-stone-700 opacity-30 cursor-not-allowed";
                            if (!(showPercent && is100)) {
                              buttonClasses += " grayscale";
                              textClasses = "font-medium text-stone-400 dark:text-stone-500";
                            }
                          } else {
                            // Enabled state - apply tier colors
                            buttonClasses += ` ${getTierBorderHoverClass(tier)}`;

                            // Add specific background hover colors based on tier
                            if (tier === 1) buttonClasses += " hover:bg-orange-50 border-orange-200 dark:hover:bg-orange-900/20 dark:border-orange-800";
                            else if (tier === 2) buttonClasses += " hover:bg-blue-50 border-blue-200 dark:hover:bg-blue-900/20 dark:border-blue-800";
                            else if (tier === 3) buttonClasses += " hover:bg-stone-50 border-stone-300 dark:hover:bg-stone-700 dark:border-stone-600";
                            else if (tier === 4) buttonClasses += " hover:bg-green-50 border-green-200 dark:hover:bg-green-900/20 dark:border-green-800";
                            else buttonClasses += " hover:bg-stone-50 border-stone-200 dark:hover:bg-stone-700 dark:border-stone-700";
                          }

                          return (
                            <button
                              key={id}
                              onClick={() => handleGuildSelect(id, guild.name)}
                              disabled={isVerifying || isDisabled}
                              className={`${buttonClasses} group/btn`}
                            >
                              {/* Progress Background Overlay - Only show if enabled in settings */}
                              {showPercent && (
                                <div
                                  className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 ${is100
                                      ? 'bg-amber-500 opacity-10 dark:opacity-20'
                                      : isDisabled
                                        ? 'bg-stone-300 dark:bg-stone-600 opacity-20'
                                        : 'bg-stone-400 opacity-10 dark:opacity-20'
                                    }`}
                                  style={{ width: `${newCostumeRate}%` }}
                                />
                              )}

                              <div className="relative z-10 flex flex-col items-start">
                                <span className={textClasses}>{guild.name}</span>
                                {showPercent && is100 && <span className="text-[9px] uppercase tracking-widest font-bold text-amber-600 dark:text-amber-400">Complete</span>}
                              </div>

                              <div className="relative z-10 flex items-center gap-2">
                                {showPercent && (
                                  <span className={`text-sm font-black ${is100 ? 'text-amber-500' : isDisabled ? 'text-stone-300 dark:text-stone-600' : 'text-stone-400'}`}>
                                    {newCostumeRate}%
                                  </span>
                                )}
                                <ChevronRight className={iconClasses} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedGuildForLogin && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-stone-900/60 dark:bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="bg-stone-50 dark:bg-stone-700 px-4 sm:px-6 py-3 sm:py-4 border-b border-stone-200 dark:border-stone-600 flex justify-between items-center">
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2 text-stone-800 dark:text-stone-200">
                <Shield className="w-6 h-6 text-amber-600" /> {t('login.enter_guild', { guildName: selectedGuildForLogin.name })}
              </h2>
              <button onClick={() => setSelectedGuildForLogin(null)} className="p-2 hover:bg-stone-200 dark:hover:bg-stone-600 rounded-full transition-colors">
                <X className="w-5 h-5 text-stone-500 dark:text-stone-400" />
              </button>
            </div>

            <div className="p-4 sm:p-6">
              <form onSubmit={handleGuildLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('login.guild_password')}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 dark:text-stone-500" />
                    <input
                      type="password"
                      className="w-full pl-10 pr-4 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                      value={guildPassword}
                      onChange={e => setGuildPassword(e.target.value)}
                      placeholder={t('login.enter_password')}
                      autoFocus
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
                    disabled={isVerifying}
                    className="w-full py-2 bg-stone-800 dark:bg-stone-600 text-white hover:bg-stone-700 dark:hover:bg-stone-500 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {isVerifying ? t('login.verifying') : t('login.enter')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
