export const getSortedMembers = (
  membersData: Record<string, any>,
  guildId: string,
  sortConfig: { key: string; order: 'asc' | 'desc' },
  userProfileId: string | null
) => {
  const userMemberIds = userProfileId ? userProfileId.split(',').map(id => id.trim()).filter(Boolean) : [];

  return Object.entries(membersData)
    .filter(([_, m]: [string, any]) => m.guildId === guildId)
    .sort((a: [string, any], b: [string, any]) => {
      const isUserA = userMemberIds.includes(a[0]);
      const isUserB = userMemberIds.includes(b[0]);

      if (isUserA && !isUserB) return -1;
      if (!isUserA && isUserB) return 1;

      const roleOrder: Record<string, number> = {
        'leader': 1,
        'coleader': 2,
        'member': 3
      };

      const getTieBreak = () => {
        const orderA = roleOrder[a[1].role] || 99;
        const orderB = roleOrder[b[1].role] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return a[1].name.localeCompare(b[1].name);
      };

      if (sortConfig.key === 'member') {
        if (sortConfig.order === 'asc') {
          const orderA = roleOrder[a[1].role] || 99;
          const orderB = roleOrder[b[1].role] || 99;
          if (orderA !== orderB) return orderA - orderB;
          return a[1].name.localeCompare(b[1].name);
        } else {
          const descRoleOrder: Record<string, number> = {
            'member': 1,
            'coleader': 2,
            'leader': 3
          };
          const orderA = descRoleOrder[a[1].role] || 99;
          const orderB = descRoleOrder[b[1].role] || 99;
          if (orderA !== orderB) return orderA - orderB;
          return b[1].name.localeCompare(a[1].name);
        }
      } else if (sortConfig.key.startsWith('eq.')) {
        // Equipment sorting by category total
        const category = sortConfig.key.slice(3);
        const eqA = a[1].equipment?.[category] || { c23: 0, c24: 0 };
        const eqB = b[1].equipment?.[category] || { c23: 0, c24: 0 };
        const totalA = (Number(eqA.c23) || 0) + (Number(eqA.c24) || 0);
        const totalB = (Number(eqB.c23) || 0) + (Number(eqB.c24) || 0);
        if (totalA !== totalB) {
          return sortConfig.order === 'asc' ? totalA - totalB : totalB - totalA;
        }
        return getTieBreak();
      } else {
        // Costume sorting
        const costumeId = sortConfig.key;
        const levelA = a[1].records[costumeId]?.level ?? -1;
        const levelB = b[1].records[costumeId]?.level ?? -1;

        if (levelA !== levelB) {
          return sortConfig.order === 'asc' ? levelA - levelB : levelB - levelA;
        }
        return getTieBreak();
      }
    });
};

export const getSortedCostumes = (costumesData: Record<string, any>, charactersData: Record<string, any>) => {
  return Object.values(costumesData).sort((a, b) => {
    const charA = charactersData[a.characterId];
    const charB = charactersData[b.characterId];

    // Handle cases where a character might not exist for a costume
    if (!charA && !charB) return 0; // Both are orphaned, treat as equal
    if (!charA) return 1; // Orphaned 'a' goes to the end
    if (!charB) return -1; // Orphaned 'b' goes to the end

    // 1. Prioritize 'isNew' costumes
    if (a.isNew && !b.isNew) return -1;
    if (!a.isNew && b.isNew) return 1;

    // 2. Sort by character order
    if (charA.orderNum !== charB.orderNum) {
      return charA.orderNum - charB.orderNum;
    }

    // 3. Sort by costume order
    return (a.orderNum ?? 999) - (b.orderNum ?? 999);
  });
};

export const getSortedCharacters = (charactersData: Record<string, any>, costumesData: Record<string, any>) => {
  return Object.values(charactersData).sort((a, b) => {
    const aHasNew = Object.values(costumesData).some(c => c.characterId === a.id && c.isNew);
    const bHasNew = Object.values(costumesData).some(c => c.characterId === b.id && c.isNew);
    if (aHasNew && !bHasNew) return -1;
    if (!aHasNew && bHasNew) return 1;
    return (a.orderNum ?? 999) - (b.orderNum ?? 999);
  });
};

export const getSortedGuilds = (
  guildsData: Record<string, any>,
  canSeeAllGuilds: boolean,
  userGuildRoles: string[]
) => {
  // userGuildRoles 是 profiles.user_guilds（公會「名稱」的逗號清單）。
  // 一般成員只會看到自己所屬的公會；管理者（canSeeAllGuilds）看到全部。
  const allowedNames = new Set(
    (userGuildRoles || []).map(name => String(name).trim().toLowerCase()).filter(Boolean)
  );

  const guildsToDisplay = (Object.entries(guildsData) as [string, any][])
    .filter(([, guild]) =>
      canSeeAllGuilds || allowedNames.has(String(guild?.name ?? '').trim().toLowerCase())
    );

  return guildsToDisplay
    .sort((a, b) => {
      const tierA = a[1].tier || 99;
      const tierB = b[1].tier || 99;
      if (tierA !== tierB) return tierA - tierB;
      const orderA = a[1].orderNum || 99;
      const orderB = b[1].orderNum || 99;
      return orderA - orderB;
    });
};
