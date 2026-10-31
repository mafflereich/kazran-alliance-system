import { useMemo, useState, useEffect } from 'react';
import { supabase, fetchAllPaginated } from '@/shared/api/supabase';
import { useAppContext } from '@/store';

/**
 * fetchAllPaginated 用 orderBy（預設 `id`）做 keyset 分頁，select 一定要包含
 * 該欄位才拿得到下一頁的游標。若只 select `guild_id`，第一頁之後就無法翻頁，
 * 成員數會被截斷（例：滿編 30 人的公會只算到 13 人 → 缺少人數顯示 17）。
 */
const MEMBER_COUNT_SELECT = 'id, guild_id';

export function useGuildStats(canManage: boolean, targetTier: number, allowedGuildIds?: string[]) {
  const { db } = useAppContext();
  const [guildMemberCounts, setGuildMemberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAllPaginated<{ id: string; guild_id: string }>(
          'members',
          MEMBER_COUNT_SELECT,
          q => q.eq('status', 'active'),
        );
        const counts: Record<string, number> = {};
        data.forEach((row: { guild_id: string }) => {
          if (row.guild_id) counts[row.guild_id] = (counts[row.guild_id] || 0) + 1;
        });
        setGuildMemberCounts(counts);
      } catch (err) {
        console.error('Failed to fetch guild member counts:', err);
      }
    })();
  }, []);

  const availableGuilds = useMemo(() => {
    const pool = allowedGuildIds && allowedGuildIds.length > 0
      ? Object.values(db.guilds).filter(g => g.id && allowedGuildIds.includes(g.id))
      : Object.values(db.guilds);
    return pool
      .filter(g => canManage || g.tier === targetTier)
      .sort((a, b) => {
        if ((a.tier || 1) !== (b.tier || 1)) return (a.tier || 1) - (b.tier || 1);
        return (a.orderNum || 99) - (b.orderNum || 99);
      });
  }, [db.guilds, canManage, targetTier, allowedGuildIds]);

  const guildsByTier = useMemo(() => {
    const grouped: Record<number, typeof availableGuilds> = {};
    availableGuilds.forEach(g => {
      const tier = g.tier || 1;
      if (!grouped[tier]) grouped[tier] = [];
      grouped[tier].push(g);
    });
    return grouped;
  }, [availableGuilds]);

  return { availableGuilds, guildsByTier, guildMemberCounts };
}
