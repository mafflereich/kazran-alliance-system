import React, { useState, useRef } from 'react';
import { useAppContext } from '../store';
import { ChevronLeft, Edit2, Menu, X, Shield, Swords, ArrowDownNarrowWide, ArrowDownWideNarrow, Search } from 'lucide-react';
import MemberEditModal from '../components/MemberEditModal';
import MemberSearchModal from '../components/MemberSearchModal';
import ConfirmModal from '../components/ConfirmModal';
import Footer from '../components/Footer';
import Header from '../components/Header';
import { Role } from '../types';
import { getTierTextColorDark, getTierHighlightClass, getTierHoverClass, truncateName, getImageUrl } from '../utils';
import { useTranslation } from 'react-i18next';
import { logEvent } from '../analytics';

export default function GuildDashboard({ guildId }: { guildId: string }) {
  const { t, i18n } = useTranslation();
  const { db, setCurrentView, currentUser, isMembersLoading } = useAppContext();
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [sortConfig, setSortConfig] = useState<{ key: 'member' | string, order: 'asc' | 'desc' }>({ key: 'member', order: 'asc' });

  React.useEffect(() => {
    setSortConfig({ key: 'member', order: 'asc' });
  }, [guildId]);

  const handleSort = (key: string) => {
    logEvent('GuildDashboard', 'Sort', key);
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, order: prev.order === 'asc' ? 'desc' : 'asc' };
      }
      // Default for member is asc, default for costume is desc (+5 to -1)
      return { key, order: key === 'member' ? 'asc' : 'desc' };
    });
  };

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getTruncatedName = (name: string, role: string) => {
    if (!isMobile) return truncateName(name, 20);
    if (role === 'leader' || role === 'coleader') return truncateName(name, 8);
    return truncateName(name, 14);
  };

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    onConfirm: () => void;
    isDanger: boolean;
    confirmText: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    isDanger: false,
    confirmText: t('common.yes')
  });

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  const handleEditClick = (id: string, memberName: string) => {
    logEvent('GuildDashboard', 'Edit Member', memberName);
    setConfirmModal({
      isOpen: true,
      title: t('dashboard.identity_confirm'),
      message: <>{t('dashboard.are_you')} 「<b>{memberName}</b>」 {t('dashboard.question_mark')}</>,
      isDanger: false,
      confirmText: t('common.yes'),
      onConfirm: () => {
        setEditingMemberId(id);
        closeConfirmModal();
      }
    });
  };

  const userRole = currentUser ? db.users[currentUser]?.role : null;
  const canSeeAllGuilds = userRole === 'admin' || userRole === 'creator' || userRole === 'manager';
  const userGuildId = !canSeeAllGuilds && currentUser ? Object.entries(db.guilds).find(([_, g]) => g.username === currentUser)?.[0] : null;

  // Redirect or block if trying to access another guild as a guild user
  if (currentUser && !canSeeAllGuilds && guildId !== userGuildId) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center bg-stone-100 dark:bg-stone-900">
          <div className="text-center p-8 bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 max-w-md">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('errors.permission')}</h2>
            <p className="text-stone-500 dark:text-stone-400 mb-6">{t('dashboard.no_permission')}</p>
            <button
              onClick={() => userGuildId && setCurrentView({ type: 'guild', guildId: userGuildId })}
              className="px-6 py-2 bg-stone-800 dark:bg-stone-600 text-white rounded-lg hover:bg-stone-700 dark:hover:bg-stone-500 transition-colors"
            >
              {t('dashboard.return_to_guild')}
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Draggable scroll state
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => setIsDragging(false);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // Scroll speed multiplier
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const guild = db.guilds[guildId];
  const members = React.useMemo(() => {
    return Object.entries(db.members)
      .filter(([_, m]: [string, any]) => m.guildId === guildId)
      .sort((a: [string, any], b: [string, any]) => {
        const roleOrder: Record<string, number> = {
          'leader': 1,
          'coleader': 2,
          'member': 3
        };

        const getTieBreak = () => {
          const orderA = roleOrder[a[1].role] || 99;
          const orderB = roleOrder[b[1].role] || 99;
          if (orderA !== orderB) return orderA - orderB;
          return a[1].name.localeCompare(b[1].name);
        };

        if (sortConfig.key === 'member') {
          if (sortConfig.order === 'asc') {
            const orderA = roleOrder[a[1].role] || 99;
            const orderB = roleOrder[b[1].role] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return a[1].name.localeCompare(b[1].name);
          } else {
            const descRoleOrder: Record<string, number> = {
              'member': 1,
              'coleader': 2,
              'leader': 3
            };
            const orderA = descRoleOrder[a[1].role] || 99;
            const orderB = descRoleOrder[b[1].role] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return b[1].name.localeCompare(a[1].name);
          }
        } else {
          // Costume sorting
          const costumeId = sortConfig.key;
          const levelA = a[1].records[costumeId]?.level ?? -1;
          const levelB = b[1].records[costumeId]?.level ?? -1;

          if (levelA !== levelB) {
            return sortConfig.order === 'asc' ? levelA - levelB : levelB - levelA;
          }
          return getTieBreak();
        }
      });
  }, [db.members, guildId, sortConfig]);

  const costumes = React.useMemo(() => {
    return Object.values(db.costumes).sort((a, b) => {
      const charA = db.characters[a.characterId];
      const charB = db.characters[b.characterId];

      // Handle cases where a character might not exist for a costume
      if (!charA && !charB) return 0; // Both are orphaned, treat as equal
      if (!charA) return 1; // Orphaned 'a' goes to the end
      if (!charB) return -1; // Orphaned 'b' goes to the end

      // 1. Prioritize 'isNew' costumes
      if (a.isNew && !b.isNew) return -1;
      if (!a.isNew && b.isNew) return 1;

      // 2. Sort by character order
      if (charA.orderNum !== charB.orderNum) {
        return charA.orderNum - charB.orderNum;
      }

      // 3. Sort by costume order
      return (a.orderNum ?? 999) - (b.orderNum ?? 999);
    });
  }, [db.costumes, db.characters]);

  if (!guild) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center bg-stone-100 dark:bg-stone-900">
          <div className="text-center p-8 bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 max-w-md">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('errors.guild_not_found')}</h2>
            <p className="text-stone-500 dark:text-stone-400 mb-6">{t('dashboard.guild_not_found_desc', '該公會不存在或已被刪除。')}</p>
            <button
              onClick={() => setCurrentView(null)}
              className="px-6 py-2 bg-stone-800 dark:bg-stone-600 text-white rounded-lg hover:bg-stone-700 dark:hover:bg-stone-500 transition-colors"
            >
              {t('dashboard.return_to_list', '返回公會列表')}
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
  };

  const sortedGuilds = React.useMemo(() => {
    return (Object.entries(db.guilds) as [string, any][])
      .filter(([id, _]) => canSeeAllGuilds || id === userGuildId)
      .sort((a, b) => {
        const tierA = a[1].tier || 99;
        const tierB = b[1].tier || 99;
        if (tierA !== tierB) return tierA - tierB;
        const orderA = a[1].orderNum || 99;
        const orderB = b[1].orderNum || 99;
        return orderA - orderB;
      });
  }, [db.guilds, canSeeAllGuilds, userGuildId]);

  return (
    <div className="h-screen bg-stone-100 dark:bg-stone-900 flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-stone-900/50 z-40"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          fixed top-0 left-0 h-full w-64 bg-stone-900 text-stone-300 z-50
          transform transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          flex flex-col
        `}>
          <div className="p-4 flex items-center justify-between border-b border-stone-800">
            <h2 className="font-bold text-white flex items-center gap-2">
              {t('dashboard.guild_list')}
            </h2>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-stone-800 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-4">
            <div className="space-y-6 px-2">
              {[1, 2, 3, 4].map(tier => {
                const tierGuilds = sortedGuilds.filter(g => (g[1].tier || 1) === tier && g[1].isDisplay !== false);
                if (tierGuilds.length === 0) return null;
                return (
                  <div key={tier}>
                    <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 px-4 ${getTierTextColorDark(tier)}`}>{t('guilds.tier')} {tier}</h3>
                    <ul className="space-y-1">
                      {tierGuilds.map(([id, g]) => (
                        <li key={id}>
                          <button
                            onClick={() => {
                              setCurrentView({ type: 'guild', guildId: id });
                              setIsSidebarOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 rounded-lg transition-colors flex justify-between items-center ${id === guildId
                              ? `${getTierHighlightClass(tier)} font-medium`
                              : `${getTierHoverClass(tier)} text-stone-300`
                              }`}
                          >
                            <span>{g.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          <header className="bg-white dark:bg-stone-800 px-4 py-2 shadow-sm flex items-center gap-4 shrink-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5 text-stone-600 dark:text-stone-400" />
            </button>
            <div className="flex items-center gap-3">
              <div className="flex items-baseline gap-3">
                <h1 className="font-bold text-lg text-stone-800 dark:text-stone-200">{guild.name}</h1>
                <span className={`text-xs font-medium ${members.length > 30 ? 'text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded' : 'text-stone-500 dark:text-stone-400'}`}>
                  {t('dashboard.member_count')}: {members.length} / 30
                </span>
              </div>
              {canSeeAllGuilds && (
                <button
                  onClick={() => setIsSearchModalOpen(true)}
                  className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:text-stone-500 dark:hover:text-stone-300 dark:hover:bg-stone-700 rounded-lg transition-colors"
                  title={t('dashboard.global_search_member', '全域搜尋成員')}
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-hidden p-4 flex flex-col">
            <div className="max-w-full mx-auto w-full h-full flex flex-col min-h-0">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-2 shrink-0" />
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
                              <div className="text-[10px] font-normal text-amber-600 dark:text-amber-400 mt-0.5">
                                {t('dashboard.click_to_edit')}
                              </div>
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
                        {members.map(([id, member]: [string, any]) => (
                          <tr key={id} className="border-b border-stone-100 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors group">
                            <td 
                              className="p-3 font-medium text-stone-800 dark:text-stone-200 sticky left-0 bg-white dark:bg-stone-800 group-hover:bg-stone-50 dark:group-hover:bg-stone-700 border-r border-stone-200 dark:border-stone-600 shadow-[1px_0_0_0_#e7e5e4] dark:shadow-[1px_0_0_0_#44403c] transition-colors cursor-pointer"
                              onClick={() => handleEditClick(id, member.name)}
                            >
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span title={member.name}>{getTruncatedName(member.name, member.role)}</span>
                                  {(member.role === 'leader' || member.role === 'coleader') && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${member.role === 'leader' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                      {member.role === 'leader' ? t('roles.leader') : t('roles.coleader')}
                                    </span>
                                  )}
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
                        ))}
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
              </div>
              <Footer />
            </div>
          </main>
        </div>
      </div>

      {editingMemberId && (
        <MemberEditModal
          memberId={editingMemberId}
          onClose={() => setEditingMemberId(null)}
        />
      )}

      <MemberSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
        isDanger={confirmModal.isDanger}
        confirmText={confirmModal.confirmText}
      />
    </div>
  );
}
