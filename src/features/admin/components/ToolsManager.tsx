import React, { useState, useRef } from 'react';
import { useAppContext } from '@/store';
import { RefreshCw, Trash2, Save, Download, Upload, AlertCircle, Wand2, FileSpreadsheet, FileUp } from 'lucide-react';
import ConfirmModal from '@shared/ui/ConfirmModal';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/shared/api/supabase';
import { useRestoreDiff } from '../hooks/useRestoreDiff';
import RestorePreviewModal from './RestorePreviewModal';

export default function ToolsManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, addMember, deleteMember, updateMember, fetchAllMembers, archiveMember, showToast } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

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

  const [csvImportState, setCsvImportState] = useState<{
    isOpen: boolean;
    missingMembers: { name: string; guildName: string; season_number: string }[];
    parsedRows: any[];
    guildsData: any[];
    seasonsData: any[];
    existingMembersMap: Record<string, string>;
  }>({
    isOpen: false,
    missingMembers: [],
    parsedRows: [],
    guildsData: [],
    seasonsData: [],
    existingMembersMap: {}
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
        'members_archive_history',
        'ghost_records'
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

  const handleExportCsvTemplate = () => {
    const headers = ['season_number', 'guild', 'name', 'note', 'season_note', 'score'];
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(',');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "raid_records_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCsvLine = (text: string) => {
    const re_valid = /^\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*)*$/;
    const re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
    if (!re_valid.test(text)) return text.split(',');
    const a: string[] = [];
    text.replace(re_value, (m0, m1, m2, m3) => {
      if (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
      else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"'));
      else if (m3 !== undefined) a.push(m3);
      return '';
    });
    if (/,\s*$/.test(text)) a.push('');
    return a;
  };

  const executeCsvImport = async (
    parsedRows: any[],
    guildsData: any[],
    seasonsData: any[],
    existingMembersMap: Record<string, string>
  ) => {
    setIsProcessing(true);
    setCsvImportState(prev => ({ ...prev, isOpen: false }));
    try {
      let successCount = 0;
      let skipCount = 0;
      const currentMembersMap = { ...existingMembersMap };

      for (const row of parsedRows) {
        const { season_number, guildName, name, note, season_note, score } = row;

        // Step 0: Match season
        let seasonId = season_number;
        const matchedSeason = seasonsData.find(s => String(s.season_number) === season_number || s.id === season_number);
        if (matchedSeason) {
          seasonId = matchedSeason.id;
        }

        // Step 1: Match guild
        const matchedGuild = guildsData.find(g => g.name.toLowerCase() === guildName.toLowerCase());
        if (!matchedGuild) {
          console.warn(`Guild not found: ${guildName}`);
          skipCount++;
          continue;
        }
        const guildId = matchedGuild.id;

        // Step 2: Match or create member
        let memberId = currentMembersMap[name];
        let isNewMember = false;

        if (!memberId) {
          const newId = crypto.randomUUID();
          const { data: newMember, error: createError } = await supabase
            .from('members')
            .insert({
              id: newId,
              name: name,
              role: 'member',
              guild_id: null,
              status: 'archived',
              records: {}
            })
            .select('id')
            .single();
            
          if (createError) throw createError;
          memberId = newMember.id;
          currentMembersMap[name] = memberId;
          isNewMember = true;
        }

        // Step 2.5: Add archive history if new member
        if (isNewMember) {
          const { error: archiveError } = await supabase
            .from('members_archive_history')
            .insert({
              member_id: memberId,
              from_guild_id: guildId,
              archive_reason: `賽季${season_number}後不在公會了`,
              archived_at: new Date().toISOString()
            });
          if (archiveError) throw archiveError;
        }

        // Step 3: Upsert raid record
        const { error: raidError } = await supabase
          .from('member_raid_records')
          .upsert({
            season_id: seasonId,
            member_id: memberId,
            season_guild: guildId,
            season_note: season_note,
            score: score
          }, { onConflict: 'season_id, member_id' });
          
        if (raidError) throw raidError;

        // Step 4: Upsert member note if empty
        if (note) {
          const { data: existingNote, error: noteCheckError } = await supabase
            .from('member_notes')
            .select('uid, note')
            .eq('member_id', memberId)
            .maybeSingle();

          if (noteCheckError) throw noteCheckError;

          if (!existingNote) {
            const { error: noteInsertError } = await supabase
              .from('member_notes')
              .insert({
                member_id: memberId,
                note: note
              });
            if (noteInsertError) throw noteInsertError;
          } else if (!existingNote.note) {
            const { error: noteUpdateError } = await supabase
              .from('member_notes')
              .update({ note: note })
              .eq('member_id', memberId);
            if (noteUpdateError) throw noteUpdateError;
          }
        }
        
        successCount++;
      }
      
      showToast(t('tools.csv_import_success', { count: successCount, skip: skipCount, defaultValue: `成功匯入 ${successCount} 筆資料 (略過 ${skipCount} 筆)` }), 'success');
      await fetchAllMembers();
    } catch (error: any) {
      console.error("CSV Import failed:", error);
      showToast(t('tools.csv_import_failed', { error: error.message, defaultValue: `匯入失敗: ${error.message}` }), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportCsv = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        setIsProcessing(true);
        const text = e.target?.result;
        if (typeof text !== 'string') return;

        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length <= 1) {
          showToast(t('tools.csv_empty', 'CSV 檔案為空或缺少資料'), 'error');
          return;
        }

        const { data: guildsData, error: guildsError } = await supabase.from('guilds').select('id, name');
        if (guildsError) throw guildsError;

        const { data: seasonsData, error: seasonsError } = await supabase.from('raid_seasons').select('id, season_number');
        if (seasonsError) throw seasonsError;

        const { data: membersData, error: membersError } = await supabase.from('members').select('id, name');
        if (membersError) throw membersError;

        const existingMembersMap: Record<string, string> = {};
        membersData.forEach(m => {
          existingMembersMap[m.name] = m.id;
        });

        const parsedRows = [];
        const missingMembersMap = new Map<string, { name: string, guildName: string, season_number: string }>();

        let lastSeasonNumber = '';
        let lastGuildName = '';

        for (let i = 1; i < lines.length; i++) {
          const row = parseCsvLine(lines[i]);
          let season_number = row[0]?.trim();
          let guildName = row[1]?.trim();
          const name = row[2]?.trim();
          const note = row[3]?.trim();
          const season_note = row[4]?.trim();
          const score = parseInt(row[5], 10) || 0;

          if (season_number) {
            lastSeasonNumber = season_number;
          } else {
            season_number = lastSeasonNumber;
          }

          if (guildName) {
            lastGuildName = guildName;
          } else {
            guildName = lastGuildName;
          }

          if (!season_number || !guildName || !name) continue;

          parsedRows.push({ season_number, guildName, name, note, season_note, score });

          if (!existingMembersMap[name] && !missingMembersMap.has(name)) {
            missingMembersMap.set(name, { name, guildName, season_number });
          }
        }

        const missingMembers = Array.from(missingMembersMap.values());

        if (missingMembers.length > 0) {
          setCsvImportState({
            isOpen: true,
            missingMembers,
            parsedRows,
            guildsData,
            seasonsData,
            existingMembersMap
          });
        } else {
          await executeCsvImport(parsedRows, guildsData, seasonsData, existingMembersMap);
        }
      } catch (error: any) {
        console.error("CSV Parse failed:", error);
        showToast(t('tools.csv_import_failed', { error: error.message, defaultValue: `解析失敗: ${error.message}` }), 'error');
      } finally {
        setIsProcessing(false);
        if (csvInputRef.current) {
          csvInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
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

      <div className="border-t border-stone-100 dark:border-stone-700 pt-12 mt-12">
        <section>
          <h2 className="text-2xl font-bold mb-6 text-stone-800 dark:text-stone-200 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            {t('tools.csv_batch_processing', '公會戰紀錄批次處理')}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
              <div className="p-4 bg-emerald-100 dark:bg-emerald-900/50 rounded-full text-emerald-600 mb-4">
                <Download className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('tools.export_csv_template', '匯出空白 CSV 檔')}</h3>
              <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
                {t('tools.export_csv_template_desc', '下載包含正確標題格式的空白 CSV 檔案，用於批次匯入公會戰紀錄。')}
              </p>
              <button
                onClick={handleExportCsvTemplate}
                disabled={isProcessing}
                className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? t('common.processing', '處理中...') : t('tools.export_btn', '匯出 CSV')}
              </button>
            </div>

            <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
              <div className="p-4 bg-teal-100 dark:bg-teal-900/50 rounded-full text-teal-600 mb-4">
                <FileUp className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('tools.import_csv', '匯入 CSV 檔')}</h3>
              <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
                {t('tools.import_csv_desc', '上傳填寫好的 CSV 檔案，系統將自動配對公會與成員，並寫入公會戰紀錄。')}
              </p>
              <input type="file" accept=".csv" onChange={handleImportCsv} ref={csvInputRef} className="hidden" />
              <button
                onClick={() => csvInputRef.current?.click()}
                disabled={isProcessing}
                className="px-8 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? t('common.processing', '處理中...') : t('tools.import_btn', '匯入 CSV')}
              </button>
            </div>
          </div>
        </section>
      </div>

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

      <ConfirmModal
        isOpen={csvImportState.isOpen}
        title={t('tools.csv_import_confirm_new_members', '發現未知的成員')}
        message={
          <div className="space-y-4">
            <p>{t('tools.csv_import_confirm_desc', '以下成員在系統中找不到，將會自動建立並標記為已封存：')}</p>
            <div className="max-h-60 overflow-y-auto bg-stone-50 dark:bg-stone-900/50 rounded-lg border border-stone-200 dark:border-stone-700 p-4">
              <ul className="list-disc pl-5 space-y-1">
                {csvImportState.missingMembers.map((m, i) => (
                  <li key={i} className="text-stone-700 dark:text-stone-300">
                    <span className="font-bold">{m.name}</span> (公會: {m.guildName})
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-amber-600 dark:text-amber-400 font-medium">
              {t('tools.csv_import_confirm_ask', '確定要建立這些成員並繼續匯入嗎？')}
            </p>
          </div>
        }
        onConfirm={() => executeCsvImport(csvImportState.parsedRows, csvImportState.guildsData, csvImportState.seasonsData, csvImportState.existingMembersMap)}
        onCancel={() => setCsvImportState(prev => ({ ...prev, isOpen: false }))}
        isDanger={false}
      />
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
