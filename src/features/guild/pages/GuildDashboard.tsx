import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/store';
import { Shield } from 'lucide-react';
import MemberEquipmentModal from '../components/MemberEquipmentModal';
import MemberSearchModal from '../components/MemberSearchModal';
import EquipmentReminderModal from '../components/EquipmentReminderModal';
import ConfirmModal from '@shared/ui/ConfirmModal';
import { truncateName } from '@/shared/lib/utils';
import { useTranslation } from 'react-i18next';
import { logEvent } from '@/analytics';
import { supabase } from '@/shared/api/supabase';
import GuildSidebar from '../components/GuildSidebar';
import GuildHeader from '../components/GuildHeader';
import EquipmentTable from '../components/EquipmentTable';
import { getSortedMembers, getSortedGuilds } from '../utils/sort';

export default function GuildDashboard({ guildId }: { guildId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { db, isMembersLoading, userGuildRoles, userRole, fetchMembers, userProfileId, canManageGuild } = useAppContext();
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [reminderMembers, setReminderMembers] = useState<{ id: string; name: string }[] | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [sortConfig, setSortConfig] = useState<{ key: string, order: 'asc' | 'desc' }>({ key: 'member', order: 'asc' });

  useEffect(() => {
    setSortConfig({ key: 'member', order: 'asc' });
    fetchMembers(guildId);
  }, [guildId]);

  const handleSort = (key: string) => {
    logEvent('GuildDashboard', 'Sort', key);
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, order: prev.order === 'asc' ? 'desc' : 'asc' };
      }
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
    const isCurrentUser = userProfileId && userProfileId.split(',').map(uid => uid.trim()).filter(Boolean).includes(id);
    const canEdit = isCurrentUser;
    if (!canEdit) return;

    logEvent('GuildDashboard', 'Edit Member Equipment', memberName);
    setEditingMemberId(id);
  };

  const canSeeAllGuilds = userRole === 'admin' || userRole === 'creator' || userRole === 'manager';

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
    const walk = (x - startX) * 1.5;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const guild = db.guilds[guildId];
  const members = React.useMemo(() => {
    return getSortedMembers(db.members, guildId, sortConfig, userProfileId);
  }, [db.members, guildId, sortConfig, userProfileId]);

  const hasBoundMemberInGuild = React.useMemo(() => {
    if (!userProfileId) return false;
    const userMemberIds = userProfileId.split(',').map(uid => uid.trim()).filter(Boolean);
    return members.some(([id]) => userMemberIds.includes(id));
  }, [members, userProfileId]);

  // 系統設定的「裝備表更新基準時間」（epoch ms）：未在該時間後更新的成員會被高亮
  const reminderCutoff = React.useMemo(() => {
    const first = db.settings ? Object.values(db.settings)[0] : undefined;
    return first?.equipmentReminderAt ?? null;
  }, [db.settings]);

  if (!guild) {
    return (
      <div className="h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-stone-100 dark:bg-stone-900">
          <div className="text-center p-8 bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 max-w-md">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('errors.guild_not_found')}</h2>
            <p className="text-stone-500 dark:text-stone-400 mb-6">{t('dashboard.guild_not_found_desc', '該公會不存在或已被刪除。')}</p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2 bg-stone-800 dark:bg-stone-600 text-white rounded-lg hover:bg-stone-700 dark:hover:bg-stone-500 transition-colors"
            >
              {t('dashboard.return_to_list', '返回公會列表')}
            </button>
          </div>
        </div>
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
    return getSortedGuilds(db.guilds, canSeeAllGuilds, userGuildRoles);
  }, [db.guilds, canSeeAllGuilds, userGuildRoles]);

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-900">
      <div className="flex">
        <GuildSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          sortedGuilds={sortedGuilds}
          currentGuildId={guildId}
        />

        {/* Main Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <GuildHeader
            guildName={guild.name}
            memberCount={members.length}
            onOpenSidebar={() => setIsSidebarOpen(true)}
            onOpenSearch={() => setIsSearchModalOpen(true)}
            canSeeAllGuilds={canSeeAllGuilds}
          />

          <main className="p-4">
            <div className="max-w-full mx-auto w-full">
              <div className="mb-2" />
                <EquipmentTable
                  members={members}
                  sortConfig={sortConfig}
                  handleSort={handleSort}
                  hasBoundMemberInGuild={hasBoundMemberInGuild}
                  userProfileId={userProfileId}
                  userRole={userRole}
                  handleEditClick={handleEditClick}
                  isDragging={isDragging}
                  handleMouseDown={handleMouseDown}
                  handleMouseLeave={handleMouseLeave}
                  handleMouseUp={handleMouseUp}
                  handleMouseMove={handleMouseMove}
                  scrollRef={scrollRef}
                  isMembersLoading={isMembersLoading}
                  getTruncatedName={getTruncatedName}
                  formatDate={formatDate}
                  guildName={guild.name}
                  canManageThisGuild={canManageGuild(guildId)}
                  reminderCutoff={reminderCutoff}
                  onOpenReminder={setReminderMembers}
                />
            </div>
          </main>
        </div>
      </div>

      {editingMemberId && (
        <MemberEquipmentModal
          memberId={editingMemberId}
          onClose={() => setEditingMemberId(null)}
        />
      )}

      {reminderMembers && (
        <EquipmentReminderModal
          guildId={guildId}
          guildName={guild.name}
          members={reminderMembers}
          onClose={() => setReminderMembers(null)}
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
