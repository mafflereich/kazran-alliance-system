import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/store';
import PickerModal, { type PickerFilter, type PickerOption } from './PickerModal';

interface GuildPickerModalProps {
  isOpen: boolean;
  selectedGuildId?: string;
  onSelect: (guildId: string) => void;
  onClose: () => void;
}

const GLOBAL_OPTION_ID = '';

/**
 * 選擇例外授權的適用公會。
 *
 * 原本要管理員自己貼 guild id（UUID），根本沒人記得住；這裡改成用公會名稱
 * 搜尋，並顯示 Tier 與 id 方便核對，也可以直接選「全站」。
 */
export default function GuildPickerModal({
  isOpen,
  selectedGuildId,
  onSelect,
  onClose,
}: GuildPickerModalProps) {
  const { i18n } = useTranslation(['admin', 'translation']);
  const isZh = i18n.language.startsWith('zh');
  const { db } = useAppContext();

  const sortedGuilds = useMemo(
    () =>
      Object.entries(db.guilds).sort((a, b) => {
        const tierDiff = (a[1].tier ?? 99) - (b[1].tier ?? 99);
        if (tierDiff !== 0) return tierDiff;
        const orderDiff = (a[1].orderNum ?? 99) - (b[1].orderNum ?? 99);
        if (orderDiff !== 0) return orderDiff;
        return a[1].name.localeCompare(b[1].name);
      }),
    [db.guilds],
  );

  const options = useMemo<PickerOption[]>(() => {
    const globalOption: PickerOption = {
      id: GLOBAL_OPTION_ID,
      label: isZh ? '全站（所有公會）' : 'Global (all guilds)',
      sublabel: isZh
        ? '不限定公會：這個例外授權對全站生效。'
        : 'No guild limit: this override applies everywhere.',
      group: isZh ? '全站' : 'Global',
      searchText: 'global 全站 all guilds',
      filterValues: { tier: '' },
    };

    const guildOptions = sortedGuilds.map<PickerOption>(([guildId, guild]) => ({
      id: guildId,
      label: guild.name,
      sublabel: `${guild.tier ? `Tier ${guild.tier}` : isZh ? '未設定 Tier' : 'No tier'} · ID: ${guildId}`,
      group: guild.tier ? `Tier ${guild.tier}` : isZh ? '未設定 Tier' : 'No tier',
      badge: guild.serial ? `#${guild.serial}` : undefined,
      searchText: [guild.name, guild.username, guild.serial, guildId].filter(Boolean).join(' '),
      filterValues: { tier: guild.tier ? String(guild.tier) : '' },
    }));

    return [globalOption, ...guildOptions];
  }, [sortedGuilds, isZh]);

  const tierFilter = useMemo<PickerFilter[]>(() => {
    const tiers = Array.from(new Set(sortedGuilds.map(([, guild]) => guild.tier).filter((tier): tier is number => !!tier))).sort(
      (a, b) => a - b,
    );

    return [
      {
        id: 'tier',
        label: isZh ? '全部 Tier' : 'All tiers',
        options: tiers.map(tier => ({ value: String(tier), label: `Tier ${tier}` })),
      },
    ];
  }, [sortedGuilds, isZh]);

  return (
    <PickerModal
      isOpen={isOpen}
      title={isZh ? '選擇公會' : 'Select guild'}
      hint={isZh ? '用公會名稱搜尋，或用 Tier 篩選；選「全站」表示不限定公會。' : 'Search by guild name or filter by tier.'}
      items={options}
      selectedId={selectedGuildId ?? GLOBAL_OPTION_ID}
      filters={tierFilter}
      searchPlaceholder={isZh ? '輸入公會名稱或 ID…' : 'Guild name or ID…'}
      emptyText={isZh ? '找不到符合的公會。' : 'No matching guild.'}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}
