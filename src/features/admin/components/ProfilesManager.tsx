import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import IdentityBinding from './IdentityBinding';
import RoleSetting from './RoleSetting';

export default function ProfilesManager() {
  const { t } = useTranslation('admin');
  const [activeTab, setActiveTab] = useState<'binding' | 'role_setting'>('binding');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-stone-800 dark:text-stone-200">{t('binding.title')}</h2>
        <div className="flex bg-stone-100 dark:bg-stone-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('binding')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'binding'
                ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            {t('binding.tab_identity_binding', 'Identity Binding')}
          </button>
          <button
            onClick={() => setActiveTab('role_setting')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'role_setting'
                ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            {t('role_setting.tab_title', 'Role Setting')}
          </button>
        </div>
      </div>

      {activeTab === 'binding' && (
        <IdentityBinding />
      )}
      {activeTab === 'role_setting' && (
        <RoleSetting />
      )}
    </div>
  );
}