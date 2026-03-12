import React, { useState, useRef } from 'react';
import { useAppContext } from '@/store';
import { RefreshCw, Trash2, Save, Download, Upload, AlertCircle, Wand2 } from 'lucide-react';
import ConfirmModal from '@shared/ui/ConfirmModal';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/shared/api/supabase';
import { useRestoreDiff } from '../hooks/useRestoreDiff';
import RestorePreviewModal from './RestorePreviewModal';

export default function ToolsManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, addMember, deleteMember, updateMember, fetchAllMembers, archiveMember, showToast } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isDiffing,
    isRestoring,
    diffSummary,
    isModalOpen,
    calculateDiff,
    executeRestore,
    cancelRestore
  } = useRestoreDiff();

  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    onConfirm: () => void;
    isDanger: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    isDanger: false
  });

  const [migrationModal, setMigrationModal] = useState<{
    isOpen: boolean;
    added: { name: string, toGuild: string, role: string, toGuildId: string }[];
    migrated: { id: string, name: string, fromGuild: string, toGuild: string, role: string, toGuildId: string }[];
    archived: { id: string, name: string, fromGuild: string, fromGuildId: string }[];
  }>({
    isOpen: false,
    added: [],
    migrated: [],
    archived: []
  });

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));
  const closeMigrationModal = () => setMigrationModal(prev => ({ ...prev, isOpen: false }));

  const handleAutoTransfer = async () => {
    setIsProcessing(true);
    try {
      await fetchAllMembers();

      const macroId = `AKfycbyvqpgrZ_BMU94i6llQF9HjP89y8yAS0EyRsPUT1fncmsdZg-8GeyVyUHp0DunJUwezqQ`;
      const response = await fetch(`https://script.google.com/macros/s/${macroId}/exec`, {
        method: "GET",
        mode: "cors",
      });
      const { guildList, guildLeaderList } = (await response.json()).data;

      const guildNameList = Object.keys(guildList);
      const activeMemberList: string[] = [];
      const memberList = Object.values(db.members);
      const guildListInDB = Object.values(db.guilds);

      const added: { name: string, toGuild: string, role: string, toGuildId: string }[] = [];
      const migrated: { id: string, name: string, fromGuild: string, toGuild: string, role: string, toGuildId: string }[] = [];
      const archived: { id: string, name: string, fromGuild: string, fromGuildId: string }[] = [];

      for (const guildName of guildNameList) {
        const memberNames = guildList[guildName];
        const guildId = guildListInDB.find((guild) => guild.name === guildName)?.id;

        if (!guildId) continue;

        for (let memberName of memberNames) {
          memberName = memberName.replace(/@/, "");
          const member = memberList.find((m) => m.name === memberName);
          const role = guildLeaderList[`@${memberName}`]?.replaceAll(/<|>/g, "") ?? "member";

          if (!member && !memberName.match(/Vacancy/) && memberName) {
            added.push({ name: memberName, toGuild: guildName, role, toGuildId: guildId });
          } else if (member && guildId !== member.guildId) {
            const fromGuildName = guildListInDB.find(g => g.id === member.guildId)?.name || t('common.unknown');
            migrated.push({ id: member.id, name: memberName, fromGuild: fromGuildName, toGuild: guildName, role, toGuildId: guildId });
          }

          if (memberName && !memberName.match(/Vacancy/)) {
            activeMemberList.push(memberName);
          }
        }
      }

      const membersToArchive = memberList.filter((member) => !activeMemberList.includes(member.name) && member.status !== 'archived');

      for (const member of membersToArchive) {
        const fromGuildName = guildListInDB.find(g => g.id === member.guildId)?.name || t('common.unknown');
        archived.push({ id: member.id, name: member.name, fromGuild: fromGuildName, fromGuildId: member.guildId });
      }

      setMigrationModal({
        isOpen: true,
        added,
        migrated,
        archived
      });
    } catch (error) {
      console.error("Auto transfer failed:", error);
      showToast(t('tools.auto_transfer_failed'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const executeMigration = async () => {
    setIsProcessing(true);
    try {
      for (const item of migrationModal.added) {
        await addMember(item.toGuildId, item.name, item.role as any, "");
      }
      for (const item of migrationModal.migrated) {
        await updateMember(item.id, { guildId: item.toGuildId, role: item.role as any });
      }
      for (const item of migrationModal.archived) {
        await archiveMember(item.id, item.fromGuildId, t('tools.not_in_list_reason'));
      }
      showToast(t('tools.auto_transfer_success'), 'success');
      closeMigrationModal();
    } catch (error) {
      console.error("Migration execution failed:", error);
      showToast(t('tools.auto_transfer_failed'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveDuplicates = () => {
    setConfirmModal({
      isOpen: true,
      title: t('tools.remove_duplicates'),
      message: t('tools.confirm_remove_duplicates'),
      isDanger: true,
      onConfirm: async () => {
        setIsProcessing(true);
        closeConfirmModal();
        const membersByGuild: Record<string, any[]> = {};
        for (const memberId in db.members) {
          const member = db.members[memberId];
          if (!membersByGuild[member.guildId]) {
            membersByGuild[member.guildId] = [];
          }
          membersByGuild[member.guildId].push({ id: memberId, ...member });
        }

        for (const guildId in membersByGuild) {
          const members = membersByGuild[guildId];
          const membersByName: Record<string, any[]> = {};
          for (const member of members) {
            if (!membersByName[member.name]) {
              membersByName[member.name] = [];
            }
            membersByName[member.name].push(member);
          }

          for (const name in membersByName) {
            const duplicateMembers = membersByName[name];
            if (duplicateMembers.length > 1) {
              const membersWithCostumes = duplicateMembers.filter(m => Object.keys(m.records || {}).length > 0);
              if (membersWithCostumes.length <= 1) {
                const membersToDelete = duplicateMembers.filter(m => Object.keys(m.records || {}).length === 0);
                if (membersWithCostumes.length === 1) {
                  for (const member of membersToDelete) {
                    await deleteMember(member.id);
                  }
                } else {
                  for (let i = 1; i < membersToDelete.length; i++) {
                    await deleteMember(membersToDelete[i].id);
                  }
                }
              } else {
                const membersByCostume: Record<string, any[]> = {};
                for (const member of membersWithCostumes) {
                  const costumeKey = JSON.stringify(member.records);
                  if (!membersByCostume[costumeKey]) {
                    membersByCostume[costumeKey] = [];
                  }
                  membersByCostume[costumeKey].push(member);
                }

                for (const costumeKey in membersByCostume) {
                  const sameCostumeMembers = membersByCostume[costumeKey];
                  for (let i = 1; i < sameCostumeMembers.length; i++) {
                    await deleteMember(sameCostumeMembers[i].id);
                  }
                }
              }
            }
          }
        }
        setIsProcessing(false);
      }
    });
  };

  const handleBackup = async () => {
    setIsProcessing(true);
    try {
      const tables = [
        'apply_mail',
        'characters',
        'costumes',
        'guilds',
        'member_notes',
        'members',
        'members_archive_history'
      ];
      
      const backupData: Record<string, any> = {};
      
      for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw error;
        backupData[table] = data;
      }

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupData, null, 2)
      )}`;
      const link = document.createElement("a");
      link.href = jsonString;
      link.download = `kazran_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } catch (error) {
      console.error("Backup failed:", error);
      showToast(t('backup.backup_failed'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRaidBackup = async () => {
    setIsProcessing(true);
    try {
      const tables = [
        'guild_raid_records',
        'member_raid_records',
        'raid_seasons'
      ];
      
      const backupData: Record<string, any> = {};
      
      for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw error;
        backupData[table] = data;
      }

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupData, null, 2)
      )}`;
      const link = document.createElement("a");
      link.href = jsonString;
      link.download = `kazran_raid_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } catch (error) {
      console.error("Raid backup failed:", error);
      showToast(t('backup.backup_failed'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text === 'string') {
          const restoredDb = JSON.parse(text);
          if (typeof restoredDb === 'object' && restoredDb !== null) {
            await calculateDiff(restoredDb);
          } else {
            showToast(t('backup.invalid_format'), 'error');
          }
        }
      } catch (error) {
        console.error("Restore failed:", error);
        showToast(t('backup.restore_failed'), 'error');
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    try {
      await executeRestore();
      showToast(t('backup.restore_success'), 'success');
      await fetchAllMembers();
    } catch (error) {
      showToast(t('backup.restore_failed'), 'error');
    }
  };

  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-2xl font-bold mb-6 text-stone-800 dark:text-stone-200 flex items-center gap-2">
          <Wand2 className="w-6 h-6 text-amber-600" />
          {t('nav.tools')}
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
            <div className="p-4 bg-amber-100 dark:bg-amber-900/50 rounded-full text-amber-600 mb-4">
              <RefreshCw className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('tools.auto_transfer')}</h3>
            <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
              {t('tools.auto_transfer_desc')}
            </p>
            <button
              onClick={handleAutoTransfer}
              disabled={isProcessing}
              className="px-8 py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? t('common.processing') : t('tools.start_auto_transfer')}
            </button>
          </div>

          <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
            <div className="p-4 bg-red-100 dark:bg-red-900/50 rounded-full text-red-600 mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('tools.remove_duplicates')}</h3>
            <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
              {t('tools.remove_duplicates_desc')}
            </p>
            <button
              onClick={handleRemoveDuplicates}
              disabled={isProcessing}
              className="px-8 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? t('common.processing') : t('tools.start_remove')}
            </button>
          </div>
        </div>
      </section>

      <div className="border-t border-stone-100 dark:border-stone-700 pt-12">
        <section>
          <h2 className="text-2xl font-bold mb-6 text-stone-800 dark:text-stone-200 flex items-center gap-2">
            <Save className="w-6 h-6 text-amber-600" />
            {t('nav.backup_restore')}
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
              <div className="p-4 bg-blue-100 dark:bg-blue-900/50 rounded-full text-blue-600 mb-4">
                <Download className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('backup.download_backup')}</h3>
              <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
                {t('backup.download_desc')}
              </p>
              <button
                onClick={handleBackup}
                disabled={isProcessing}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? t('common.processing') : t('backup.download_btn')}
              </button>
            </div>

            <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
              <div className="p-4 bg-purple-100 dark:bg-purple-900/50 rounded-full text-purple-600 mb-4">
                <Download className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('backup.download_raid_backup')}</h3>
              <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
                {t('backup.download_raid_desc')}
              </p>
              <button
                onClick={handleRaidBackup}
                disabled={isProcessing}
                className="px-8 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? t('common.processing') : t('backup.download_raid_btn')}
              </button>
            </div>

            <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
              <div className="p-4 bg-green-100 dark:bg-green-900/50 rounded-full text-green-600 mb-4">
                <Upload className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('backup.restore_from_file')}</h3>
              <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
                {t('backup.restore_desc')}
              </p>
              <input type="file" accept=".json" onChange={handleRestore} ref={fileInputRef} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isDiffing || isRestoring}
                className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDiffing ? t('common.processing') : t('backup.restore_btn')}
              </button>
            </div>
          </div>
          <div className="mt-6 bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-400 dark:border-amber-600 p-4 rounded-r-lg">
            <div className="flex">
              <div className="py-1"><AlertCircle className="h-5 w-5 text-amber-500 mr-3" /></div>
              <div>
                <p className="font-bold text-amber-800 dark:text-amber-200">{t('backup.important_notice')}</p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {t('backup.important_desc')}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
        isDanger={confirmModal.isDanger}
      />

      {migrationModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-stone-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="p-6 border-b border-stone-200 dark:border-stone-700">
              <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-200">
                {t('tools.migration_preview')}
              </h2>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {migrationModal.added.length === 0 && migrationModal.migrated.length === 0 && migrationModal.archived.length === 0 ? (
                <div className="text-center py-8 text-stone-500 dark:text-stone-400">
                  {t('tools.migration_no_changes')}
                </div>
              ) : (
                <>
                  {migrationModal.added.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mb-3">
                        {t('tools.migration_added', { count: migrationModal.added.length })}
                      </h3>
                      <div className="bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                            <tr>
                              <th className="px-4 py-2 font-medium">{t('members.member_name')}</th>
                              <th className="px-4 py-2 font-medium">{t('tools.migration_to')}</th>
                              <th className="px-4 py-2 font-medium">{t('members.role')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-200 dark:divide-stone-700">
                            {migrationModal.added.map((item, i) => (
                              <tr key={i} className="text-stone-800 dark:text-stone-300">
                                <td className="px-4 py-2 font-medium">{item.name}</td>
                                <td className="px-4 py-2">{item.toGuild}</td>
                                <td className="px-4 py-2">{t(`roles.${item.role}`)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {migrationModal.migrated.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold text-amber-600 dark:text-amber-400 mb-3">
                        {t('tools.migration_migrated', { count: migrationModal.migrated.length })}
                      </h3>
                      <div className="bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                            <tr>
                              <th className="px-4 py-2 font-medium">{t('members.member_name')}</th>
                              <th className="px-4 py-2 font-medium">{t('tools.migration_from')}</th>
                              <th className="px-4 py-2 font-medium">{t('tools.migration_to')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-200 dark:divide-stone-700">
                            {migrationModal.migrated.map((item, i) => (
                              <tr key={i} className="text-stone-800 dark:text-stone-300">
                                <td className="px-4 py-2 font-medium">{item.name}</td>
                                <td className="px-4 py-2">{item.fromGuild}</td>
                                <td className="px-4 py-2">{item.toGuild}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {migrationModal.archived.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-3">
                        {t('tools.migration_archived', { count: migrationModal.archived.length })}
                      </h3>
                      <div className="bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                            <tr>
                              <th className="px-4 py-2 font-medium">{t('members.member_name')}</th>
                              <th className="px-4 py-2 font-medium">{t('tools.migration_from')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-200 dark:divide-stone-700">
                            {migrationModal.archived.map((item, i) => (
                              <tr key={i} className="text-stone-800 dark:text-stone-300">
                                <td className="px-4 py-2 font-medium">{item.name}</td>
                                <td className="px-4 py-2">{item.fromGuild}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-6 border-t border-stone-200 dark:border-stone-700 flex justify-end gap-3">
              <button
                onClick={closeMigrationModal}
                disabled={isProcessing}
                className="px-6 py-2 rounded-xl font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors disabled:opacity-50"
              >
                {t('tools.migration_cancel')}
              </button>
              <button
                onClick={executeMigration}
                disabled={isProcessing || (migrationModal.added.length === 0 && migrationModal.migrated.length === 0 && migrationModal.archived.length === 0)}
                className="px-6 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('common.processing')}
                  </>
                ) : (
                  t('tools.migration_confirm')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <RestorePreviewModal
        isOpen={isModalOpen}
        isRestoring={isRestoring}
        diffSummary={diffSummary}
        onConfirm={handleConfirmRestore}
        onCancel={cancelRestore}
      />
    </div>
  );
}
