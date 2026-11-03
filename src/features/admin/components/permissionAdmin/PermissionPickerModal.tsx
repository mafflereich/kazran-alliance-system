import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@/shared/lib/permissions';
import PickerModal, { type PickerFilter, type PickerOption } from './PickerModal';
import {
  DOMAIN_LABELS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_LABELS,
  permissionDescription,
  permissionLabel,
} from './shared';

interface PermissionPickerModalProps {
  isOpen: boolean;
  selectedPermission?: string;
  onSelect: (permission: string) => void;
  onClose: () => void;
}

/**
 * 選擇要例外開／關的權限。
 *
 * 原本是一個 31 項的 <select>，只能看到 `raid.season.manage` 這種英文 key。
 * 這裡改成可搜尋的清單：顯示中文名稱＋白話說明＋原始 key，並依權限分類
 * （頁面／裝備／成員／聯合戰…）分組與篩選。
 */
export default function PermissionPickerModal({
  isOpen,
  selectedPermission,
  onSelect,
  onClose,
}: PermissionPickerModalProps) {
  const { i18n } = useTranslation(['admin', 'translation']);
  const isZh = i18n.language.startsWith('zh');

  const options = useMemo<PickerOption[]>(
    () =>
      PERMISSIONS.map(permission => {
        const zhLabel = PERMISSION_LABELS[permission.key]?.zh ?? permission.key;
        const enLabel = PERMISSION_LABELS[permission.key]?.en ?? permission.key;

        return {
          id: permission.key,
          label: isZh ? zhLabel : enLabel,
          sublabel: `${permission.key}${permission.needsGuild ? (isZh ? ' · 需要指定公會' : ' · guild required') : ''}`,
          description: permissionDescription(permission.key, isZh),
          group: DOMAIN_LABELS[permission.domain]?.[isZh ? 'zh' : 'en'] ?? permission.domain,
          searchText: [
            zhLabel,
            enLabel,
            PERMISSION_DESCRIPTIONS[permission.key]?.zh,
            PERMISSION_DESCRIPTIONS[permission.key]?.en,
            permission.domain,
          ]
            .filter(Boolean)
            .join(' '),
          filterValues: { domain: permission.domain },
        };
      }),
    [isZh],
  );

  const filters = useMemo<PickerFilter[]>(
    () => [
      {
        id: 'domain',
        label: isZh ? '全部類別' : 'All categories',
        options: Object.entries(DOMAIN_LABELS).map(([domain, labels]) => ({
          value: domain,
          label: isZh ? labels.zh : labels.en,
        })),
      },
    ],
    [isZh],
  );

  return (
    <PickerModal
      isOpen={isOpen}
      title={isZh ? '選擇權限' : 'Select permission'}
      hint={
        isZh
          ? '每一項都有白話說明；可以用中文名稱、英文名稱或權限代碼搜尋。'
          : 'Each permission has a plain-language description; search by name or key.'
      }
      items={options}
      selectedId={selectedPermission}
      filters={filters}
      searchPlaceholder={isZh ? '搜尋權限（例如：賽季、裝備、raid）…' : 'Search permissions (e.g. season, equipment)…'}
      emptyText={isZh ? '找不到符合的權限。' : 'No matching permission.'}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}
