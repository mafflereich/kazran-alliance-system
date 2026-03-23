import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/store';
import { Plus, Edit2, Trash2, Save, X, RefreshCw } from 'lucide-react';
import ConfirmModal from '@shared/ui/ConfirmModal';
import { getTierColor, getTierBorderHoverClass } from '@/shared/lib/utils';
import { useTranslation } from 'react-i18next';
import GuildMembersManager from './GuildMembersManager';

export default function GuildsManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, addGuild, updateGuild, deleteGuild, fetchAllMembers, showToast } = useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [modalGuildId, setModalGuildId] = useState<string | null>(null);
  const [modalGuildName, setModalGuildName] = useState('');
  const [modalGuildTier, setModalGuildTier] = useState<number>(1);
  const [modalGuildOrder, setModalGuildOrder] = useState<number>(1);
  const [modalGuildIsDisplay, setModalGuildIsDisplay] = useState<boolean>(true);
  const [modalGuildSerial, setModalGuildSerial] = useState<number | string>('');

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
    setModalMode('add');
    setModalGuildId(null);
    setModalGuildName('');
    setModalGuildTier(1);
    setModalGuildIsDisplay(true);
    
    // Find the next order number for tier 1
    const tier1Guilds = sortedGuilds.filter(g => (g[1].tier || 1) === 1);
    const nextOrder = tier1Guilds.length > 0 
      ? Math.max(...tier1Guilds.map(g => g[1].orderNum || 1)) + 1 
      : 1;
    
    // Find the next serial number
    const maxSerial = Math.max(0, ...Object.values(db.guilds).map(g => Number(g.serial) || 0));
    setModalGuildSerial(maxSerial + 1);
    
    setModalGuildOrder(nextOrder);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (e: React.MouseEvent, id: string, guild: any) => {
    e.stopPropagation();
    setModalMode('edit');
    setModalGuildId(id);
    setModalGuildName(guild.name);
    setModalGuildTier(guild.tier || 1);
    setModalGuildOrder(guild.orderNum || 1);
    setModalGuildIsDisplay(guild.isDisplay !== false);
    setModalGuildSerial(guild.serial || '');
    setIsModalOpen(true);
  };

  const handleTierChange = (tier: number) => {
    setModalGuildTier(tier);
    // Find the next order number for the selected tier
    const tierGuilds = sortedGuilds.filter(g => (g[1].tier || 1) === tier);
    const nextOrder = tierGuilds.length > 0 
      ? Math.max(...tierGuilds.map(g => g[1].orderNum || 1)) + 1 
      : 1;
    setModalGuildOrder(nextOrder);
  };

  const handleSaveGuild = async () => {
    if (!modalGuildName.trim()) return;
    setIsSaving(true);
    try {
      if (modalMode === 'add') {
        const newGuildId = await addGuild(modalGuildName.trim());
        if (newGuildId) {
          await updateGuild(newGuildId, {
            name: modalGuildName.trim(),
            tier: modalGuildTier,
            orderNum: modalGuildOrder,
            isDisplay: modalGuildIsDisplay,
            serial: modalGuildSerial
          });
        }
        showToast(t('guilds.add_success'), 'success');
      } else if (modalGuildId) {
        await updateGuild(modalGuildId, {
          name: modalGuildName.trim(),
          tier: modalGuildTier,
          orderNum: modalGuildOrder,
          isDisplay: modalGuildIsDisplay,
          serial: modalGuildSerial
        });
        showToast(t('guilds.update_success'), 'success');
      }
      setIsModalOpen(false);
    } catch (error: any) {
      console.error("Error saving guild:", error);
      showToast(`${t('guilds.save_failed')}: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const getMemberCount = (guildId: string) => {
    return Object.values(db.members).filter((m: any) => m.guildId === guildId).length;
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
                  onClick={() => { setSelectedGuildId(id); }}
                  className={`p-4 border border-stone-200 dark:border-stone-700 rounded-xl bg-stone-50 dark:bg-stone-700 flex flex-col gap-3 transition-colors group cursor-pointer ${getTierBorderHoverClass(tier)}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {guild.serial && (
                          <span className={`px-2 py-0.5 text-xs font-bold rounded border ${getTierColor(tier)}`}>#{guild.serial}</span>
                        )}
                        <span className="px-2 py-0.5 bg-stone-200 dark:bg-stone-600 text-stone-600 dark:text-stone-300 text-xs font-bold rounded">{t('common.order')} {guild.orderNum || 1}</span>
                      </div>
                      <h3 className="font-bold text-lg text-stone-800 dark:text-stone-200 group-hover:text-amber-700 transition-colors">{guild.name}</h3>
                      <p className={`text-sm font-medium ${getMemberCount(id) > 30 ? 'text-red-500 bg-red-50 dark:bg-red-900/30 px-1 py-0.5 rounded inline-block' : 'text-stone-500 dark:text-stone-400'}`}>
                        {t('guilds.member_count')}: {getMemberCount(id)} / 30
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => handleOpenEditModal(e, id, guild)} className="p-2 text-stone-500 dark:text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors" title={t('common.edit')}><Edit2 className="w-5 h-5" /></button>
                      <button onClick={(e) => handleDelete(e, id)} className="p-2 text-stone-500 dark:text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title={t('common.delete')}><Trash2 className="w-5 h-5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Add/Edit Guild Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-stone-200 dark:border-stone-700">
              <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200">
                {modalMode === 'add' ? t('guilds.add_guild') : t('guilds.edit_guild')}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t('guilds.serial')}
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                  value={modalGuildSerial}
                  onChange={e => setModalGuildSerial(e.target.value)}
                  placeholder={t('guilds.serial')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t('guilds.guild_name')}
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                  value={modalGuildName}
                  onChange={e => setModalGuildName(e.target.value)}
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
                    value={modalGuildTier}
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
                    value={modalGuildOrder}
                    onChange={e => setModalGuildOrder(Number(e.target.value))}
                    min={1}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t('common.status')}
                </label>
                <select
                  className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                  value={modalGuildIsDisplay ? 'true' : 'false'}
                  onChange={e => setModalGuildIsDisplay(e.target.value === 'true')}
                >
                  <option value="true">{t('common.show')}</option>
                  <option value="false">{t('common.hide')}</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-stone-200 dark:border-stone-700 flex justify-end gap-3 bg-stone-50 dark:bg-stone-800/50">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveGuild}
                disabled={isSaving || !modalGuildName.trim()}
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
