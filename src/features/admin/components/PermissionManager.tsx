import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, KeyRound, ListChecks, UserCog } from 'lucide-react';
import PermissionMatrixTab from './permissionAdmin/PermissionMatrixTab';
import PermissionOverridesTab from './permissionAdmin/PermissionOverridesTab';
import PermissionPreviewTab from './permissionAdmin/PermissionPreviewTab';
import PermissionAuditTab from './permissionAdmin/PermissionAuditTab';

type Tab = 'matrix' | 'overrides' | 'preview' | 'audit';

export default function PermissionManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const [tab, setTab] = useState<Tab>('matrix');

  const tabButton = (id: Tab, icon: React.ReactNode, text: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
        tab === id
          ? 'bg-amber-600 text-white shadow-sm'
          : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600'
      }`}
    >
      {icon}
      {text}
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100">
          {t('permissions.title', '權限（v2）')}
        </h3>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {t(
            'permissions.subtitle',
            '角色 × 權限是唯一真相；頁面與 API 都讀同一張 role_grants。admin 一律放行。',
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabButton('matrix', <ListChecks className="w-4 h-4" />, t('permissions.tab_matrix', '角色權限'))}
        {tabButton('overrides', <UserCog className="w-4 h-4" />, t('permissions.tab_overrides', '例外授權'))}
        {tabButton('preview', <Eye className="w-4 h-4" />, t('permissions.tab_preview', '預覽視角'))}
        {tabButton('audit', <KeyRound className="w-4 h-4" />, t('permissions.tab_audit', '稽核'))}
      </div>

      {tab === 'matrix' && <PermissionMatrixTab />}
      {tab === 'overrides' && <PermissionOverridesTab />}
      {tab === 'preview' && <PermissionPreviewTab />}
      {tab === 'audit' && <PermissionAuditTab />}
    </div>
  );
}
