import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/store';
import { Plus, Edit2, Trash2, Users, Save, X, RefreshCw } from 'lucide-react';
import ConfirmModal from '@shared/ui/ConfirmModal';
import { getTierColor, getTierBorderHoverClass } from '@/shared/lib/utils';
import { useTranslation } from 'react-i18next';
import GuildMembersManager from './GuildMembersManager';

export default function GuildsManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, addGuild, updateGuild, deleteGuild, fetchAllMembers, showToast } = useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [editingGuildId, setEditingGuildId] = useState<string | null>(null);
  const [editGuildName, setEditGuildName] = useState('');
  const [editGuildTier, setEditGuildTier] = useState<number>(1);
  const [editGuildOrder, setEditGuildOrder] = useState<number>(1);
  const [editGuildIsDisplay, setEditGuildIsDisplay] = useState<boolean>(true);

  // Add Guild Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newGuildName, setNewGuildName] = useState('');
  const [newGuildTier, setNewGuildTier] = useState<number>(1);
  const [newGuildOrder, setNewGuildOrder] = useState<number>(1);

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

  const sortedGuilds = (Object.entries(db.guilds) as [string, any][]).sort((a, b) => {
    const tierA = a[1].tier || 99;
    const tierB = b[1].tier || 99;
    if (tierA !== tierB) return tierA - tierB;
    const orderA = a[1].orderNum || 99;
    const orderB = b[1].orderNum || 99;
    return orderA - orderB;
  });

  const handleOpenAddModal = () => {
    setNewGuildName('');
    setNewGuildTier(1);
    
    // Find the next order number for tier 1
    const tier1Guilds = sortedGuilds.filter(g => (g[1].tier || 1) === 1);
    const nextOrder = tier1Guilds.length > 0 
      ? Math.max(...tier1Guilds.map(g => g[1].orderNum || 1)) + 1 
      : 1;
    
    setNewGuildOrder(nextOrder);
    setIsAddModalOpen(true);
  };

  const handleTierChange = (tier: number) => {
    setNewGuildTier(tier);
    // Find the next order number for the selected tier
    const tierGuilds = sortedGuilds.filter(g => (g[1].tier || 1) === tier);
    const nextOrder = tierGuilds.length > 0 
      ? Math.max(...tierGuilds.map(g => g[1].orderNum || 1)) + 1 
      : 1;
    setNewGuildOrder(nextOrder);
  };

  const handleAddGuild = async () => {
    if (!newGuildName.trim()) return;
    setIsSaving(true);
    try {
      // Add guild with name, then update it with tier and order
      const newGuildId = await addGuild(newGuildName.trim());
      if (newGuildId) {
        await updateGuild(newGuildId, {
          name: newGuildName.trim(),
          tier: newGuildTier,
          orderNum: newGuildOrder,
          isDisplay: true
        });
      }
      setIsAddModalOpen(false);
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
    setEditGuildIsDisplay(guild.isDisplay !== false);
  };

  const saveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editGuildName.trim() || !editingGuildId) return;
    try {
      await updateGuild(editingGuildId, {
        name: editGuildName.trim(),
        tier: editGuildTier,
        orderNum: editGuildOrder,
        isDisplay: editGuildIsDisplay
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
        <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-200">{t('nav.guild_management')}</h2>
        <button onClick={handleOpenAddModal} className="px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 flex items-center gap-2">
          <Plus className="w-5 h-5" /> {t('guilds.add_guild')}
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
                  className={`p-4 border border-stone-200 dark:border-stone-700 rounded-xl bg-stone-50 dark:bg-stone-700 flex flex-col gap-3 transition-colors group ${!editingGuildId ? `cursor-pointer ${getTierBorderHoverClass(tier)}` : ''}`}
                >
                  {editingGuildId === id ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                        value={editGuildName}
                        onChange={e => setEditGuildName(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder={t('guilds.guild_name')}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <select
                          className="flex-1 p-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
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
                          className="w-20 p-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                          value={editGuildOrder}
                          onChange={e => setEditGuildOrder(Number(e.target.value))}
                          onClick={e => e.stopPropagation()}
                          placeholder={t('common.order')}
                          min={1}
                        />
                        <select
                          className="w-24 p-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                          value={editGuildIsDisplay ? 'true' : 'false'}
                          onChange={e => setEditGuildIsDisplay(e.target.value === 'true')}
                          onClick={e => e.stopPropagation()}
                        >
                          <option value="true">{t('common.show')}</option>
                          <option value="false">{t('common.hide')}</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="flex-1 p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1"><Save className="w-4 h-4" /> {t('common.save')}</button>
                        <button onClick={(e) => { e.stopPropagation(); setEditingGuildId(null); }} className="flex-1 p-2 bg-stone-200 dark:bg-stone-600 text-stone-600 dark:text-stone-200 rounded-lg hover:bg-stone-300 dark:hover:bg-stone-500 transition-colors flex items-center justify-center gap-1"><X className="w-4 h-4" /> {t('common.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-stone-200 dark:bg-stone-600 text-stone-600 dark:text-stone-300 text-xs font-bold rounded">{t('common.order')} {guild.orderNum || 1}</span>
                        </div>
                        <h3 className="font-bold text-lg text-stone-800 dark:text-stone-200 group-hover:text-amber-700 transition-colors">{guild.name}</h3>
                        <p className={`text-sm font-medium ${getMemberCount(id) > 30 ? 'text-red-500 bg-red-50 dark:bg-red-900/30 px-1 py-0.5 rounded inline-block' : 'text-stone-500 dark:text-stone-400'}`}>
                          {t('guilds.member_count')}: {getMemberCount(id)} / 30
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => startEdit(e, id, guild)} className="p-2 text-stone-500 dark:text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors" title={t('common.edit')}><Edit2 className="w-5 h-5" /></button>
                        <button onClick={(e) => handleDelete(e, id)} className="p-2 text-stone-500 dark:text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title={t('common.delete')}><Trash2 className="w-5 h-5" /></button>
                        <Users className="w-5 h-5 ml-1 text-stone-400 dark:text-stone-500 group-hover:text-amber-500 transition-colors" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Add Guild Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-stone-200 dark:border-stone-700">
              <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200">{t('guilds.add_guild')}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t('guilds.guild_name')}
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                  value={newGuildName}
                  onChange={e => setNewGuildName(e.target.value)}
                  placeholder={t('guilds.guild_name')}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                    {t('common.tier')}
                  </label>
                  <select
                    className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                    value={newGuildTier}
                    onChange={e => handleTierChange(Number(e.target.value))}
                  >
                    <option value={1}>{t('common.tier')} 1</option>
                    <option value={2}>{t('common.tier')} 2</option>
                    <option value={3}>{t('common.tier')} 3</option>
                    <option value={4}>{t('common.tier')} 4</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                    {t('common.order')}
                  </label>
                  <input
                    type="number"
                    className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                    value={newGuildOrder}
                    onChange={e => setNewGuildOrder(Number(e.target.value))}
                    min={1}
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-stone-200 dark:border-stone-700 flex justify-end gap-3 bg-stone-50 dark:bg-stone-800/50">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-lg font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleAddGuild}
                disabled={isSaving || !newGuildName.trim()}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

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
