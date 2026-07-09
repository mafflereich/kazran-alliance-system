import React, { useState, useRef } from 'react';
import { useAppContext } from '@/store';
import { Download, FileUp } from 'lucide-react';
import ConfirmModal from '@shared/ui/ConfirmModal';
import { useTranslation } from 'react-i18next';
import { supabase, fetchAllPaginated } from '@/shared/api/supabase';

export default function CsvTool({
  isProcessing,
  setIsProcessing,
}: {
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
}) {
  const { t } = useTranslation(['admin', 'translation']);
  const { fetchAllMembers, showToast } = useAppContext();
  const csvInputRef = useRef<HTMLInputElement>(null);

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
    existingMembersMap: {},
  });

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
              archive_reason: t('tools.csv_archive_reason', { season: season_number, defaultValue: `賽季${season_number}後不在公會了` }),
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

      showToast(t('tools.csv_import_success', { count: successCount, skip: skipCount }), 'success');
      await fetchAllMembers();
    } catch (error: any) {
      console.error("CSV Import failed:", error);
      showToast(t('tools.csv_import_failed', { error: error.message }), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportCsv = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') return;

        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length <= 1) {
          showToast(t('tools.csv_empty', 'CSV 檔案為空或缺少資料'), 'error');
          return;
        }

        const [guildsResult, seasonsResult] = await Promise.all([
          supabase.from('guilds').select('id, name'),
          supabase.from('raid_seasons').select('id, season_number'),
        ]);
        if (guildsResult.error) throw guildsResult.error;
        if (seasonsResult.error) throw seasonsResult.error;
        const guildsData = guildsResult.data!;
        const seasonsData = seasonsResult.data!;
        const membersData = await fetchAllPaginated<{ id: string; name: string }>('members', 'id, name');

        const existingMembersMap: Record<string, string> = {};
        membersData.forEach(m => {
          existingMembersMap[m.name] = m.id;
        });

        const parsedRows = [];
        const missingMembersMap = new Map<string, { name: string; guildName: string; season_number: string }>();

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
            existingMembersMap,
          });
        } else {
          await executeCsvImport(parsedRows, guildsData, seasonsData, existingMembersMap);
        }
      } catch (error: any) {
        console.error("CSV Parse failed:", error);
        showToast(t('tools.csv_import_failed', { error: error.message }), 'error');
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
    <>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
          <div className="p-4 bg-emerald-100 dark:bg-emerald-900/50 rounded-full text-emerald-600 mb-4">
            <Download className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('tools.export_csv_template')}</h3>
          <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
            {t('tools.export_csv_template_desc')}
          </p>
          <button
            onClick={handleExportCsvTemplate}
            disabled={isProcessing}
            className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? t('common.processing', '處理中...') : t('tools.export_btn')}
          </button>
        </div>

        <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
          <div className="p-4 bg-teal-100 dark:bg-teal-900/50 rounded-full text-teal-600 mb-4">
            <FileUp className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('tools.import_csv')}</h3>
          <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
            {t('tools.import_csv_desc')}
          </p>
          <input type="file" accept=".csv" onChange={handleImportCsv} ref={csvInputRef} className="hidden" />
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={isProcessing}
            className="px-8 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? t('common.processing', '處理中...') : t('tools.import_btn')}
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={csvImportState.isOpen}
        title={t('tools.csv_import_confirm_new_members')}
        message={
          <div className="space-y-4">
            <p>{t('tools.csv_import_confirm_desc')}</p>
            <div className="max-h-60 overflow-y-auto bg-stone-50 dark:bg-stone-900/50 rounded-lg border border-stone-200 dark:border-stone-700 p-4">
              <ul className="list-disc pl-5 space-y-1">
                {csvImportState.missingMembers.map((m, i) => (
                  <li key={i} className="text-stone-700 dark:text-stone-300">
                    <span className="font-bold">{m.name}</span> ({t('common.guild_label', '公會')}: {m.guildName})
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-amber-600 dark:text-amber-400 font-medium">
              {t('tools.csv_import_confirm_ask')}
            </p>
          </div>
        }
        onConfirm={() => executeCsvImport(csvImportState.parsedRows, csvImportState.guildsData, csvImportState.seasonsData, csvImportState.existingMembersMap)}
        onCancel={() => setCsvImportState(prev => ({ ...prev, isOpen: false }))}
        isDanger={false}
      />
    </>
  );
}
