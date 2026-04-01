import React, { useState } from 'react';
import { useAppContext } from '@/store';
import { Shield, Sword, Wand2, Archive, Settings, AlertCircle, Lock, Link as LinkIcon, Activity } from 'lucide-react';
import { TabButton } from '../components/TabButton';
import ArchivedMembersManager from '../components/ArchivedMembersManager';
import AccessControlManager from '../components/AccessControlManager';
import GuildsManager from '../components/GuildsManager';
import CostumesManager from '../components/CostumesManager';
import ToolsManager from '../components/ToolsManager';
import SettingsManager from '../components/SettingsManager';
import BindingManager from '../components/BindingManager';
import SystemLogsManager from '../components/SystemLogsManager';
import { useTranslation } from 'react-i18next';
import { logEvent } from '@/analytics';

export default function AdminDashboard() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, userRole } = useAppContext();
  const [activeTab, setActiveTab] = useState<'guilds' | 'costumes' | 'tools' | 'archived' | 'settings' | 'access' | 'binding' | 'system_logs'>('guilds');

  const handleTabChange = (tab: 'guilds' | 'costumes' | 'tools' | 'archived' | 'settings' | 'access' | 'binding' | 'system_logs') => {
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
        </div>
        <div className="flex gap-4 mb-6 border-b border-stone-300 dark:border-stone-700 pb-2 overflow-x-auto">
          <TabButton active={activeTab === 'guilds'} onClick={() => handleTabChange('guilds')} icon={<Shield />} label={t('nav.guild_management')} />
          <TabButton active={activeTab === 'costumes'} onClick={() => handleTabChange('costumes')} icon={<Sword />} label={t('nav.costume_database')} />
          {userRole !== 'manager' && (
            <TabButton active={activeTab === 'binding'} onClick={() => handleTabChange('binding')} icon={<LinkIcon className="w-4 h-4" />} label={t('nav.identity_binding')} />
          )}
          <TabButton active={activeTab === 'archived'} onClick={() => handleTabChange('archived')} icon={<Archive />} label={t('nav.archived_members')} />
          {userRole !== 'manager' && (
            <>
              <TabButton active={activeTab === 'tools'} onClick={() => handleTabChange('tools')} icon={<Wand2 />} label={t('nav.tools')} />
              <TabButton active={activeTab === 'access'} onClick={() => handleTabChange('access')} icon={<Lock />} label={t('nav.access_control')} />
              <TabButton active={activeTab === 'system_logs'} onClick={() => handleTabChange('system_logs')} icon={<Activity />} label={t('nav.system_logs', '系統日誌')} />
              <TabButton active={activeTab === 'settings'} onClick={() => handleTabChange('settings')} icon={<Settings />} label={t('nav.settings')} />
            </>
          )}
        </div>

        <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 p-6">
          {activeTab === 'guilds' && <GuildsManager />}
          {activeTab === 'costumes' && <CostumesManager />}
          {activeTab === 'binding' && userRole !== 'manager' && <BindingManager />}
          {activeTab === 'archived' && <ArchivedMembersManager />}
          {activeTab === 'system_logs' && userRole !== 'manager' && <SystemLogsManager />}
          {activeTab === 'tools' && userRole !== 'manager' && <ToolsManager />}
          {activeTab === 'access' && userRole !== 'manager' && <AccessControlManager />}
          {activeTab === 'settings' && userRole !== 'manager' && <SettingsManager />}
        </div>
      </main>
    </div>
  );
}
