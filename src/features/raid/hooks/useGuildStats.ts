import { useMemo } from 'react';
import { useAppContext } from '@/store';

export function useGuildStats(canManage: boolean, targetTier: number) {
  const { db } = useAppContext();

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

  const guildMemberCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(db.members).forEach(m => {
      if (m.guildId && m.status !== 'archived') {
        counts[m.guildId] = (counts[m.guildId] || 0) + 1;
      }
    });
    return counts;
  }, [db.members]);

  return { availableGuilds, guildsByTier, guildMemberCounts };
}
