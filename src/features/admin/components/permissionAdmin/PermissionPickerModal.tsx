import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PERMISSIONS,
  PERMISSION_ACCESS_LABELS,
  PERMISSION_DOMAIN_LABELS,
  PERMISSION_DOMAIN_ORDER,
  PERMISSION_ENFORCEMENT_LABELS,
  isPermissionWired,
} from '@/shared/lib/permissions';
import PickerModal, { type PickerFilter, type PickerOption } from './PickerModal';
import { permissionDescription, permissionLabel } from './shared';

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
        const isWired = isPermissionWired(permission.key);
        const accessLabel = PERMISSION_ACCESS_LABELS[permission.access][isZh ? 'zh' : 'en'];
        const wiredLabel = isWired
          ? isZh
            ? '已接線'
            : 'Wired'
          : PERMISSION_ENFORCEMENT_LABELS.none[isZh ? 'zh' : 'en'];

        return {
          id: permission.key,
          label: permissionLabel(permission.key, isZh),
          sublabel: [
            permission.key,
            accessLabel,
            permission.needsGuild ? (isZh ? '需指定公會' : 'guild required') : null,
          ]
            .filter(Boolean)
            .join(' · '),
          description: permissionDescription(permission.key, isZh),
          badge: wiredLabel,
          group: PERMISSION_DOMAIN_LABELS[permission.domain][isZh ? 'zh' : 'en'],
          searchText: [
            permission.label.zh,
            permission.label.en,
            permission.description.zh,
            permission.description.en,
            permission.domain,
            permission.access,
            accessLabel,
            isWired ? wiredLabel : '',
          ]
            .filter(Boolean)
            .join(' '),
          filterValues: {
            domain: permission.domain,
            access: permission.access,
            wired: isWired ? 'wired' : 'unwired',
          },
        };
      }),
    [isZh],
  );

  const filters = useMemo<PickerFilter[]>(
    () => [
      {
        id: 'domain',
        label: isZh ? '全部分類' : 'All categories',
        shortLabel: isZh ? '分類' : 'Category',
        options: PERMISSION_DOMAIN_ORDER.map(domain => ({
          value: domain,
          label: PERMISSION_DOMAIN_LABELS[domain][isZh ? 'zh' : 'en'],
        })),
      },
      {
        id: 'access',
        label: isZh ? '讀取＋操作' : 'Read + write',
        shortLabel: isZh ? '類型' : 'Type',
        options: [
          { value: 'read', label: PERMISSION_ACCESS_LABELS.read[isZh ? 'zh' : 'en'] },
          { value: 'write', label: PERMISSION_ACCESS_LABELS.write[isZh ? 'zh' : 'en'] },
        ],
      },
      {
        id: 'wired',
        label: isZh ? '全部狀態' : 'All status',
        shortLabel: isZh ? '狀態' : 'Status',
        options: [
          { value: 'wired', label: isZh ? '已接線' : 'Wired' },
          { value: 'unwired', label: isZh ? '尚未接線' : 'Not wired' },
        ],
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
