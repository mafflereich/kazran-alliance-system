import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';

export function useGuildStats(canManage: boolean, targetTier: number) {
  const { db } = useAppContext();
  const [guildMemberCounts, setGuildMemberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    supabase
      .from('members')
      .select('guild_id')
      .eq('status', 'active')
      .then(({ data }: { data: { guild_id: string }[] | null }) => {
        if (!data) return;
        const counts: Record<string, number> = {};
        data.forEach((row: { guild_id: string }) => {
          if (row.guild_id) counts[row.guild_id] = (counts[row.guild_id] || 0) + 1;
        });
        setGuildMemberCounts(counts);
      });
  }, []);

  const availableGuilds = useMemo(() => {
    return Object.values(db.guilds)
      .filter(g => canManage || g.tier === targetTier)
      .sort((a, b) => {
        if ((a.tier || 1) !== (b.tier || 1)) return (a.tier || 1) - (b.tier || 1);
        return (a.orderNum || 99) - (b.orderNum || 99);
      });
  }, [db.guilds, canManage, targetTier]);

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
