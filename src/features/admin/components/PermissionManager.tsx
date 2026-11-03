import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, KeyRound, ListChecks, ShieldAlert, UserCog } from 'lucide-react';
import PermissionMatrixTab from './permissionAdmin/PermissionMatrixTab';
import PermissionOverridesTab from './permissionAdmin/PermissionOverridesTab';
import AccountHealthTab from './permissionAdmin/AccountHealthTab';
import PermissionPreviewTab from './permissionAdmin/PermissionPreviewTab';
import PermissionAuditTab from './permissionAdmin/PermissionAuditTab';
import { useCan } from '@/shared/lib/useCan';

type Tab = 'matrix' | 'overrides' | 'health' | 'preview' | 'audit';

export default function PermissionManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { can } = useCan();
  const canAudit = can('admin.logs.read');
  const canHealth = can('admin.identity.manage') || can('admin.role.assign');

  const [tab, setTab] = useState<Tab>('matrix');

  useEffect(() => {
    if (tab === 'audit' && !canAudit) setTab('matrix');
    if (tab === 'health' && !canHealth) setTab('matrix');
  }, [tab, canAudit, canHealth]);

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
          {t('permissions.title', '權限設定')}
        </h3>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {t(
            'permissions.subtitle',
            '先用角色設定預設權限，再用例外授權單獨開放或關閉某個人的權限；頁面與 API 都讀同一套設定，admin 一律放行。',
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabButton('matrix', <ListChecks className="w-4 h-4" />, t('permissions.tab_matrix', '角色權限'))}
        {tabButton('overrides', <UserCog className="w-4 h-4" />, t('permissions.tab_overrides', '例外授權'))}
        {canHealth && tabButton('health', <ShieldAlert className="w-4 h-4" />, t('permissions.tab_health', '帳號健檢'))}
        {tabButton('preview', <Eye className="w-4 h-4" />, t('permissions.tab_preview', '預覽視角'))}
        {canAudit && tabButton('audit', <KeyRound className="w-4 h-4" />, t('permissions.tab_audit', '稽核'))}
      </div>

      {tab === 'matrix' && <PermissionMatrixTab />}
      {tab === 'overrides' && <PermissionOverridesTab />}
      {tab === 'health' && canHealth && <AccountHealthTab />}
      {tab === 'preview' && <PermissionPreviewTab />}
      {tab === 'audit' && canAudit && <PermissionAuditTab />}
    </div>
  );
}
