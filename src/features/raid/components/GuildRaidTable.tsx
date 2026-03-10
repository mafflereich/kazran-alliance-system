import React from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Member } from '@/entities/member/types';

interface MemberRaidRecord {
  id?: string;
  season_id: string;
  member_id: string;
  score: number;
  note: string;
}

interface GuildRaidTableProps {
  guildName: string;
  sortedMembers: Member[];
  records: Record<string, MemberRaidRecord>;
  draftRecords: Record<string, MemberRaidRecord>;
  isComparisonMode: boolean;
  loading: boolean;
  onSort: (key: 'default' | 'score') => void;
  onRecordChange: (memberId: string, field: 'score' | 'note', value: string | number) => void;
  onMemberClick: (member: Member) => void;
}

export default function GuildRaidTable({
  guildName,
  sortedMembers,
  records,
  draftRecords,
  isComparisonMode,
  loading,
  onSort,
  onRecordChange,
  onMemberClick
}: GuildRaidTableProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 flex flex-col overflow-hidden">
      <div className="bg-stone-50 dark:bg-stone-700 px-4 py-3 border-b border-stone-200 dark:border-stone-600 font-bold text-stone-800 dark:text-stone-200 flex justify-between items-center">
        <span>{guildName}</span>
        <span className="text-xs font-normal text-stone-500 dark:text-stone-400">{sortedMembers.length} {t('common.member', '成員')}</span>
      </div>
      
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-stone-500">{t('common.loading', '載入中...')}</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-stone-50 dark:bg-stone-700 z-10 shadow-sm">
              <tr>
                <th 
                  className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-600"
                  onClick={() => onSort('default')}
                >
                  {t('common.member', '成員')}
                </th>
                <th 
                  className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-600 w-24"
                  onClick={() => onSort('score')}
                >
                  {t('raid.column_score', '分數')}
                </th>
                {!isComparisonMode && (
                  <th className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600">
                    {t('raid.column_note', '備註')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map(member => {
                const record = draftRecords[member.id!] || records[member.id!] || { score: 0, note: '' };
                const isDirty = !!draftRecords[member.id!];

                return (
                  <tr key={member.id} className={`border-b border-stone-100 dark:border-stone-700/50 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors ${isDirty ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                    <td className="p-2">
                      <button 
                        onClick={() => onMemberClick(member)}
                        className="flex items-center gap-2 text-sm font-medium text-stone-800 dark:text-stone-200 hover:text-indigo-600 dark:hover:text-indigo-400 text-left"
                      >
                        <Search className="w-3.5 h-3.5 text-stone-400" />
                        <span className="truncate max-w-[120px]">{member.name}</span>
                      </button>
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={record.score || ''}
                        onChange={(e) => onRecordChange(member.id!, 'score', e.target.value)}
                        className={`w-full px-2 py-1 text-sm border rounded bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 outline-none ${isDirty ? 'border-amber-300 dark:border-amber-600' : 'border-stone-300 dark:border-stone-600'}`}
                      />
                    </td>
                    {!isComparisonMode && (
                      <td className="p-2">
                        <input
                          type="text"
                          value={record.note || ''}
                          onChange={(e) => onRecordChange(member.id!, 'note', e.target.value)}
                          className={`w-full px-2 py-1 text-sm border rounded bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 outline-none ${isDirty ? 'border-amber-300 dark:border-amber-600' : 'border-stone-300 dark:border-stone-600'}`}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
