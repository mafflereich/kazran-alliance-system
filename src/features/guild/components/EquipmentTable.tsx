import React from 'react';
import { User, EyeOff, Lock, ArrowDownNarrowWide, ArrowDownWideNarrow, BellRing, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/store';
import { EQUIPMENT_CATEGORIES, PLAY_MODE_OPTIONS } from '@/entities/member/types';
import { normalizeEquipment, normalizePlayPreferences, normalizeEquipmentVisibility, canViewCategoryForUI, isManagerRole, isEquipmentOutdated, getEquipmentUpdatedAt } from '@/shared/lib/equipment';

interface EquipmentTableProps {
  members: [string, any][];
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
  guildName: string;
  // 系統設定的「裝備表更新基準時間」（epoch ms）；未設定 / 0 表示不啟用高亮
  reminderCutoff?: number | null;
  onOpenReminder: (outdatedMembers: { id: string; name: string }[]) => void;
}

export default function EquipmentTable({
  members,
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
  formatDate,
  guildName,
  reminderCutoff,
  onOpenReminder
}: EquipmentTableProps) {
  const { t, i18n } = useTranslation();

  // 所有成員都顯示，但依隱私級別對一般成員遮蔽裝備欄位（遊玩傾向/註記仍保留）
  const visibleMembers = React.useMemo(() => members, [members]);

  // 未在系統基準時間後更新裝備表的成員（高亮 + 可一鍵請貝拉通知）
  const outdatedMembers = React.useMemo(() => {
    if (!reminderCutoff || reminderCutoff <= 0) return [] as { id: string; name: string }[];
    return visibleMembers
      .filter(([, m]: [string, any]) => isEquipmentOutdated(m, reminderCutoff))
      .map(([id, m]: [string, any]) => ({ id, name: String(m.name ?? '') }));
  }, [visibleMembers, reminderCutoff]);

  const outdatedIdSet = React.useMemo(() => new Set(outdatedMembers.map(m => m.id)), [outdatedMembers]);
  const canNotifyBella = isManagerRole(userRole) && outdatedMembers.length > 0;

  // 觀看者可管理的公會：從其綁定成員身分推得（此表為單一公會視圖）
  const viewerManagedGuildIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (!userProfileId) return ids;
    const bound = userProfileId.split(',').map(uid => uid.trim()).filter(Boolean);
    members.forEach(([, m]: [string, any]) => {
      if (bound.includes(m.id) && m.guildId) ids.add(m.guildId);
    });
    return ids;
  }, [members, userProfileId]);

  const isRestricted = (member: any) =>
    normalizeEquipmentVisibility(member.equipmentVisibility, member.isEquipmentHidden) !== 'public';

  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden relative">
      {isMembersLoading && (
        <div className="absolute inset-0 z-50 bg-white/50 dark:bg-stone-800/50 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 bg-white dark:bg-stone-700 p-6 rounded-2xl shadow-xl border border-stone-100 dark:border-stone-600">
            <div className="w-8 h-8 border-4 border-stone-200 dark:border-stone-600 border-t-stone-800 dark:border-t-stone-200 rounded-full animate-spin"></div>
            <span className="text-stone-600 dark:text-stone-400 font-medium">{t('common.loading', '載入中...')}</span>
          </div>
        </div>
      )}
      {(reminderCutoff && reminderCutoff > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/60">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className={`w-4 h-4 ${outdatedMembers.length > 0 ? 'text-red-500' : 'text-stone-400'}`} />
            <span className="font-medium text-stone-700 dark:text-stone-200">
              {t('equipment.reminder_cutoff', '更新基準時間')}: {formatDate(reminderCutoff)}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${outdatedMembers.length > 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>
              {t('equipment.reminder_outdated_count', { count: outdatedMembers.length, defaultValue: '{{count}} 位未更新' })}
            </span>
          </div>
          {canNotifyBella && (
            <button
              type="button"
              onClick={() => onOpenReminder(outdatedMembers)}
              title={t('equipment.reminder_notify_bella_title', { guild: guildName, defaultValue: '請貝拉通知 {{guild}} 的成員' })}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-sm transition-all active:scale-95"
            >
              <BellRing className="w-4 h-4" />
              {t('equipment.reminder_notify_bella', '請貝拉通知')}
            </button>
          )}
        </div>
      )}
      <div
        ref={scrollRef}
        className={`overflow-x-auto overflow-y-auto max-h-[70vh] cursor-grab [&::-webkit-scrollbar:horizontal]:hidden ${isDragging ? 'cursor-grabbing select-none' : ''}`}
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
              <th className="p-3 font-semibold text-center text-xs border-r border-b-2 border-stone-200 dark:border-stone-600 sticky top-0 bg-stone-50 dark:bg-stone-700 z-20">
                {t('equipment.play_preference')}
              </th>
              <th className="p-3 font-semibold text-center text-xs border-r border-b-2 border-stone-200 dark:border-stone-600 sticky top-0 bg-stone-50 dark:bg-stone-700 z-20">
                {t('equipment.note')}
              </th>
              {EQUIPMENT_CATEGORIES.map(cat => (
                <th
                  key={cat.key}
                  className="p-2 font-semibold text-center text-xs border-r border-b-2 border-stone-200 dark:border-stone-600 last:border-r-0 sticky top-0 bg-stone-50 dark:bg-stone-700 z-20 align-top"
                >
                  <div className="flex flex-col items-center gap-1">
                    {/* 部位 / 功能敘述：每一件都顯示，避免只看到裝備名而誤會用途
                        （例：皇家石 → 5星UR專用裝備、造反的決心 → 物理爆率手套） */}
                    <span className="text-[9px] font-normal text-stone-400 dark:text-stone-500 whitespace-nowrap">
                      {t(`equipment.categories.${cat.group}`, cat.group)}
                    </span>
                    <div className="flex items-center justify-center gap-0.5" title={cat.icons?.map(i => i.name).join(' / ')}>
                      {cat.icons?.slice(0, 3).map((ico : any, idx : number) => (
                        <img
                          key={idx}
                          src={ico.thumb}
                          alt={ico.name}
                          className={`w-7 h-7 object-contain rounded bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-600 ${cat.icons && cat.icons.length > 1 && idx === 0 ? '-mr-2 z-10' : ''}`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ))}
                    </div>
                    <span>{t(`equipment.items.${cat.key}`, cat.name)}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleMembers.map(([id, member]: [string, any]) => {
              const isCurrentUser = !!(userProfileId && userProfileId.split(',').map(uid => uid.trim()).filter(Boolean).includes(id));
              const equipment = normalizeEquipment(member.equipment);
              const playPrefs = normalizePlayPreferences(member.playPreferences);
              const sortedModes = [...(playPrefs.modes || [])].sort((a, b) => PLAY_MODE_OPTIONS.indexOf(a) - PLAY_MODE_OPTIONS.indexOf(b));
              const isOutdated = outdatedIdSet.has(id);
              return (
              <tr key={id} className={`border-b border-stone-100 dark:border-stone-700 transition-colors group ${isOutdated ? 'animate-highlight-pulse' : ''} ${isCurrentUser ? 'hover:bg-stone-50 dark:hover:bg-stone-700' : ''}`}>
                <td
                  className={`p-3 font-medium text-stone-800 dark:text-stone-200 sticky left-0 z-10 ${isOutdated ? 'animate-highlight-pulse' : 'bg-white dark:bg-stone-800'} border-r border-stone-200 dark:border-stone-600 shadow-[1px_0_0_0_#e7e5e4] dark:shadow-[1px_0_0_0_#44403c] transition-colors ${isCurrentUser ? 'cursor-pointer group-hover:bg-stone-50 dark:group-hover:bg-stone-700' : ''}`}
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
                      {isRestricted(member) ? (
                        normalizeEquipmentVisibility(member.equipmentVisibility, member.isEquipmentHidden) === 'admin'
                          ? <Lock className="w-3.5 h-3.5 text-red-400 dark:text-red-500" />
                          : <EyeOff className="w-3.5 h-3.5 text-stone-300 dark:text-stone-500" />
                      ) : null}
                      {isOutdated && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-bold whitespace-nowrap"
                          title={t('equipment.reminder_badge_title', '未在基準時間後更新裝備表')}
                        >
                          {t('equipment.reminder_badge', '未更新')}
                        </span>
                      )}
                    </div>
                    {(getEquipmentUpdatedAt(member) > 0 || (isManagerRole(userRole) && member.refiningTraces != null)) && (
                      <div className="flex items-center gap-2 mt-0.5">
                        {isManagerRole(userRole) && member.refiningTraces != null && member.refiningTraces > 0 && (
                          <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400" title={t('equipment.refining_traces')}>
                            ✦ {member.refiningTraces}
                          </span>
                        )}
                        {getEquipmentUpdatedAt(member) > 0 && (
                          <span className={`text-[10px] ${isOutdated ? 'text-red-500 dark:text-red-400 font-bold' : 'text-stone-400'}`}>
                            {t('equipment.last_updated', '更新')}: {formatDate(getEquipmentUpdatedAt(member))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-3 text-center border-r border-stone-100 dark:border-stone-700 align-top">
                  <div className="flex flex-col items-center gap-1.5">
                    {playPrefs.modes.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-1">
                        {sortedModes.map(mode => (
                          <span key={mode} className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">
                            {t(`equipment.modes_opt.${mode}`)}
                          </span>
                        ))}
                      </div>
                    )}
                    {playPrefs.dedication && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 whitespace-nowrap">
                        {t(`equipment.dedication_opt.${playPrefs.dedication}`)}
                      </span>
                    )}
                    {playPrefs.modes.length === 0 && !playPrefs.dedication && (
                      <span className="text-sm text-stone-300 dark:text-stone-600">-</span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-center border-r border-stone-100 dark:border-stone-700 last:border-r-0 align-top">
                  {member.equipmentNote ? (
                    <span className="text-xs leading-relaxed text-stone-600 dark:text-stone-300 line-clamp-3 max-w-[220px] break-words inline-block text-left" title={member.equipmentNote}>
                      {member.equipmentNote}
                    </span>
                  ) : (
                    <span className="text-sm text-stone-300 dark:text-stone-600">-</span>
                  )}
                </td>
                {EQUIPMENT_CATEGORIES.map(cat => {
                  const item = equipment[cat.key];
                  const canSee23 = canViewCategoryForUI(userRole, member, cat.key, 'c23', [...viewerManagedGuildIds], isCurrentUser);
                  const canSee24 = canViewCategoryForUI(userRole, member, cat.key, 'c24', [...viewerManagedGuildIds], isCurrentUser);
                  return (
                    <td key={cat.key} className="p-0 text-center border-r border-stone-100 dark:border-stone-700 last:border-r-0 h-full">
                      <div className="flex flex-col items-center justify-center h-full min-h-[60px] py-2 gap-1">
                        {canSee23 ? (
                          item.c23 > 0 ? (
                            <span className="font-bold text-sm text-red-600 dark:text-red-400">23C: {item.c23}</span>
                          ) : (
                            <span className="text-sm text-stone-300 dark:text-stone-600">23C: -</span>
                          )
                        ) : (
                          <span className="flex items-center gap-1 text-sm font-bold text-red-600 dark:text-red-400">
                            <span>23C:</span>
                            <EyeOff className="w-3.5 h-3.5 text-stone-300 dark:text-stone-500" />
                          </span>
                        )}
                        {canSee24 ? (
                          item.c24 > 0 ? (
                            <span className="font-bold text-sm text-purple-600 dark:text-purple-400">24C: {item.c24}</span>
                          ) : (
                            <span className="text-sm text-stone-300 dark:text-stone-600">24C: -</span>
                          )
                        ) : (
                          <span className="flex items-center gap-1 text-sm font-bold text-purple-600 dark:text-purple-400">
                            <span>24C:</span>
                            <EyeOff className="w-3.5 h-3.5 text-stone-300 dark:text-stone-500" />
                          </span>
                        )}
                        {item.updatedAt && (
                          <span className="text-[9px] text-stone-400 dark:text-stone-500">
                            {new Date(item.updatedAt).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'zh-TW')}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
              );
            })}
            {visibleMembers.length === 0 && (
              <tr>
                <td colSpan={EQUIPMENT_CATEGORIES.length + 3} className="p-8 text-center text-stone-500 dark:text-stone-400">
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
