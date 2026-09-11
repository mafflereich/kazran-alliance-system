import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/store';
import { Shield, Users, ChevronRight, Lock, X, AlertCircle, Info } from 'lucide-react';
import { getTierColor, getTierBorderHoverClass, getTierTextHoverClass } from '@/shared/lib/utils';
import { useTranslation } from 'react-i18next';

import { LoginModal } from '@/shared/ui/LoginModal';
import { supabase } from '@/shared/api/supabase';
import { logEvent } from '@/analytics';


export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { db, isRoleLoading, userRole } = useAppContext();
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  // 每公會統計快取（DB 端 1h 過期重算），避免首頁載入全體成員敏感資料
  const [guildStatCache, setGuildStatCache] = useState<Record<string, { traces: number; filled: number; lastUpdate: number }> | null>(null);

  // 登入後讀取首頁統計快取
  useEffect(() => {
    if (isRoleLoading) return;
    if (!userRole) {
      setGuildStatCache(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_home_page_stats');
      if (cancelled) return;
      if (error || !data) {
        console.error('Error fetching home page stats:', error);
        return;
      }

      const map: Record<string, { traces: number; filled: number; lastUpdate: number }> = {};
      (data as any[]).forEach((row) => {
        if (!row?.guild_id) return;
        map[String(row.guild_id)] = {
          traces: Number(row.refining_traces_total) || 0,
          filled: Number(row.people_filled_count) || 0,
          lastUpdate: Number(row.last_update_ms) || 0,
        };
      });
      setGuildStatCache(map);
    })();

    return () => { cancelled = true; };
  }, [userRole, isRoleLoading]);

  const handleGuildSelect = async (guildId: string) => {
    if (userRole) {
      navigate(`/guild/${guildId}`);
      return;
    }

    setIsLoginModalOpen(true);
    setIsVerifying(true);
    setError('');
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

  const isLoggedIn = !!userRole;

  // 每張公會卡的統計：煉痕總數 / 多少人填了自己的服裝 / 最後更新日
  // （來自 DB 端過期重算的快取，不再逐請求載入全體成員）
  const guildStats = React.useMemo(() => {
    const stats: Record<string, { traces: number; filled: number; lastUpdate: number }> = {};

    Object.entries(db.guilds).forEach(([id, guild]) => {
      if (guild.isDisplay === false) return;
      const cached = guildStatCache?.[id];
      stats[id] = {
        traces: cached?.traces ?? 0,
        filled: cached?.filled ?? 0,
        lastUpdate: cached?.lastUpdate ?? 0,
      };
    });

    return stats;
  }, [db.guilds, guildStatCache]);

  // 各梯隊總和
  const tierSums = React.useMemo(() => {
    const map: Record<number, { traces: number; filled: number; lastUpdate: number }> = {};
    Object.entries(db.guilds).forEach(([id, guild]) => {
      const s = guildStats[id] || { traces: 0, filled: 0, lastUpdate: 0 };
      const tier = guild.tier || 1;
      if (!map[tier]) map[tier] = { traces: 0, filled: 0, lastUpdate: 0 };
      map[tier].traces += s.traces;
      map[tier].filled += s.filled;
      if (s.lastUpdate > map[tier].lastUpdate) map[tier].lastUpdate = s.lastUpdate;
    });
    return map;
  }, [db.guilds, guildStats]);

  // 聯盟總和
  const allianceSum = React.useMemo(() => {
    let traces = 0;
    let filled = 0;
    let lastUpdate = 0;
    Object.entries(db.guilds).forEach(([id, guild]) => {
      const s = guildStats[id] || { traces: 0, filled: 0, lastUpdate: 0 };
      traces += s.traces;
      filled += s.filled;
      if (s.lastUpdate > lastUpdate) lastUpdate = s.lastUpdate;
    });
    return { traces, filled, lastUpdate };
  }, [db.guilds, guildStats]);

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

              {isLoggedIn && (
                <div className="mb-6 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-xl px-4 py-2.5">
                  <SummaryLine
                    label={t('login.alliance_total')}
                    traces={allianceSum.traces}
                    filled={allianceSum.filled}
                    lastUpdate={allianceSum.lastUpdate}
                  />
                </div>
              )}

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
                        {isLoggedIn && tierSums[tier] && (
                          <SummaryLine
                            label={`${t('login.tier_total')} / T${tier}`}
                            traces={tierSums[tier].traces}
                            filled={tierSums[tier].filled}
                            lastUpdate={tierSums[tier].lastUpdate}
                            className="justify-center"
                          />
                        )}
                        {tierGuilds.map(([id, guild]: [string, any]) => {
                          const stats = guildStats[id] || { traces: 0, filled: 0, lastUpdate: 0 };

                          let buttonClasses = "w-full flex items-center justify-between p-4 bg-white dark:bg-stone-800 border rounded-xl transition-all group overflow-hidden relative disabled:opacity-50";
                          let textClasses = `font-medium transition-colors ${getTierTextHoverClass(tier)}`;
                          let iconClasses = `w-5 h-5 transition-colors ${getTierTextHoverClass(tier)}`;

                          buttonClasses += ` ${getTierBorderHoverClass(tier)}`;

                          // Add specific background hover colors based on tier
                          if (tier === 1) buttonClasses += " hover:bg-orange-50 border-orange-200 dark:hover:bg-orange-900/20 dark:border-orange-800";
                          else if (tier === 2) buttonClasses += " hover:bg-blue-50 border-blue-200 dark:hover:bg-blue-900/20 dark:border-blue-800";
                          else if (tier === 3) buttonClasses += " hover:bg-stone-50 border-stone-300 dark:hover:bg-stone-700 dark:border-stone-600";
                          else if (tier === 4) buttonClasses += " hover:bg-green-50 border-green-200 dark:hover:bg-green-900/20 dark:border-green-800";
                          else buttonClasses += " hover:bg-stone-50 border-stone-200 dark:hover:bg-stone-700 dark:border-stone-700";

                          return (
                            <button
                              key={id}
                              onClick={() => handleGuildSelect(id)}
                              disabled={isVerifying}
                              className={`${buttonClasses} group/btn`}
                            >
                              <div className="relative z-10 flex flex-col items-start min-w-0">
                                <span className={`${textClasses} truncate w-full`}>{guild.name}</span>
                                {isLoggedIn && (
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 w-full">
                                    <span className="text-[11px] font-black text-purple-600 dark:text-purple-400" title={t('login.refining_traces')}>
                                      ✦ {stats.traces.toLocaleString()}
                                    </span>
                                    <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
                                      {t('login.people_filled', { count: stats.filled })}
                                    </span>
                                    <span className="text-[11px] text-stone-400 dark:text-stone-500">
                                      {formatUpdateDate(stats.lastUpdate)}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="relative z-10 flex items-center gap-2 shrink-0">
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

      {isLoginModalOpen && (
        <LoginModal onClose={() => {
          setIsLoginModalOpen(false);
          setIsVerifying(false);
        }} />
      )}
    </div>
  );
}

const formatUpdateDate = (timestamp: number) => {
  if (!timestamp) return '—';
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
};

function SummaryLine({ label, traces, filled, lastUpdate, className = '' }: {
  label: string;
  traces: number;
  filled: number;
  lastUpdate: number;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${className}`}>
      <span className="font-bold text-stone-700 dark:text-stone-200">{label}</span>
      <span className="font-black text-purple-600 dark:text-purple-400" title={t('login.refining_traces')}>✦ {traces.toLocaleString()}</span>
      <span className="font-bold text-stone-500 dark:text-stone-400">{t('login.people_filled', { count: filled })}</span>
      <span className="text-stone-400 dark:text-stone-500">{t('login.last_updated', { date: formatUpdateDate(lastUpdate) })}</span>
    </div>
  );
}
