import type { Member, Guild, GuildWithMembers, TieredData } from '@entities/member/types';

export function buildTieredData(members: Member[], guilds: Guild[]): TieredData[] {
    const guildMap = new Map<string, Guild>(guilds.map(g => [g.id!, g]));

    const tierMap = new Map<number, { guild: Guild; members: Member[] }[]>();

    // 先把所有公會初始化到對應 tier，確保空公會也能顯示
    guilds.forEach(guild => {
        if (!guild.tier) return;

        if (!tierMap.has(guild.tier)) {
            tierMap.set(guild.tier, []);
        }

        const tierEntries = tierMap.get(guild.tier)!;
        tierEntries.push({ guild, members: [] });
    });

    // 再把成員加入到對應公會
    members.forEach(m => {
        const guild = guildMap.get(m.guildId);
        if (!guild?.tier) return;

        const tierEntries = tierMap.get(guild.tier);
        if (!tierEntries) return;

        let guildEntry = tierEntries.find(e => e.guild.id === guild.id);
        if (!guildEntry) {
            guildEntry = { guild, members: [] };
            tierEntries.push(guildEntry);
        }

        guildEntry.members.push(m);
    });

    // 轉成 TieredData[] 格式
    const result: TieredData[] = Array.from(tierMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([tier, entries]) => ({
            tier,
            guilds: entries
                .sort((a, b) => (a.guild.orderNum ?? 999) - (b.guild.orderNum ?? 999))
                .map(e => ({
                    ...e.guild,
                    members: e.members.sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0)),
                })) as GuildWithMembers[],
        }));

    return result;
}