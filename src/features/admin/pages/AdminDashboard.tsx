import React, { useState } from 'react';
import { useAppContext } from '@/store';
import { Shield, Sword, Wand2, Key, Archive, Settings, AlertCircle, Lock } from 'lucide-react';
import { TabButton } from '../components/TabButton';
import SinglePasswordUpdate from '../components/SinglePasswordUpdate';
import BulkPasswordUpdate from '../components/BulkPasswordUpdate';
import ArchivedMembersManager from '../components/ArchivedMembersManager';
import AccessControlManager from '../components/AccessControlManager';
import GuildsManager from '../components/GuildsManager';
import CostumesManager from '../components/CostumesManager';
import ToolsManager from '../components/ToolsManager';
import SettingsManager from '../components/SettingsManager';
import { useTranslation } from 'react-i18next';
import { logEvent } from '@/analytics';

export default function AdminDashboard() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, currentUser } = useAppContext();
  const [activeTab, setActiveTab] = useState<'guilds' | 'costumes' | 'tools' | 'passwords' | 'archived' | 'settings' | 'access'>('guilds');

  const userRole = currentUser ? db.users[currentUser]?.role : null;

  const handleTabChange = (tab: 'guilds' | 'costumes' | 'tools' | 'passwords' | 'archived' | 'settings' | 'access') => {
    logEvent('AdminDashboard', 'Switch Tab', tab);
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-900 flex flex-col">
      <main className="max-w-6xl mx-auto p-6 flex-1 w-full">
        <div className="mb-4 flex gap-4 text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-widest">
          <span>{t('common.guild')}: {Object.keys(db.guilds).length}</span>
          <span>{t('common.member')}: {Object.values(db.members).filter(m => m.status === 'active').length}</span>
          <span>{t('common.character')}: {Object.keys(db.characters).length}</span>
          <span>{t('common.costume')}: {Object.keys(db.costumes).length}</span>
          <span>{t('common.user')}: {Object.keys(db.users).length}</span>
        </div>
        <div className="flex gap-4 mb-6 border-b border-stone-300 dark:border-stone-700 pb-2 overflow-x-auto">
          <TabButton active={activeTab === 'guilds'} onClick={() => handleTabChange('guilds')} icon={<Shield />} label={t('nav.guild_management')} />
          <TabButton active={activeTab === 'costumes'} onClick={() => handleTabChange('costumes')} icon={<Sword />} label={t('nav.costume_database')} />
          <TabButton active={activeTab === 'archived'} onClick={() => handleTabChange('archived')} icon={<Archive />} label={t('nav.archived_members')} />
          {userRole !== 'manager' && (
            <>
              <TabButton active={activeTab === 'passwords'} onClick={() => handleTabChange('passwords')} icon={<Key />} label={t('nav.change_password')} />
              <TabButton active={activeTab === 'tools'} onClick={() => handleTabChange('tools')} icon={<Wand2 />} label={t('nav.tools')} />
              <TabButton active={activeTab === 'access'} onClick={() => handleTabChange('access')} icon={<Lock />} label={t('nav.access_control')} />
              <TabButton active={activeTab === 'settings'} onClick={() => handleTabChange('settings')} icon={<Settings />} label={t('nav.settings')} />
            </>
          )}
        </div>

        <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 p-6">
          {activeTab === 'guilds' && <GuildsManager />}
          {activeTab === 'costumes' && <CostumesManager />}
          {activeTab === 'archived' && <ArchivedMembersManager />}
          {activeTab === 'passwords' && userRole !== 'manager' && (
            <div className="space-y-12">
              <div className="bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-400 dark:border-amber-600 p-4 rounded-r-lg">
                <div className="flex">
                  <div className="py-1"><AlertCircle className="h-5 w-5 text-amber-500 mr-3" /></div>
                  <div>
                    <p className="font-bold text-amber-800 dark:text-amber-200">{t('common.info')}</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      {t('guilds.auth_account_notice')} <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">"new_guild_name@kazran.com"</code>。
                    </p>
                  </div>
                </div>
              </div>

              <section>
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-stone-800 dark:text-stone-200">{t('passwords.single_update')}</h3>
                  <p className="text-sm text-stone-500 dark:text-stone-400">{t('passwords.single_update_desc')}</p>
                </div>
                <SinglePasswordUpdate />
              </section>

              <div className="border-t border-stone-100 dark:border-stone-700 pt-12">
                <section>
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-stone-800 dark:text-stone-200">{t('passwords.bulk_update')}</h3>
                    <p className="text-sm text-stone-500 dark:text-stone-400">{t('passwords.bulk_update_desc')}</p>
                  </div>
                  <BulkPasswordUpdate />
                </section>
              </div>
            </div>
          )}
          {activeTab === 'tools' && userRole !== 'manager' && <ToolsManager />}
          {activeTab === 'access' && userRole !== 'manager' && <AccessControlManager />}
          {activeTab === 'settings' && userRole !== 'manager' && <SettingsManager />}
        </div>
      </main>
    </div>
  );
}
