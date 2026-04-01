import React from 'react';
import { User, Swords, ArrowDownNarrowWide, ArrowDownWideNarrow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getImageUrl } from '@/shared/lib/utils';
import { useAppContext } from '@/store';

interface GuildCostumeTableProps {
  members: [string, any][];
  costumes: any[];
  sortConfig: { key: string, order: 'asc' | 'desc' };
  handleSort: (key: string) => void;
  hasBoundMemberInGuild: boolean;
  userProfileId: string | null;
  userRole: string | null;
  handleEditClick: (id: string, memberName: string) => void;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseLeave: () => void;
  handleMouseUp: () => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  isMembersLoading: boolean;
  getTruncatedName: (name: string, role: string) => string;
  formatDate: (timestamp: number) => string;
}

export default function GuildCostumeTable({
  members,
  costumes,
  sortConfig,
  handleSort,
  hasBoundMemberInGuild,
  userProfileId,
  userRole,
  handleEditClick,
  isDragging,
  handleMouseDown,
  handleMouseLeave,
  handleMouseUp,
  handleMouseMove,
  scrollRef,
  isMembersLoading,
  getTruncatedName,
  formatDate
}: GuildCostumeTableProps) {
  const { t, i18n } = useTranslation();
  const { db } = useAppContext();

  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden flex-1 flex flex-col min-h-0 relative">
      {isMembersLoading && (
        <div className="absolute inset-0 z-50 bg-white/50 dark:bg-stone-800/50 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 bg-white dark:bg-stone-700 p-6 rounded-2xl shadow-xl border border-stone-100 dark:border-stone-600">
            <div className="w-8 h-8 border-4 border-stone-200 dark:border-stone-600 border-t-stone-800 dark:border-t-stone-200 rounded-full animate-spin"></div>
            <span className="text-stone-600 dark:text-stone-400 font-medium">{t('common.loading', '載入中...')}</span>
          </div>
        </div>
      )}
      <div
        ref={scrollRef}
        className={`overflow-auto flex-1 cursor-grab [&::-webkit-scrollbar:horizontal]:hidden ${isDragging ? 'cursor-grabbing select-none' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
      >
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300">
              <th
                className="p-3 font-semibold sticky top-0 left-0 bg-stone-50 dark:bg-stone-700 z-30 border-r border-b-2 border-stone-200 dark:border-stone-600 shadow-[1px_0_0_0_#e7e5e4] dark:shadow-[1px_0_0_0_#44403c] cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-600 transition-colors"
                onClick={() => handleSort('member')}
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    {t('common.member')}
                    {sortConfig.key === 'member' && (
                      sortConfig.order === 'asc' ? <ArrowDownNarrowWide className="w-4 h-4" /> : <ArrowDownWideNarrow className="w-4 h-4" />
                    )}
                  </div>
                  {hasBoundMemberInGuild && (
                    <div className="text-[10px] font-normal text-amber-600 dark:text-amber-400 mt-0.5">
                      {t('dashboard.click_to_edit')}
                    </div>
                  )}
                </div>
              </th>
              {costumes.map(c => (
                <th
                  key={c.id}
                  className="p-3 font-semibold text-center text-xs w-24 border-r border-b-2 border-stone-200 dark:border-stone-600 last:border-r-0 sticky top-0 bg-stone-50 dark:bg-stone-700 z-20 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-600 transition-colors"
                  onClick={() => handleSort(c.id)}
                >
                  {c.imageName && (
                    <div className="w-[50px] h-[50px] mx-auto mb-2 bg-stone-100 dark:bg-stone-700 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-600">
                      <img
                        src={getImageUrl(c.imageName)}
                        alt={i18n.language === 'en' ? (c.nameE || c.name) : c.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div className="truncate w-20 mx-auto" title={i18n.language === 'en' ? (c.nameE || c.name) : c.name}>{i18n.language === 'en' ? (c.nameE || c.name) : c.name}</div>
                  <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 truncate w-20 mx-auto flex items-center justify-center gap-1">
                    <span className="truncate" title={i18n.language === 'en' ? (db.characters[c.characterId]?.nameE || db.characters[c.characterId]?.name) : db.characters[c.characterId]?.name}>
                      {i18n.language === 'en' ? (db.characters[c.characterId]?.nameE || db.characters[c.characterId]?.name) : db.characters[c.characterId]?.name}
                    </span>
                    {sortConfig.key === c.id && (
                      sortConfig.order === 'asc' ? <ArrowDownNarrowWide className="w-3 h-3 shrink-0" /> : <ArrowDownWideNarrow className="w-3 h-3 shrink-0" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map(([id, member]: [string, any]) => {
              const isCurrentUser = userProfileId && userProfileId.split(',').map(uid => uid.trim()).filter(Boolean).includes(id);
              return (
              <tr key={id} className={`border-b border-stone-100 dark:border-stone-700 transition-colors group ${isCurrentUser ? 'hover:bg-stone-50 dark:hover:bg-stone-700' : ''}`}>
                <td
                  className={`p-3 font-medium text-stone-800 dark:text-stone-200 sticky left-0 bg-white dark:bg-stone-800 border-r border-stone-200 dark:border-stone-600 shadow-[1px_0_0_0_#e7e5e4] dark:shadow-[1px_0_0_0_#44403c] transition-colors ${isCurrentUser ? 'cursor-pointer group-hover:bg-stone-50 dark:group-hover:bg-stone-700' : ''}`}
                  onClick={() => handleEditClick(id, member.name)}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      {isCurrentUser && <User className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />}
                      <span 
                        title={member.name}
                        className={
                          member.role === 'leader' 
                            ? 'px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' 
                            : member.role === 'coleader'
                              ? 'px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                              : ''
                        }
                      >
                        {getTruncatedName(member.name, member.role)}
                      </span>
                    </div>
                    {member.updatedAt && (
                      <span className="text-[10px] text-stone-400 mt-0.5">
                        {formatDate(member.updatedAt)}
                      </span>
                    )}
                    {((userRole === 'manager' || userRole === 'admin' || userRole === 'creator') && member.archiveRemark) && (
                      <span className="text-[10px] text-amber-600 mt-0.5">
                        {member.archiveRemark}
                      </span>
                    )}
                  </div>
                </td>
                {costumes.map(c => {
                  const record = member.records[c.id];
                  const hasCostume = record && record.level >= 0;
                  const hasExclusiveWeapon = member.exclusiveWeapons?.[c.characterId] ?? false;

                  let levelColorClass = "bg-orange-400 text-stone-900"; // default for +5
                  if (hasCostume) {
                    const level = Number(record.level);
                    if (level <= 0) levelColorClass = "bg-stone-300 text-stone-900";
                    else if (level === 1) levelColorClass = "bg-blue-300 text-stone-900";
                    else if (level === 2) levelColorClass = "bg-blue-400 text-stone-900";
                    else if (level === 3) levelColorClass = "bg-purple-300 text-stone-900";
                    else if (level === 4) levelColorClass = "bg-purple-400 text-stone-900";
                  }

                  return (
                    <td key={c.id} className={`p-0 text-center border-r border-stone-100 dark:border-stone-700 last:border-r-0 h-full ${hasCostume ? levelColorClass : ''}`}>
                      {hasCostume ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[60px] py-2 gap-1">
                          <span className="font-bold text-sm">+{record.level}</span>
                          {hasExclusiveWeapon && <Swords className="w-4 h-4" />}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full min-h-[60px] py-2 gap-1 text-stone-300 dark:text-stone-600">
                          <span className="text-sm">-</span>
                          {hasExclusiveWeapon && <Swords className="w-4 h-4 text-amber-500/50" />}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={costumes.length + 1} className="p-8 text-center text-stone-500 dark:text-stone-400">
                  {t('dashboard.no_members')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
