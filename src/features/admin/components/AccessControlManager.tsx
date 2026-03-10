import { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '@/store';
import { Lock, Check, Users, Mail, Gamepad2, Trophy, AlertCircle, BookUser, Wrench, Save, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AccessControlManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, updateAccessControl } = useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  
  // Local state for unsaved changes
  const [localAccessControl, setLocalAccessControl] = useState<Record<string, ('member' | 'manager' | 'admin' | 'creator')[]>>({});

  const roles: ('member' | 'manager' | 'admin' | 'creator')[] = ['member', 'manager', 'admin', 'creator'];

  const pages = [
    { id: 'costume_list', label: t('header.costume_list'), icon: <Users className="w-5 h-5" /> },
    { id: 'application_mailbox', label: t('header.application_mailbox'), icon: <Mail className="w-5 h-5" /> },
    { id: 'arcade', label: t('header.arcade'), icon: <Gamepad2 className="w-5 h-5" /> },
    { id: 'alliance_raid_record', label: t('header.alliance_raid_record'), icon: <Trophy className="w-5 h-5" /> },
    { id: 'member_board', label: t('header.member_board', "Team Assign Board"), icon: <BookUser className="w-5 h-5" /> },
    { id: 'toolbox', label: t('header.toolbox_title', '小工具'), icon: <Wrench className="w-5 h-5" /> },
  ];

  const getDefaultRoles = (pageId: string): ('member' | 'manager' | 'admin' | 'creator')[] => {
    switch (pageId) {
      case 'costume_list': return ['member', 'manager', 'admin', 'creator'];
      case 'application_mailbox': return ['member', 'manager', 'admin', 'creator'];
      case 'arcade': return ['manager', 'admin', 'creator'];
      case 'alliance_raid_record': return ['creator'];
      case 'member_board': return ['manager', 'admin', 'creator'];
      case 'toolbox': return ['manager', 'admin', 'creator'];
      default: return ['creator', 'admin'];
    }
  };

  // Initialize local state from db
  useEffect(() => {
    const initialLocalState: Record<string, ('member' | 'manager' | 'admin' | 'creator')[]> = {};
    pages.forEach(page => {
      initialLocalState[page.id] = db.accessControl[page.id]?.roles || getDefaultRoles(page.id);
    });
    setLocalAccessControl(initialLocalState);
  }, [db.accessControl]);

  const hasChanges = useMemo(() => {
    for (const page of pages) {
      const dbRoles = db.accessControl[page.id]?.roles || getDefaultRoles(page.id);
      const localRoles = localAccessControl[page.id] || [];
      
      if (dbRoles.length !== localRoles.length) return true;
      
      // Check if arrays contain the same elements
      const dbSet = new Set(dbRoles);
      for (const role of localRoles) {
        if (!dbSet.has(role)) return true;
      }
    }
    return false;
  }, [db.accessControl, localAccessControl]);

  const handleToggle = (pageId: string, role: 'member' | 'manager' | 'admin' | 'creator') => {
    setLocalAccessControl(prev => {
      const currentRoles = prev[pageId] || [];
      let newRoles: ('member' | 'manager' | 'admin' | 'creator')[];

      if (currentRoles.includes(role)) {
        newRoles = currentRoles.filter(r => r !== role);
      } else {
        newRoles = [...currentRoles, role];
      }

      return {
        ...prev,
        [pageId]: newRoles
      };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      for (const pageId of Object.keys(localAccessControl)) {
        const dbRoles = db.accessControl[pageId]?.roles || getDefaultRoles(pageId);
        const localRoles = localAccessControl[pageId];
        
        // Only update if changed
        let isChanged = dbRoles.length !== localRoles.length;
        if (!isChanged) {
          const dbSet = new Set(dbRoles);
          for (const role of localRoles) {
            if (!dbSet.has(role)) {
              isChanged = true;
              break;
            }
          }
        }
        
        if (isChanged) {
          await updateAccessControl(pageId, localRoles);
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestore = () => {
    const initialLocalState: Record<string, ('member' | 'manager' | 'admin' | 'creator')[]> = {};
    pages.forEach(page => {
      initialLocalState[page.id] = db.accessControl[page.id]?.roles || getDefaultRoles(page.id);
    });
    setLocalAccessControl(initialLocalState);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-200 flex items-center gap-2">
          <Lock className="w-6 h-6 text-amber-600" />
          {t('nav.access_control')}
        </h2>
        <div className="flex gap-3">
          <button
            onClick={handleRestore}
            disabled={!hasChanges || isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" />
            {t('common.restore', '還原')}
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {t('common.save', '儲存')}
          </button>
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-400 dark:border-amber-600 p-4 rounded-r-lg mb-6">
        <div className="flex">
          <div className="py-1"><AlertCircle className="h-5 w-5 text-amber-500 mr-3" /></div>
          <div>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('access.notice')}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700">
              <th className="text-left py-4 px-4 text-stone-500 dark:text-stone-400 font-medium uppercase tracking-wider text-xs">
                {t('access.page')}
              </th>
              {roles.map(role => (
                <th key={role} className="text-center py-4 px-4 text-stone-500 dark:text-stone-400 font-medium uppercase tracking-wider text-xs">
                  {role.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {pages.map(page => {
              const currentRoles = localAccessControl[page.id] || [];
              return (
                <tr key={page.id} className="hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-stone-100 dark:bg-stone-800 rounded-lg text-stone-500 dark:text-stone-400">
                        {page.icon}
                      </div>
                      <span className="font-bold text-stone-800 dark:text-stone-200">{page.label}</span>
                    </div>
                  </td>
                  {roles.map(role => {
                    const isChecked = currentRoles.includes(role);
                    return (
                      <td key={role} className="py-4 px-4 text-center">
                        <div className="flex justify-center">
                          <button
                            onClick={() => handleToggle(page.id, role)}
                            disabled={isSaving}
                            className={`w-6 h-6 rounded border flex items-center justify-center transition-all ${isChecked
                              ? 'bg-amber-600 border-amber-600 text-white'
                              : 'border-stone-300 dark:border-stone-600 hover:border-amber-500'
                              }`}
                          >
                            {isChecked && <Check className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
