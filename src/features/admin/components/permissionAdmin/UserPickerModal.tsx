import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/store';
import PickerModal, { type PickerFilter, type PickerOption } from './PickerModal';
import { roleLabel, ROLE_ORDER, type ProfileRow } from './shared';

interface UserPickerModalProps {
  isOpen: boolean;
  profiles: ProfileRow[];
  selectedAuthId?: string;
  onSelect: (profile: ProfileRow) => void;
  onClose: () => void;
  title?: string;
}

const NAME_PREVIEW_LIMIT = 3;

/**
 * 選擇「要例外授權的帳號」。
 *
 * 資料來源是 profiles（有 auth_id 才能寫 user_grants），但顯示時會把
 * profiles.id（逗號分隔的遊戲成員 id）對到 db.members 的遊戲名稱與公會，
 * 所以管理員用「遊戲 ID」也搜得到人；清單再用公會與角色縮小範圍。
 */
export default function UserPickerModal({
  isOpen,
  profiles,
  selectedAuthId,
  onSelect,
  onClose,
  title,
}: UserPickerModalProps) {
  const { i18n } = useTranslation(['admin', 'translation']);
  const isZh = i18n.language.startsWith('zh');
  const { db } = useAppContext();

  const options = useMemo<PickerOption[]>(() => {
    return profiles.map(profile => {
      const memberIds = (profile.id ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

      const memberNames = Array.from(
        new Set(
          memberIds
            .map(memberId => db.members[memberId]?.name)
            .filter((name): name is string => !!name),
        ),
      );

      const guildIds = Array.from(
        new Set(
          memberIds
            .map(memberId => db.members[memberId]?.guildId)
            .filter((guildId): guildId is string => !!guildId),
        ),
      );

      const guildNamesFromMembers = Array.from(
        new Set(guildIds.map(guildId => db.guilds[guildId]?.name).filter((name): name is string => !!name)),
      );

      // profiles.user_guilds 是 DB trigger 同步的公會名稱（逗號分隔），
      // 成員尚未綁定時仍可用它顯示／篩選。
      const fallbackGuildNames = (profile.user_guilds ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

      const displayGuildNames = guildNamesFromMembers.length > 0 ? guildNamesFromMembers : fallbackGuildNames;
      const filterGuildIds =
        guildIds.length > 0
          ? guildIds
          : Object.entries(db.guilds)
              .filter(([, guild]) => fallbackGuildNames.includes(guild.name))
              .map(([guildId]) => guildId);

      const label =
        profile.display_name ||
        (profile.discord_username ? `@${profile.discord_username}` : '') ||
        profile.auth_id.slice(0, 8);

      const memberPreview =
        memberNames.length > 0
          ? memberNames.slice(0, NAME_PREVIEW_LIMIT).join(isZh ? '、' : ', ') +
            (memberNames.length > NAME_PREVIEW_LIMIT
              ? isZh
                ? ` 等 ${memberNames.length} 位`
                : ` +${memberNames.length - NAME_PREVIEW_LIMIT} more`
              : '')
          : isZh
            ? '尚未綁定遊戲成員'
            : 'No bound game member';

      const sublabelParts = [
        `${isZh ? '遊戲成員' : 'Members'}：${memberPreview}`,
        displayGuildNames.length > 0
          ? `${isZh ? '公會' : 'Guilds'}：${displayGuildNames.join(isZh ? '、' : ', ')}`
          : '',
        profile.discord_username ? `@${profile.discord_username}` : '',
      ].filter(Boolean);

      return {
        id: profile.auth_id,
        label,
        sublabel: sublabelParts.join(' · '),
        group: displayGuildNames[0] ?? (isZh ? '未綁定公會' : 'No guild'),
        badge: roleLabel(profile.user_role, isZh),
        searchText: [
          profile.auth_id,
          profile.discord_username,
          profile.user_guilds,
          memberNames.join(' '),
          displayGuildNames.join(' '),
        ]
          .filter(Boolean)
          .join(' '),
        filterValues: {
          guild: filterGuildIds.join('|'),
          role: profile.user_role ?? '',
        },
      };
    }).sort((a, b) => {
      // 依公會分組排序，讓群組標題只出現一次（不是每列都重插一次）
      const groupDiff = (a.group ?? '').localeCompare(b.group ?? '');
      return groupDiff !== 0 ? groupDiff : a.label.localeCompare(b.label);
    });
  }, [profiles, db.members, db.guilds, isZh]);

  const filters = useMemo<PickerFilter[]>(() => {
    const guildOptions = Object.entries(db.guilds)
      .sort((a, b) => {
        const tierDiff = (a[1].tier ?? 99) - (b[1].tier ?? 99);
        if (tierDiff !== 0) return tierDiff;
        const orderDiff = (a[1].orderNum ?? 99) - (b[1].orderNum ?? 99);
        if (orderDiff !== 0) return orderDiff;
        return a[1].name.localeCompare(b[1].name);
      })
      .map(([guildId, guild]) => ({
        value: guildId,
        label: guild.tier ? `${guild.name}（T${guild.tier}）` : guild.name,
      }));

    const roleValues = Array.from(new Set(profiles.map(profile => profile.user_role).filter((role): role is string => !!role)));
    roleValues.sort((a, b) => {
      const indexA = ROLE_ORDER.indexOf(a);
      const indexB = ROLE_ORDER.indexOf(b);
      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });

    return [
      {
        id: 'guild',
        label: isZh ? '全部公會' : 'All guilds',
        options: guildOptions,
      },
      {
        id: 'role',
        label: isZh ? '全部角色' : 'All roles',
        options: roleValues.map(role => ({ value: role, label: roleLabel(role, isZh) })),
      },
    ];
  }, [db.guilds, profiles, isZh]);

  return (
    <PickerModal
      isOpen={isOpen}
      title={title ?? (isZh ? '選擇使用者' : 'Select user')}
      hint={
        isZh
          ? '可以搜尋 Discord 名稱、遊戲成員名稱或公會；清單依公會分組。'
          : 'Search by Discord name, in-game member name or guild; grouped by guild.'
      }
      items={options}
      selectedId={selectedAuthId}
      filters={filters}
      searchPlaceholder={isZh ? '輸入 Discord / 遊戲成員 / 公會名稱…' : 'Discord, member or guild name…'}
      emptyText={isZh ? '找不到符合的帳號（只有登入過且已建立 profile 的帳號能被授權）。' : 'No matching account.'}
      onSelect={id => {
        const profile = profiles.find(item => item.auth_id === id);
        if (profile) onSelect(profile);
      }}
      onClose={onClose}
    />
  );
}
