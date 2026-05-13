import { useState, useEffect } from 'react';
import type { Member, Guild } from '@entities/member/types';
import type { MemberRaidRecord } from '../types';

export interface MemberMoveItem {
  memberId: string;
  name: string;
  fromGuild: string;
  toGuild: string;
  action: 'move' | 'kick';
}

export interface GuildMoveSummary {
  guildName: string;
  members: MemberMoveItem[];
  action: 'kick' | 'recruit';
}

export function useMemberMoveAnnounce(
  currentSeasonRecords: Record<string, MemberRaidRecord>,
  prevSeasonRecords: Record<string, MemberRaidRecord> | null,
  members: Member[],
  guilds: Guild[],
  isCurrentSeasonArchived: boolean
) {
  const [moveSummaries, setMoveSummaries] = useState<GuildMoveSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!prevSeasonRecords) {
      setMoveSummaries([]);
      return;
    }

    const guildMap = new Map<string, Guild>(guilds.map(g => [g.id!, g]));
    const guildNameMap = new Map<string, Guild>(guilds.map(g => [g.name, g]));
    const memberMap = new Map<string, Member>(members.map(m => [m.id!, m]));
    const memberMoves: Map<string, MemberMoveItem> = new Map();

    const memberCurrentGuildMap = new Map<string, string>();
    members.forEach(m => {
      if (m.id && m.guildId) {
        memberCurrentGuildMap.set(m.id, m.guildId);
      }
    });

    const allMemberIds = new Set([
      ...Object.keys(currentSeasonRecords),
      ...Object.keys(prevSeasonRecords)
    ]);

    console.log('Member move announce data:', {
      currentRecordsCount: Object.keys(currentSeasonRecords).length,
      prevRecordsCount: prevSeasonRecords ? Object.keys(prevSeasonRecords).length : 0,
      isCurrentSeasonArchived,
      sampleCurrentRecord: Object.values(currentSeasonRecords)[0],
      samplePrevRecord: prevSeasonRecords ? Object.values(prevSeasonRecords)[0] : null,
    });

    allMemberIds.forEach(memberId => {
      const currentRecord = currentSeasonRecords[memberId];
      const prevRecord = prevSeasonRecords[memberId];
      const member = memberMap.get(memberId);
      const currentGuildId = memberCurrentGuildMap.get(memberId);

      if (!isCurrentSeasonArchived) {
        if (!prevRecord && currentGuildId) {
          const toGuild = guildMap.get(currentGuildId);
          if (!toGuild) return;

          memberMoves.set(memberId, {
            memberId,
            name: member?.name || memberId,
            fromGuild: '',
            toGuild: toGuild.name || '未知公會',
            action: 'move'
          });
        } else if (prevRecord && !currentGuildId) {
          const fromGuild = guildMap.get(prevRecord.season_guild!);
          if (!fromGuild) return;

          memberMoves.set(memberId, {
            memberId,
            name: member?.name || prevRecord.member_id || memberId,
            fromGuild: fromGuild.name || '未知公會',
            toGuild: '',
            action: 'kick'
          });
        } else if (prevRecord && currentGuildId) {
          if (prevRecord.season_guild !== currentGuildId) {
            const fromGuild = guildMap.get(prevRecord.season_guild!);
            const toGuild = guildMap.get(currentGuildId);

            if (!fromGuild || !toGuild) return;

            memberMoves.set(memberId, {
              memberId,
              name: member?.name || prevRecord.member_id || memberId,
              fromGuild: fromGuild.name || '未知公會',
              toGuild: toGuild.name || '未知公會',
              action: 'move'
            });
          }
        }
      } else {
        if (!prevRecord && currentRecord) {
          const toGuild = guildMap.get(currentRecord.season_guild!);
          if (!toGuild) return;

          memberMoves.set(memberId, {
            memberId,
            name: member?.name || currentRecord.member_id || memberId,
            fromGuild: '',
            toGuild: toGuild.name || '未知公會',
            action: 'move'
          });
        } else if (prevRecord && !currentRecord) {
          const fromGuild = guildMap.get(prevRecord.season_guild!);
          if (!fromGuild) return;

          memberMoves.set(memberId, {
            memberId,
            name: member?.name || prevRecord.member_id || memberId,
            fromGuild: fromGuild.name || '未知公會',
            toGuild: '',
            action: 'kick'
          });
        } else if (prevRecord && currentRecord) {
          if (prevRecord.season_guild !== currentRecord.season_guild) {
            const fromGuild = guildMap.get(prevRecord.season_guild!);
            const toGuild = guildMap.get(currentRecord.season_guild!);

            if (!fromGuild || !toGuild) return;

            memberMoves.set(memberId, {
              memberId,
              name: member?.name || currentRecord.member_id || prevRecord.member_id || memberId,
              fromGuild: fromGuild.name || '未知公會',
              toGuild: toGuild.name || '未知公會',
              action: 'move'
            });
          }
        }
      }
    });

    const guildGroups = new Map<string, { toKick: MemberMoveItem[], toRecruit: MemberMoveItem[] }>();

    memberMoves.forEach(move => {
      if (move.fromGuild) {
        if (!guildGroups.has(move.fromGuild)) {
          guildGroups.set(move.fromGuild, { toKick: [], toRecruit: [] });
        }
        guildGroups.get(move.fromGuild)!.toKick.push(move);
      }

      if (move.action === 'move' && move.toGuild) {
        if (!guildGroups.has(move.toGuild)) {
          guildGroups.set(move.toGuild, { toKick: [], toRecruit: [] });
        }
        guildGroups.get(move.toGuild)!.toRecruit.push(move);
      }
    });

    const summaries: GuildMoveSummary[] = [];

    guildGroups.forEach((groups, guildName) => {
      if (groups.toKick.length > 0) {
        summaries.push({
          guildName,
          members: groups.toKick,
          action: 'kick'
        });
      }

      if (groups.toRecruit.length > 0) {
        summaries.push({
          guildName,
          members: groups.toRecruit,
          action: 'recruit'
        });
      }
    });

    const sortedSummaries = summaries.sort((a, b) => {
      const guildA = guildNameMap.get(a.guildName);
      const guildB = guildNameMap.get(b.guildName);
      
      const tierA = guildA?.tier || 99;
      const tierB = guildB?.tier || 99;
      
      if (tierA !== tierB) return tierA - tierB;
      
      const orderA = guildA?.orderNum || 99;
      const orderB = guildB?.orderNum || 99;
      if (orderA !== orderB) return orderA - orderB;
      
      return a.action === 'kick' ? -1 : 1;
    });

    setMoveSummaries(sortedSummaries);
  }, [currentSeasonRecords, prevSeasonRecords, members, guilds, isCurrentSeasonArchived]);

  return {
    moveSummaries,
    loading,
    hasChanges: moveSummaries.length > 0
  };
}