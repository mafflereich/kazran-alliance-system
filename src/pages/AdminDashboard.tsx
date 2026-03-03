import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppContext } from '../store';
import { LogOut, Users, Shield, Sword, Plus, Edit2, Trash2, ArrowUp, ArrowDown, Save, X, ChevronLeft, Lock, User as UserIcon, AlertCircle, Download, Upload, FileText, RefreshCw, Wand2, GripVertical, Check, Key, Archive, Settings } from 'lucide-react';
import { Role, Guild, Member, Costume, User, Character } from '../types';
import { getTierColor, getTierBorderHoverClass, getImageUrl } from '../utils';
import ConfirmModal from '../components/ConfirmModal';
import InputModal from '../components/InputModal';
import Footer from '../components/Footer';
import Header from '../components/Header';
import SinglePasswordUpdate from '../components/SinglePasswordUpdate';
import BulkPasswordUpdate from '../components/BulkPasswordUpdate';
import ArchivedMembersManager from '../components/ArchivedMembersManager';
import { Reorder } from "motion/react";
import { useTranslation } from 'react-i18next';

export default function AdminDashboard() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, setDb, setCurrentView, currentUser, setCurrentUser, fetchAllMembers } = useAppContext();
  const [activeTab, setActiveTab] = useState<'guilds' | 'costumes' | 'backup' | 'tools' | 'passwords' | 'archived' | 'settings'>('guilds');

  const userRole = currentUser ? db.users[currentUser]?.role : null;

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView(null);
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col">
      <Header />

      <main className="max-w-6xl mx-auto p-6 flex-1 w-full">
        <div className="mb-4 flex gap-4 text-[10px] text-stone-400 uppercase tracking-widest">
          <span>{t('common.guild')}: {Object.keys(db.guilds).length}</span>
          <span>{t('common.member')}: {Object.values(db.members).filter(m => m.status === 'active').length}</span>
          <span>{t('common.character')}: {Object.keys(db.characters).length}</span>
          <span>{t('common.costume')}: {Object.keys(db.costumes).length}</span>
          <span>{t('common.user')}: {Object.keys(db.users).length}</span>
        </div>
        <div className="flex gap-4 mb-6 border-b border-stone-300 pb-2 overflow-x-auto">
          <TabButton active={activeTab === 'guilds'} onClick={() => setActiveTab('guilds')} icon={<Shield />} label={t('nav.guild_management')} />
          <TabButton active={activeTab === 'costumes'} onClick={() => setActiveTab('costumes')} icon={<Sword />} label={t('nav.costume_database')} />
          <TabButton active={activeTab === 'archived'} onClick={() => setActiveTab('archived')} icon={<Archive />} label={t('nav.archived_members')} />
          {userRole !== 'manager' && (
            <>
              <TabButton active={activeTab === 'passwords'} onClick={() => setActiveTab('passwords')} icon={<Key />} label={t('nav.change_password')} />
              <TabButton active={activeTab === 'backup'} onClick={() => setActiveTab('backup')} icon={<Save />} label={t('nav.backup_restore')} />
              <TabButton active={activeTab === 'tools'} onClick={() => setActiveTab('tools')} icon={<Wand2 />} label={t('nav.tools')} />
              <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings />} label={t('nav.settings')} />
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
          {activeTab === 'guilds' && <GuildsManager />}
          {activeTab === 'costumes' && <CostumesManager />}
          {activeTab === 'archived' && <ArchivedMembersManager />}
          {activeTab === 'passwords' && userRole !== 'manager' && (
            <div className="space-y-12">
              <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
                <div className="flex">
                  <div className="py-1"><AlertCircle className="h-5 w-5 text-amber-500 mr-3" /></div>
                  <div>
                    <p className="font-bold text-amber-800">{t('common.info')}</p>
                    <p className="text-sm text-amber-700">
                      {t('guilds.auth_account_notice')} <code className="bg-amber-100 px-1 rounded">"new_guild_name@kazran.com"</code>。
                    </p>
                  </div>
                </div>
              </div>

              <section>
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-stone-800">{t('passwords.single_update')}</h3>
                  <p className="text-sm text-stone-500">{t('passwords.single_update_desc')}</p>
                </div>
                <SinglePasswordUpdate />
              </section>

              <div className="border-t border-stone-100 pt-12">
                <section>
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-stone-800">{t('passwords.bulk_update')}</h3>
                    <p className="text-sm text-stone-500">{t('passwords.bulk_update_desc')}</p>
                  </div>
                  <BulkPasswordUpdate />
                </section>
              </div>
            </div>
          )}
          {activeTab === 'backup' && userRole !== 'manager' && <BackupManager />}
          {activeTab === 'tools' && userRole !== 'manager' && <ToolsManager />}
          {activeTab === 'settings' && userRole !== 'manager' && <SettingsManager />}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function ToolsManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, addMember, deleteMember, updateMember, fetchAllMembers, restoreData, archiveMember, showToast } = useAppContext();

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

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  const handleAutoTransfer = () => {
    setConfirmModal({
      isOpen: true,
      title: t('tools.auto_transfer'),
      message: t('tools.confirm_auto_transfer'),
      isDanger: false,
      onConfirm: async () => {
        setIsProcessing(true);
        closeConfirmModal();

        await fetchAllMembers();

        const macroId = `AKfycbyvqpgrZ_BMU94i6llQF9HjP89y8yAS0EyRsPUT1fncmsdZg-8GeyVyUHp0DunJUwezqQ`;
        const { guildList, guildLeaderList } = (await (await fetch(`https://script.google.com/macros/s/${macroId}/exec`,
          {
            method: "GET",
            mode: "cors",
          })).json()).data;

        const guildNameList = Object.keys(guildList);

        const activeMemberList = [];

        const memberList = Object.values(db.members);
        const guildListInDB = Object.values(db.guilds);

        for (const guildName of guildNameList) {
          const memberNames = guildList[guildName];

          for (let memberName of memberNames) {
            memberName = memberName.replace(/@/, "");

            const member = memberList.find((member) => member.name == memberName);

            const guildId = guildListInDB.find((guild) => guild.name == guildName)?.id;
            const role = guildLeaderList[`@${memberName}`]?.replaceAll(/<|>/g, "") ?? "member";

            if (!member && !memberName.match(/Vacancy/) && memberName) {
              await addMember(guildId, memberName, role, "");
            }
            else if (member && guildId != member?.guildId) {
              await updateMember(member.id, { guildId, role });
            }

            activeMemberList.push(memberName);

          };

        };

        const membersToArchive = memberList.filter((member) => !activeMemberList.find((memberName) => memberName == member.name) && member.status != 'archived');

        if (membersToArchive.length > 0) {
          const confirmArchive = window.confirm(t('tools.confirm_archive_not_in_list', { count: membersToArchive.length }));
          if (confirmArchive) {
            for (const member of membersToArchive) {
              await archiveMember(member.id, member.guildId, t('tools.not_in_list_reason'));
            }
          }
        }

        setIsProcessing(false);
      }
    });
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6 text-stone-800 flex items-center gap-2">
        <Wand2 className="w-6 h-6 text-amber-600" />
        {t('nav.tools')}
      </h2>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-stone-50 p-8 rounded-2xl border border-stone-200 flex flex-col items-center justify-center text-center">
          <div className="p-4 bg-amber-100 rounded-full text-amber-600 mb-4">
            <RefreshCw className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-stone-800 mb-2">{t('tools.auto_transfer')}</h3>
          <p className="text-stone-500 mb-6 max-w-md">
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

        <div className="bg-stone-50 p-8 rounded-2xl border border-stone-200 flex flex-col items-center justify-center text-center">
          <div className="p-4 bg-red-100 rounded-full text-red-600 mb-4">
            <Trash2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-stone-800 mb-2">{t('tools.remove_duplicates')}</h3>
          <p className="text-stone-500 mb-6 max-w-md">
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

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
        isDanger={confirmModal.isDanger}
      />
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${active ? 'text-amber-600 border-b-2 border-amber-600' : 'text-stone-500 hover:text-stone-800'
        }`}
    >
      {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' })}
      {label}
    </button>
  );
}

function GuildsManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, addGuild, updateGuild, deleteGuild, fetchAllMembers, showToast } = useAppContext();
  const [newGuildName, setNewGuildName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [editingGuildId, setEditingGuildId] = useState<string | null>(null);
  const [editGuildName, setEditGuildName] = useState('');
  const [editGuildTier, setEditGuildTier] = useState<number>(1);
  const [editGuildOrder, setEditGuildOrder] = useState<number>(1);

  useEffect(() => {
    fetchAllMembers();
  }, []);

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

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  const handleAddGuild = async () => {
    if (!newGuildName.trim()) return;
    setIsSaving(true);
    try {
      await addGuild(newGuildName.trim());
      setNewGuildName('');
      showToast(t('guilds.add_success'), 'success');
    } catch (error: any) {
      console.error("Error adding guild:", error);
      showToast(`${t('guilds.add_failed')}: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const getMemberCount = (guildId: string) => {
    return Object.values(db.members).filter((m: any) => m.guildId === guildId).length;
  };

  const startEdit = (e: React.MouseEvent, id: string, guild: any) => {
    e.stopPropagation();
    setEditingGuildId(id);
    setEditGuildName(guild.name);
    setEditGuildTier(guild.tier || 1);
    setEditGuildOrder(guild.orderNum || 1);
  };

  const saveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editGuildName.trim() || !editingGuildId) return;
    try {
      await updateGuild(editingGuildId, {
        name: editGuildName.trim(),
        tier: editGuildTier,
        orderNum: editGuildOrder
      });
      setEditingGuildId(null);
      showToast(t('guilds.update_success'), 'success');
    } catch (error: any) {
      console.error("Error updating guild:", error);
      showToast(`${t('guilds.update_failed')}: ${error.message}`, 'error');
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: t('guilds.delete_guild'),
      message: t('guilds.confirm_delete'),
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteGuild(id);
          closeConfirmModal();
          showToast(t('guilds.delete_success'), 'success');
        } catch (error: any) {
          console.error("Error deleting guild:", error);
          showToast(`${t('guilds.delete_failed')}: ${error.message}`, 'error');
          closeConfirmModal();
        }
      }
    });
  };

  const sortedGuilds = (Object.entries(db.guilds) as [string, any][]).sort((a, b) => {
    const tierA = a[1].tier || 99;
    const tierB = b[1].tier || 99;
    if (tierA !== tierB) return tierA - tierB;
    const orderA = a[1].orderNum || 99;
    const orderB = b[1].orderNum || 99;
    return orderA - orderB;
  });

  const handleBackFromMembers = () => {
    setSelectedGuildId(null);
    fetchAllMembers();
  };

  if (selectedGuildId) {
    return <GuildMembersManager guildId={selectedGuildId} onBack={handleBackFromMembers} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-stone-800">{t('nav.guild_management')}</h2>
        <button
          onClick={() => fetchAllMembers()}
          className="p-2 text-stone-500 hover:bg-stone-200 rounded-full transition-colors"
          title={t('common.reset')}
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder={t('guilds.guild_name')}
          className="flex-1 p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
          value={newGuildName}
          onChange={e => setNewGuildName(e.target.value)}
        />
        <button onClick={handleAddGuild} disabled={isSaving} className="px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 flex items-center gap-2 disabled:opacity-50">
          {isSaving ? t('common.loading') : <><Plus className="w-5 h-5" /> {t('guilds.add_guild')}</>}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(tier => {
          const tierGuilds = sortedGuilds.filter(g => (g[1].tier || 1) === tier);
          if (tierGuilds.length === 0) return null;
          return (
            <div key={tier} className="flex flex-col gap-3">
              <h3 className={`font-bold text-center py-2 rounded-lg border ${getTierColor(tier)}`}>{t('common.tier')} {tier}</h3>
              {tierGuilds.map(([id, guild]) => (
                <div
                  key={id}
                  onClick={() => { if (!editingGuildId) setSelectedGuildId(id); }}
                  className={`p-4 border border-stone-200 rounded-xl bg-stone-50 flex flex-col gap-3 transition-colors group ${!editingGuildId ? `cursor-pointer ${getTierBorderHoverClass(tier)}` : ''}`}
                >
                  {editingGuildId === id ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                        value={editGuildName}
                        onChange={e => setEditGuildName(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder={t('guilds.guild_name')}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <select
                          className="flex-1 p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                          value={editGuildTier}
                          onChange={e => setEditGuildTier(Number(e.target.value))}
                          onClick={e => e.stopPropagation()}
                        >
                          <option value={1}>{t('common.tier')} 1</option>
                          <option value={2}>{t('common.tier')} 2</option>
                          <option value={3}>{t('common.tier')} 3</option>
                          <option value={4}>{t('common.tier')} 4</option>
                        </select>
                        <input
                          type="number"
                          className="w-20 p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                          value={editGuildOrder}
                          onChange={e => setEditGuildOrder(Number(e.target.value))}
                          onClick={e => e.stopPropagation()}
                          placeholder={t('common.order')}
                          min={1}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="flex-1 p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1"><Save className="w-4 h-4" /> {t('common.save')}</button>
                        <button onClick={(e) => { e.stopPropagation(); setEditingGuildId(null); }} className="flex-1 p-2 bg-stone-200 text-stone-600 rounded-lg hover:bg-stone-300 transition-colors flex items-center justify-center gap-1"><X className="w-4 h-4" /> {t('common.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-stone-200 text-stone-600 text-xs font-bold rounded">{t('common.order')} {guild.orderNum || 1}</span>
                        </div>
                        <h3 className="font-bold text-lg text-stone-800 group-hover:text-amber-700 transition-colors">{guild.name}</h3>
                        <p className={`text-sm font-medium ${getMemberCount(id) > 30 ? 'text-red-500 bg-red-50 px-1 py-0.5 rounded inline-block' : 'text-stone-500'}`}>
                          {t('guilds.member_count')}: {getMemberCount(id)} / 30
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => startEdit(e, id, guild)} className="p-2 text-stone-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title={t('common.edit')}><Edit2 className="w-5 h-5" /></button>
                        <button onClick={(e) => handleDelete(e, id)} className="p-2 text-stone-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={t('common.delete')}><Trash2 className="w-5 h-5" /></button>
                        <Users className="w-5 h-5 ml-1 text-stone-400 group-hover:text-amber-500 transition-colors" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
        isDanger={confirmModal.isDanger}
        confirmText={confirmModal.isDanger ? t('common.delete') : t('common.confirm')}
      />
    </div>
  );
}

function GuildMembersManager({ guildId, onBack }: { guildId: string, onBack: () => void }) {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, addMember, deleteMember, updateMember, fetchMembers, archiveMember, showToast: showGlobalToast } = useAppContext();
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isBatchAdding, setIsBatchAdding] = useState(false);
  const [batchInput, setBatchInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{ name: string, role: Role, note: string, targetGuildId: string }>({
    name: '',
    role: 'member',
    note: '',
    targetGuildId: db.guilds[guildId]?.id
  });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    isDanger: false
  });
  const [archiveModal, setArchiveModal] = useState<{
    isOpen: boolean;
    memberId: string;
    memberName: string;
    guildName: string;
    reason: string;
  }>({
    isOpen: false,
    memberId: '',
    memberName: '',
    guildName: '',
    reason: ''
  });
  const [isArchiving, setIsArchiving] = useState(false);

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));
  const closeArchiveModal = () => setArchiveModal(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    fetchMembers(guildId, true);
  }, [guildId]);

  const sortedGuilds = (Object.entries(db.guilds) as [string, any][]).sort((a, b) => {
    const tierA = a[1].tier || 99;
    const tierB = b[1].tier || 99;
    if (tierA !== tierB) return tierA - tierB;
    const orderA = a[1].orderNum || 99;
    const orderB = b[1].orderNum || 99;
    return orderA - orderB;
  });

  const guild = db.guilds[guildId];
  const members = Object.entries(db.members)
    .filter(([_, m]: [string, any]) => m.guildId === guildId)
    .sort((a: [string, any], b: [string, any]) => {
      const roleOrder: Record<string, number> = {
        'leader': 1,
        'coleader': 2,
        'member': 3
      };
      const orderA = roleOrder[a[1].role] || 99;
      const orderB = roleOrder[b[1].role] || 99;

      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a[1].name.localeCompare(b[1].name);
    });

  const getMemberCount = (gId: string) => Object.values(db.members).filter((m: any) => m.guildId === gId).length;
  const getGuildMaster = (gId: string) => Object.entries(db.members).find(([_, m]: [string, any]) => m.guildId === gId && m.role === 'leader');
  const getGuildDeputy = (gId: string) => Object.entries(db.members).find(([_, m]: [string, any]) => m.guildId === gId && m.role === 'coleader');

  const validateMoveOrAdd = (targetGId: string, role: Role, excludeMemberId?: string) => {
    if (!targetGId) return t('members.select_guild_required');
    if (!formData.name.trim()) return t('members.name_required');

    // Check role limits only if role is changing or new member
    // This logic is simplified for now
    if (role === 'leader') {
      const master = getGuildMaster(targetGId);
      if (master && master[0] !== excludeMemberId) return t('members.guild_has_master');
    }
    if (role === 'coleader') {
      const deputy = getGuildDeputy(targetGId);
      if (deputy && deputy[0] !== excludeMemberId) return t('members.guild_has_deputy');
    }
    return null;
  };

  const handleSave = async () => {
    const error = validateMoveOrAdd(formData.targetGuildId, formData.role, editingId || undefined);
    if (error) {
      showGlobalToast(error, 'warning');
      return;
    }
    setIsSaving(true);
    try {
      if (editingId) {
        await updateMember(editingId, {
          name: formData.name,
          role: formData.role,
          note: formData.note,
          guildId: formData.targetGuildId
        });
        setEditingId(null);
        showGlobalToast(t('members.update_success'), 'success');
      } else {
        await addMember(formData.targetGuildId, formData.name, formData.role, formData.note);
        setIsAdding(false);
        showGlobalToast(t('members.add_success'), 'success');
      }
      setFormData({ name: '', role: 'member', note: '', targetGuildId: guildId });
    } catch (error: any) {
      console.error("Error saving member:", error);
      showGlobalToast(`${t('members.update_failed')}: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveClick = (memberId: string, memberName: string) => {
    const guildName = db.guilds[guildId]?.name || t('common.unknown');
    setArchiveModal({
      isOpen: true,
      memberId,
      memberName,
      guildName,
      reason: ''
    });
  };

  const handleConfirmArchive = async () => {
    if (!archiveModal.memberId) return;

    setIsArchiving(true);
    try {
      await archiveMember(archiveModal.memberId, guildId, archiveModal.reason);
      showGlobalToast(t('members.archive_success'), 'success');
      closeArchiveModal();
    } catch (error: any) {
      console.error("Archive failed:", error);
      showGlobalToast(`${t('members.archive_failed')}: ${error.message}`, 'error');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDeleteMember = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: t('members.delete_member'),
      message: t('members.confirm_delete'),
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteMember(id);
          closeConfirmModal();
          showGlobalToast(t('members.delete_success'), 'success');
        } catch (error: any) {
          console.error("Error deleting member:", error);
          showGlobalToast(`${t('members.delete_failed')}: ${error.message}`, 'error');
          closeConfirmModal();
        }
      }
    });
  };

  const startEdit = (id: string) => {
    setEditingId(id);
    setFormData({
      name: db.members[id].name,
      role: db.members[id].role,
      note: db.members[id].note || '',
      targetGuildId: db.members[id].guildId
    });
  };

  const cancelEdit = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ name: '', role: 'member', note: '', targetGuildId: guildId });
  };

  const handleBatchAdd = async () => {
    if (!batchInput.trim()) return;
    const lines = batchInput.split('\n').map(l => l.trim()).filter(l => l);
    setIsSaving(true);
    try {
      // Batch add logic
      for (const line of lines) {
        const parts = line.split(/[,，\t]/).map(s => s.trim());
        const name = parts[0];
        const roleStr = parts[1] || '';
        const note = parts.slice(2).join(',').trim();

        let role: Role = 'member';
        if (roleStr === 'Master' || roleStr === '會長' || roleStr === 'leader' || roleStr === 'Leader') role = 'leader';
        else if (roleStr === 'Deputy' || roleStr === '副會長' || roleStr === 'coleader' || roleStr === 'Co-leader') role = 'coleader';

        if (name) {
          await addMember(guildId, name, role, note);
        }
      }

      setBatchInput('');
      setIsBatchAdding(false);
      showGlobalToast(t('members.batch_add_success'), 'success');
    } catch (error: any) {
      console.error("Error batch adding members:", error);
      showGlobalToast(`${t('members.batch_add_failed')}: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
          <ChevronLeft className="w-6 h-6 text-stone-600" />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-stone-800">{guild.name} - {t('nav.guild_management')}</h2>
          <p className={`text-sm font-medium ${members.length > 30 ? 'text-red-500 bg-red-50 px-2 py-0.5 rounded inline-block' : 'text-stone-500'}`}>
            {t('guilds.member_count')}: {members.length} / 30
          </p>
        </div>
        {!isAdding && !editingId && !isBatchAdding && (
          <div className="flex gap-2">
            <button onClick={() => setIsAdding(true)} className="px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 flex items-center gap-2">
              <Plus className="w-5 h-5" /> {t('members.add_member')}
            </button>
            <button onClick={() => setIsBatchAdding(true)} className="px-4 py-2 bg-stone-200 text-stone-800 rounded-lg hover:bg-stone-300 flex items-center gap-2">
              {t('members.batch_add')}
            </button>
          </div>
        )}
      </div>

      {isBatchAdding && (
        <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 mb-6 flex flex-col gap-4">
          <label className="block text-sm font-medium text-stone-600 whitespace-pre-line">{t('members.batch_add_placeholder')}</label>
          <textarea
            className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none min-h-[100px]"
            placeholder="Player1, Master, Note1&#10;Player2, Member&#10;Player3"
            value={batchInput}
            onChange={e => setBatchInput(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={handleBatchAdd} disabled={isSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {isSaving ? t('common.loading') : t('common.confirm')}
            </button>
            <button onClick={() => { setIsBatchAdding(false); setBatchInput(''); }} className="px-4 py-2 bg-stone-300 text-stone-800 rounded-lg hover:bg-stone-400">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {isAdding && (
        <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 mb-6 flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-stone-600 mb-1">{t('common.name')}</label>
            <input
              type="text"
              className="w-full p-2 border border-stone-300 rounded-lg"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-stone-600 mb-1">{t('common.role')}</label>
            <select
              className="w-full p-2 border border-stone-300 rounded-lg"
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value as Role })}
            >
              <option value="member">{t('roles.member')}</option>
              <option value="coleader">{t('roles.coleader')}</option>
              <option value="leader">{t('roles.leader')}</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-stone-600 mb-1">{t('members.target_guild')}</label>
            <div className="w-full p-2 border border-stone-200 rounded-lg bg-stone-100 text-stone-500">
              {db.guilds[guildId]?.name || t('common.unknown')}
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-stone-600 mb-1">{t('common.note')}</label>
            <input
              type="text"
              className="w-full p-2 border border-stone-300 rounded-lg"
              value={formData.note}
              onChange={e => setFormData({ ...formData, note: e.target.value })}
              placeholder={t('common.note')}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {isSaving ? t('common.loading') : t('common.save')}
            </button>
            <button onClick={cancelEdit} className="px-4 py-2 bg-stone-300 text-stone-800 rounded-lg hover:bg-stone-400">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-stone-200 text-stone-600">
              <th className="p-3 font-semibold">{t('common.name')}</th>
              <th className="p-3 font-semibold">{t('common.role')}</th>
              <th className="p-3 font-semibold">{t('common.note')}</th>
              <th className="p-3 font-semibold">{t('common.history')}</th>
              <th className="p-3 font-semibold text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {members.map(([id, member]: [string, any]) => {
              const isEditing = editingId === id;
              if (isEditing) {
                return (
                  <tr key={id} className="bg-amber-50/50 border-b border-stone-100">
                    <td className="p-2">
                      <input
                        type="text"
                        className="w-full p-1.5 border border-stone-300 rounded bg-white text-sm"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        autoFocus
                      />
                    </td>
                    <td className="p-2">
                      <select
                        className="w-full p-1.5 border border-stone-300 rounded bg-white text-sm"
                        value={formData.role}
                        onChange={e => setFormData({ ...formData, role: e.target.value as Role })}
                      >
                        <option value="member">{t('roles.member')}</option>
                        <option value="coleader">{t('roles.coleader')}</option>
                        <option value="leader">{t('roles.leader')}</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-col gap-1">
                        <select
                          className="w-full p-1.5 border border-stone-300 rounded bg-white text-xs mb-1"
                          value={formData.targetGuildId}
                          onChange={(e) => setFormData({ ...formData, targetGuildId: e.target.value })}
                        >
                          {(sortedGuilds as [string, any][]).map(([gId, g]) => (
                            <option key={gId} value={gId}>{g.name}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          className="w-full p-1.5 border border-stone-300 rounded bg-white text-sm"
                          value={formData.note}
                          onChange={e => setFormData({ ...formData, note: e.target.value })}
                          placeholder={t('common.note')}
                        />
                      </div>
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={handleSave}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title={t('common.save')}
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-2 text-stone-400 hover:bg-stone-100 rounded-lg transition-colors"
                          title={t('common.cancel')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="p-3 font-medium text-stone-800">{member.name}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${member.role === 'leader' ? 'bg-red-100 text-red-800' :
                      member.role === 'coleader' ? 'bg-amber-100 text-amber-800' :
                        'bg-stone-200 text-stone-700'
                      }`}>
                      {member.role === 'leader' ? t('roles.leader') : member.role === 'coleader' ? t('roles.coleader') : t('roles.member')}
                    </span>
                  </td>
                  <td className="p-3 text-stone-500 text-sm">{member.note}</td>
                  <td className="p-3 text-stone-400 text-xs">{member.archiveRemark}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => startEdit(id)}
                        className="p-2 text-stone-500 hover:bg-stone-100 rounded-lg transition-colors"
                        title={t('common.edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleArchiveClick(id, member.name)}
                        className="p-2 text-stone-500 hover:bg-amber-50 hover:text-amber-600 rounded-lg transition-colors"
                        title={t('members.archive_member')}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteMember(id)}
                        className="p-2 text-stone-500 hover:bg-stone-100 rounded-lg transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-stone-500">
                  {t('common.noData')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
        isDanger={confirmModal.isDanger}
        confirmText={confirmModal.isDanger ? t('common.delete') : t('common.confirm')}
      />

      {/* Archive Modal */}
      {archiveModal.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                <Archive className="w-5 h-5 text-amber-600" />
                {t('members.archive_member')}
              </h3>
              <button onClick={closeArchiveModal} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-bold mb-1">{t('members.confirm_archive')}</p>
                  <p><strong>{archiveModal.memberName}</strong> - <strong>{archiveModal.guildName}</strong></p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">
                  {t('members.archive_reason')} <span className="text-stone-400 font-normal">({t('common.optional')})</span>
                </label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-stone-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                  placeholder={t('common.note')}
                  value={archiveModal.reason}
                  onChange={(e) => setArchiveModal(prev => ({ ...prev, reason: e.target.value }))}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  onClick={handleConfirmArchive}
                  disabled={isArchiving}
                  className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isArchiving ? t('common.processing') : t('common.confirm')}
                </button>
                <button
                  onClick={closeArchiveModal}
                  disabled={isArchiving}
                  className="flex-1 py-2.5 bg-stone-200 text-stone-700 rounded-xl font-bold hover:bg-stone-300 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CostumesManager() {
  const { t, i18n } = useTranslation(['admin', 'translation']);
  const { db, addCharacter, updateCharacter, deleteCharacter, addCostume, updateCostume, deleteCostume, updateCharactersOrder, updateCostumesOrder, showToast } = useAppContext();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedCostumeId, setSelectedCostumeId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    isDanger: false
  });

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  const characters = useMemo(() =>
    Object.values(db.characters).sort((a, b) => a.orderNum - b.orderNum),
    [db.characters]);

  const costumes = useMemo(() =>
    Object.values(db.costumes)
      .filter(c => c.characterId === selectedCharacterId)
      .sort((a, b) => (a.orderNum ?? 999) - (b.orderNum ?? 999)),
    [db.costumes, selectedCharacterId]);

  const selectedCharacter = selectedCharacterId ? db.characters[selectedCharacterId] : null;
  const selectedCostume = selectedCostumeId ? db.costumes[selectedCostumeId] : null;

  // Edit states
  const [editCharacterName, setEditCharacterName] = useState('');
  const [editCharacterNameE, setEditCharacterNameE] = useState('');
  const [editCharacterOrder, setEditCharacterOrder] = useState(0);
  const [editCostumeName, setEditCostumeName] = useState('');
  const [editCostumeNameE, setEditCostumeNameE] = useState('');
  const [editCostumeOrder, setEditCostumeOrder] = useState(0);
  const [editCostumeImageName, setEditCostumeImageName] = useState('');
  const [editCostumeIsNew, setEditCostumeIsNew] = useState(false);

  // Reorder & Input Modal State
  const [isReorderingCharacters, setIsReorderingCharacters] = useState(false);
  const [orderedCharacters, setOrderedCharacters] = useState<Character[]>([]);
  const [isReorderingCostumes, setIsReorderingCostumes] = useState(false);
  const [orderedCostumes, setOrderedCostumes] = useState<Costume[]>([]);
  const [saveSuccess, setSaveSuccess] = useState<'character' | 'costume' | null>(null);

  const [inputModal, setInputModal] = useState<{
    isOpen: boolean;
    title: string;
    message?: string;
    onConfirm: (value: string) => void;
  }>({ isOpen: false, title: '', onConfirm: () => { } });

  const closeInputModal = () => setInputModal(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    if (!isReorderingCharacters) {
      setOrderedCharacters(characters);
    }
  }, [characters, isReorderingCharacters]);

  useEffect(() => {
    if (!isReorderingCostumes) {
      setOrderedCostumes(costumes);
    }
  }, [costumes, isReorderingCostumes]);

  const handleSaveCharacterOrder = async () => {
    setIsReorderingCharacters(false);
    setSaveSuccess('character');
    setTimeout(() => setSaveSuccess(null), 2000);
    try {
      await updateCharactersOrder(orderedCharacters);
    } catch (error: any) {
      showToast(`${t('costumes.reorder_failed')}: ${error.message}`, 'error');
    }
  };

  const handleSaveCostumeOrder = async () => {
    setIsReorderingCostumes(false);
    setSaveSuccess('costume');
    setTimeout(() => setSaveSuccess(null), 2000);
    try {
      await updateCostumesOrder(orderedCostumes);
    } catch (error: any) {
      showToast(`${t('costumes.reorder_failed')}: ${error.message}`, 'error');
    }
  };

  useEffect(() => {
    if (selectedCharacter) {
      setEditCharacterName(selectedCharacter.name);
      setEditCharacterNameE(selectedCharacter.nameE ?? '');
      setEditCharacterOrder(selectedCharacter.orderNum);
    } else {
      setSelectedCharacterId(null);
    }
  }, [selectedCharacter]);

  useEffect(() => {
    if (selectedCostume) {
      setEditCostumeName(selectedCostume.name);
      setEditCostumeNameE(selectedCostume.nameE ?? '');
      setEditCostumeOrder(selectedCostume.orderNum ?? 0);
      setEditCostumeImageName(selectedCostume.imageName ?? '');
      setEditCostumeIsNew(selectedCostume.isNew ?? false);
    } else {
      setSelectedCostumeId(null);
    }
  }, [selectedCostume]);

  const handleSelectCharacter = (id: string) => {
    setSelectedCharacterId(id);
    setSelectedCostumeId(null);
  };

  const handleAddCharacter = () => {
    setInputModal({
      isOpen: true,
      title: t('costumes.add_character'),
      message: `${t('costumes.add_character')}:`,
      onConfirm: async (name) => {
        try {
          await addCharacter(name, characters.length + 1);
          closeInputModal();
          showToast(t('costumes.add_character_success'), 'success');
        } catch (error: any) {
          showToast(`${t('costumes.add_character_failed')}: ${error.message}`, 'error');
        }
      }
    });
  };

  const handleDeleteCharacter = async () => {
    if (!selectedCharacterId) return;

    setConfirmModal({
      isOpen: true,
      title: t('costumes.delete_character'),
      message: t('costumes.confirm_delete_character'),
      isDanger: true,
      onConfirm: async () => {
        try {
          // Cascade delete costumes
          const characterCostumes = Object.values(db.costumes).filter(c => c.characterId === selectedCharacterId);
          for (const costume of characterCostumes) {
            await deleteCostume(costume.id);
          }

          await deleteCharacter(selectedCharacterId);
          setSelectedCharacterId(null);
          setSelectedCostumeId(null);
          closeConfirmModal();
          showToast(t('costumes.delete_character_success'), 'success');
        } catch (error: any) {
          console.error("Error deleting character:", error);
          showToast(`${t('costumes.delete_character_failed')}: ${error.message}`, 'error');
          closeConfirmModal();
        }
      }
    });
  };

  const handleUpdateCharacter = async () => {
    if (!selectedCharacterId) return;
    await updateCharacter(selectedCharacterId, {
      name: editCharacterName,
      nameE: editCharacterNameE,
      orderNum: editCharacterOrder
    });
    showToast(t('costumes.update_character_success'), 'success');
  };

  const handleAddCostume = () => {
    if (!selectedCharacterId) return;
    setInputModal({
      isOpen: true,
      title: t('costumes.add_costume'),
      message: `${t('costumes.add_costume')}:`,
      onConfirm: async (name) => {
        try {
          await addCostume(selectedCharacterId, name, costumes.length + 1);
          closeInputModal();
          showToast(t('costumes.add_costume_success'), 'success');
        } catch (error: any) {
          showToast(`${t('costumes.add_costume_failed')}: ${error.message}`, 'error');
        }
      }
    });
  };

  const handleDeleteCostume = async () => {
    if (!selectedCostumeId) return;

    setConfirmModal({
      isOpen: true,
      title: t('costumes.delete_costume'),
      message: t('costumes.confirm_delete_costume'),
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteCostume(selectedCostumeId);
          setSelectedCostumeId(null);
          closeConfirmModal();
          showToast(t('costumes.delete_costume_success'), 'success');
        } catch (error: any) {
          showToast(`${t('costumes.delete_costume_failed')}: ${error.message}`, 'error');
          closeConfirmModal();
        }
      }
    });
  };

  const [isCostumeSaved, setIsCostumeSaved] = useState(false);

  const handleUpdateCostume = async () => {
    if (!selectedCostumeId) return;
    await updateCostume(selectedCostumeId, {
      name: editCostumeName,
      nameE: editCostumeNameE,
      orderNum: editCostumeOrder,
      imageName: editCostumeImageName,
      isNew: editCostumeIsNew
    });
    setIsCostumeSaved(true);
    setTimeout(() => setIsCostumeSaved(false), 2000);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-stone-800">{t('nav.costume_db')}</h2>
      <div className="grid grid-cols-12 gap-6 h-[600px]">
        {/* Characters Column */}
        <div className="col-span-3 bg-stone-50 rounded-xl border border-stone-200 p-4 overflow-y-auto flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{t('costumes.character')}</h3>
            <div className="flex gap-1">
              {saveSuccess === 'character' && (
                <div className="p-1.5 text-emerald-600 flex items-center justify-center" title={t('common.save_success')}>
                  <Check className="w-4 h-4" />
                </div>
              )}
              <button
                onClick={() => isReorderingCharacters ? handleSaveCharacterOrder() : setIsReorderingCharacters(true)}
                className={`p-1.5 rounded-lg transition-colors ${isReorderingCharacters ? 'bg-amber-200 text-amber-800' : 'bg-stone-200 hover:bg-stone-300 text-stone-700'}`}
                title={isReorderingCharacters ? t('costumes.save_order') : t('costumes.reorder_character')}
              >
                {isReorderingCharacters ? <Save className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
              </button>
              <button onClick={handleAddCharacter} className="p-1.5 bg-stone-200 hover:bg-stone-300 rounded-lg transition-colors" title={t('costumes.add_character')}>
                <Plus className="w-4 h-4 text-stone-700" />
              </button>
            </div>
          </div>

          {isReorderingCharacters ? (
            <div className="flex-1 overflow-y-auto flex flex-col">
              <Reorder.Group axis="y" values={orderedCharacters} onReorder={setOrderedCharacters} className="space-y-2 flex-1">
                {orderedCharacters.map(char => (
                  <Reorder.Item key={char.id} value={char} className="bg-white p-2 rounded-lg shadow-sm border border-stone-200 flex items-center gap-3 cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-4 h-4 text-stone-400" />
                    <img src={getImageUrl(Object.values(db.costumes).find(c => c.characterId === char.id)?.imageName)} alt={char.name} className="w-8 h-8 rounded-md object-cover" />
                    <span>{i18n.language === 'en' ? (char.nameE || char.name) : char.name}</span>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
              <div className="mt-4 flex gap-2 sticky bottom-0 bg-stone-50 pt-2">
                <button onClick={handleSaveCharacterOrder} className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700">{t('common.save')}</button>
                <button onClick={() => setIsReorderingCharacters(false)} className="flex-1 py-2 bg-stone-200 text-stone-600 rounded-lg text-sm hover:bg-stone-300">{t('common.cancel')}</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto">
              {characters.map(char => (
                <button
                  key={char.id}
                  onClick={() => handleSelectCharacter(char.id)}
                  className={`w-full text-left p-2 rounded-lg flex items-center gap-3 ${selectedCharacterId === char.id ? 'bg-amber-100 text-amber-800' : 'hover:bg-stone-200'}`}>
                  <img src={getImageUrl(Object.values(db.costumes).find(c => c.characterId === char.id)?.imageName)} alt={char.name} className="w-10 h-10 rounded-md object-cover" />
                  <span>{i18n.language === 'en' ? (char.nameE || char.name) : char.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Costumes Column */}
        <div className="col-span-4 bg-stone-50 rounded-xl border border-stone-200 p-4 overflow-y-auto flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{selectedCharacter ? (i18n.language === 'en' ? (selectedCharacter.nameE || selectedCharacter.name) : selectedCharacter.name) : t('costumes.costume')}</h3>
            {selectedCharacterId && (
              <div className="flex gap-1">
                {saveSuccess === 'costume' && (
                  <div className="p-1.5 text-emerald-600 flex items-center justify-center" title={t('common.save_success')}>
                    <Check className="w-4 h-4" />
                  </div>
                )}
                <button
                  onClick={() => isReorderingCostumes ? handleSaveCostumeOrder() : setIsReorderingCostumes(true)}
                  className={`p-1.5 rounded-lg transition-colors ${isReorderingCostumes ? 'bg-amber-200 text-amber-800' : 'bg-stone-200 hover:bg-stone-300 text-stone-700'}`}
                  title={isReorderingCostumes ? t('costumes.save_order') : t('costumes.reorder_costume')}
                >
                  {isReorderingCostumes ? <Save className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                </button>
                <button onClick={handleAddCostume} className="p-1.5 bg-stone-200 hover:bg-stone-300 rounded-lg transition-colors" title={t('costumes.add_costume')}>
                  <Plus className="w-4 h-4 text-stone-700" />
                </button>
              </div>
            )}
          </div>
          {selectedCharacterId && (
            isReorderingCostumes ? (
              <div className="flex-1 overflow-y-auto flex flex-col">
                <Reorder.Group axis="y" values={orderedCostumes} onReorder={setOrderedCostumes} className="space-y-2 flex-1">
                  {orderedCostumes.map(costume => (
                    <Reorder.Item key={costume.id} value={costume} className="bg-white p-2 rounded-lg shadow-sm border border-stone-200 flex items-center gap-3 cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-4 h-4 text-stone-400" />
                      <img src={getImageUrl(costume.imageName)} alt={costume.name} className="w-8 h-8 rounded-md object-cover" />
                      <span>{i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}</span>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
                <div className="mt-4 flex gap-2 sticky bottom-0 bg-stone-50 pt-2">
                  <button onClick={handleSaveCostumeOrder} className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700">{t('common.save')}</button>
                  <button onClick={() => setIsReorderingCostumes(false)} className="flex-1 py-2 bg-stone-200 text-stone-600 rounded-lg text-sm hover:bg-stone-300">{t('common.cancel')}</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 flex-1 overflow-y-auto">
                {costumes.map(costume => (
                  <button
                    key={costume.id}
                    onClick={() => setSelectedCostumeId(costume.id)}
                    className={`w-full text-left p-2 rounded-lg flex items-center gap-3 ${selectedCostumeId === costume.id ? 'bg-amber-100 text-amber-800' : 'hover:bg-stone-200'}`}>
                    <img src={getImageUrl(costume.imageName)} alt={costume.name} className="w-10 h-10 rounded-md object-cover" />
                    <span>{i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}</span>
                    {costume.isNew && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">NEW</span>}
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        {/* Edit Column */}
        <div className="col-span-5 bg-stone-50 rounded-xl border border-stone-200 p-4 overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4">{t('common.edit')}</h3>
          {selectedCostume && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">{t('costumes.costume_name')}</label>
                <input type="text" value={editCostumeName} onChange={e => setEditCostumeName(e.target.value)} className="w-full p-2 border border-stone-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">{t('costumes.costume_name')} (EN)</label>
                <input type="text" value={editCostumeNameE} onChange={e => setEditCostumeNameE(e.target.value)} className="w-full p-2 border border-stone-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">{t('costumes.order')}</label>
                <input type="number" value={editCostumeOrder} onChange={e => setEditCostumeOrder(Number(e.target.value))} className="w-full p-2 border border-stone-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">{t('costumes.image_name')}</label>
                <input type="text" value={editCostumeImageName} onChange={e => setEditCostumeImageName(e.target.value)} className="w-full p-2 border border-stone-300 rounded-lg" />
              </div>
              <div className="flex items-center">
                <input type="checkbox" id="isNew" checked={editCostumeIsNew} onChange={e => setEditCostumeIsNew(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                <label htmlFor="isNew" className="ml-2 block text-sm text-stone-900">{t('costumes.mark_new')}</label>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateCostume}
                  className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors flex items-center justify-center gap-2 ${isCostumeSaved ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                >
                  {isCostumeSaved ? <><Check className="w-4 h-4" /> {t('common.save_success')}</> : t('costumes.save_costume')}
                </button>
                <button onClick={handleDeleteCostume} className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200" title={t('costumes.delete_costume')}>
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
          {selectedCharacter && !selectedCostume && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">{t('costumes.character_name')}</label>
                <input type="text" value={editCharacterName} onChange={e => setEditCharacterName(e.target.value)} className="w-full p-2 border border-stone-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">{t('costumes.character_name')} (EN)</label>
                <input type="text" value={editCharacterNameE} onChange={e => setEditCharacterNameE(e.target.value)} className="w-full p-2 border border-stone-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">{t('costumes.order')}</label>
                <input type="number" value={editCharacterOrder} onChange={e => setEditCharacterOrder(Number(e.target.value))} className="w-full p-2 border border-stone-300 rounded-lg" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleUpdateCharacter} className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700">{t('costumes.save_character')}</button>
                <button onClick={handleDeleteCharacter} className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200" title={t('costumes.delete_character')}>
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
        isDanger={confirmModal.isDanger}
      />
      <InputModal
        isOpen={inputModal.isOpen}
        title={inputModal.title}
        message={inputModal.message}
        onConfirm={inputModal.onConfirm}
        onCancel={closeInputModal}
      />
    </div>
  );
}

function BackupManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, restoreData, showToast } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = () => {
    try {
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(db, null, 2)
      )}`;
      const link = document.createElement("a");
      link.href = jsonString;
      link.download = `kazran_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } catch (error) {
      console.error("Backup failed:", error);
      showToast(t('backup.backup_failed'), 'error');
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
          // Basic validation
          if (restoredDb.guilds && restoredDb.members && restoredDb.costumes) {
            await restoreData(restoredDb);
            showToast(t('backup.restore_success'), 'success');
          } else {
            showToast(t('backup.invalid_format'), 'error');
          }
        }
      } catch (error) {
        console.error("Restore failed:", error);
        showToast(t('backup.restore_failed'), 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6 text-stone-800 flex items-center gap-2">
        <Save className="w-6 h-6 text-amber-600" />
        {t('nav.backup_restore')}
      </h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-stone-50 p-8 rounded-2xl border border-stone-200 flex flex-col items-center justify-center text-center">
          <div className="p-4 bg-blue-100 rounded-full text-blue-600 mb-4">
            <Download className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-stone-800 mb-2">{t('backup.download_backup')}</h3>
          <p className="text-stone-500 mb-6 max-w-md">
            {t('backup.download_desc')}
          </p>
          <button
            onClick={handleBackup}
            className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95 shadow-md"
          >
            {t('backup.download_btn')}
          </button>
        </div>

        <div className="bg-stone-50 p-8 rounded-2xl border border-stone-200 flex flex-col items-center justify-center text-center">
          <div className="p-4 bg-green-100 rounded-full text-green-600 mb-4">
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-stone-800 mb-2">{t('backup.restore_from_file')}</h3>
          <p className="text-stone-500 mb-6 max-w-md">
            {t('backup.restore_desc')}
          </p>
          <input type="file" accept=".json" onChange={handleRestore} ref={fileInputRef} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all active:scale-95 shadow-md"
          >
            {t('backup.restore_btn')}
          </button>
        </div>
      </div>
      <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
        <div className="flex">
          <div className="py-1"><AlertCircle className="h-5 w-5 text-amber-500 mr-3" /></div>
          <div>
            <p className="font-bold text-amber-800">{t('backup.important_notice')}</p>
            <p className="text-sm text-amber-700">
              {t('backup.important_desc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, updateSetting, showToast } = useAppContext();
  const firstSettingId = db.settings && Object.keys(db.settings).length > 0 ? Object.keys(db.settings)[0] : 'default';
  const [bgmUrl, setBgmUrl] = useState(db.settings?.[firstSettingId]?.bgmUrl || '');
  const [bgmVolume, setBgmVolume] = useState(db.settings?.[firstSettingId]?.bgmVolume ?? 50);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (db.settings && Object.keys(db.settings).length > 0) {
      const id = Object.keys(db.settings)[0];
      setBgmUrl(db.settings[id].bgmUrl || '');
      setBgmVolume(db.settings[id].bgmVolume ?? 50);
    }
  }, [db.settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSetting(firstSettingId, bgmUrl, bgmVolume);
      showToast(t('settings.save_success'), 'success');
    } catch (error: any) {
      console.error("Error saving settings:", error);
      showToast(`${t('settings.save_failed')}: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6 text-stone-800 flex items-center gap-2">
        <Settings className="w-6 h-6 text-amber-600" />
        {t('nav.settings')}
      </h2>

      <div className="bg-stone-50 p-6 rounded-2xl border border-stone-200">
        <h3 className="text-lg font-bold text-stone-800 mb-4">{t('settings.bgm')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">
              {t('settings.bgm_url')}
            </label>
            <input
              type="text"
              value={bgmUrl}
              onChange={(e) => setBgmUrl(e.target.value)}
              placeholder="https://example.com/music.mp3"
              className="w-full p-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
            />
            <p className="text-xs text-stone-500 mt-2">
              {t('settings.bgm_hint')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">
              {t('settings.bgm_volume')} ({bgmVolume}%)
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={bgmVolume}
              onChange={(e) => setBgmVolume(Number(e.target.value))}
              className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition-all active:scale-95 shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? t('common.saving') : <><Save className="w-4 h-4" /> {t('common.save')}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
