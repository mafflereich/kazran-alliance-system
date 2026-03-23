import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/store';
import { ChevronLeft, Plus, Save, X, Edit2, Archive, Trash2, AlertCircle } from 'lucide-react';
import ConfirmModal from '@shared/ui/ConfirmModal';
import { Role } from '@/entities/member/types';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/shared/api/supabase';

export default function GuildMembersManager({ guildId, onBack }: { guildId: string, onBack: () => void }) {
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
  const [archiveRemarks, setArchiveRemarks] = useState<Record<string, string>>({});

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));
  const closeArchiveModal = () => setArchiveModal(prev => ({ ...prev, isOpen: false }));
  
  const appendArchiveReason = (text: string) => {
    setArchiveModal(prev => ({
      ...prev,
      reason: prev.reason ? `${prev.reason}, ${text}` : text
    }));
  };

  useEffect(() => {
    fetchMembers(guildId);
  }, [guildId]);

  useEffect(() => {
    const fetchArchiveRemarks = async () => {
      const memberIds = Object.values(db.members)
        .filter((m: any) => m.guildId === guildId)
        .map((m: any) => m.id);

      if (memberIds.length === 0) return;

      const { data, error } = await supabase
        .from('member_notes')
        .select('member_id, archive_remark')
        .in('member_id', memberIds)
        .not('archive_remark', 'is', null);

      if (!error && data) {
        const remarksMap = data.reduce((acc, note) => {
          if (note.archive_remark) {
            acc[note.member_id] = note.archive_remark;
          }
          return acc;
        }, {} as Record<string, string>);
        setArchiveRemarks(remarksMap);
      }
    };

    fetchArchiveRemarks();
  }, [guildId, db.members]);

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
        <button onClick={onBack} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors">
          <ChevronLeft className="w-6 h-6 text-stone-600 dark:text-stone-400" />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-200">{guild.name} - {t('nav.guild_management')}</h2>
          <p className={`text-sm font-medium ${members.length > 30 ? 'text-red-500 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded inline-block' : 'text-stone-500 dark:text-stone-400'}`}>
            {t('guilds.member_count')}: {members.length} / 30
          </p>
        </div>
        {!isAdding && !editingId && !isBatchAdding && (
          <div className="flex gap-2">
            <button onClick={() => setIsAdding(true)} className="px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 flex items-center gap-2">
              <Plus className="w-5 h-5" /> {t('members.add_member')}
            </button>
            <button onClick={() => setIsBatchAdding(true)} className="px-4 py-2 bg-stone-200 dark:bg-stone-600 text-stone-800 dark:text-stone-200 rounded-lg hover:bg-stone-300 dark:hover:bg-stone-500 flex items-center gap-2">
              {t('members.batch_add')}
            </button>
          </div>
        )}
      </div>

      {isBatchAdding && (
        <div className="bg-stone-50 dark:bg-stone-700 p-4 rounded-xl border border-stone-200 dark:border-stone-600 mb-6 flex flex-col gap-4">
          <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 whitespace-pre-line">{t('members.batch_add_placeholder')}</label>
          <textarea
            className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none min-h-[100px] bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
            placeholder="Player1, Master, Note1&#10;Player2, Member&#10;Player3"
            value={batchInput}
            onChange={e => setBatchInput(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={handleBatchAdd} disabled={isSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {isSaving ? t('common.loading') : t('common.confirm')}
            </button>
            <button onClick={() => { setIsBatchAdding(false); setBatchInput(''); }} className="px-4 py-2 bg-stone-300 dark:bg-stone-600 text-stone-800 dark:text-stone-200 rounded-lg hover:bg-stone-400 dark:hover:bg-stone-500">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {isAdding && (
        <div className="bg-stone-50 dark:bg-stone-700 p-4 rounded-xl border border-stone-200 dark:border-stone-600 mb-6 flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('common.name')}</label>
            <input
              type="text"
              className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('common.role')}</label>
            <select
              className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value as Role })}
            >
              <option value="member">{t('roles.member')}</option>
              <option value="coleader">{t('roles.coleader')}</option>
              <option value="leader">{t('roles.leader')}</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('members.target_guild')}</label>
            <div className="w-full p-2 border border-stone-200 dark:border-stone-600 rounded-lg bg-stone-100 dark:bg-stone-600 text-stone-500 dark:text-stone-400">
              {db.guilds[guildId]?.name || t('common.unknown')}
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">{t('common.member_note', '成員備註')}</label>
            <input
              type="text"
              className="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
              value={formData.note}
              onChange={e => setFormData({ ...formData, note: e.target.value })}
              placeholder={t('common.member_note', '成員備註')}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {isSaving ? t('common.loading') : t('common.save')}
            </button>
            <button onClick={cancelEdit} className="px-4 py-2 bg-stone-300 dark:bg-stone-600 text-stone-800 dark:text-stone-200 rounded-lg hover:bg-stone-400 dark:hover:bg-stone-500">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400">
              <th className="p-3 font-semibold">{t('common.name')}</th>
              <th className="p-3 font-semibold">{t('common.role')}</th>
              <th className="p-3 font-semibold">{t('common.member_note', '成員備註')}</th>
              <th className="p-3 font-semibold">{t('common.history')}</th>
              <th className="p-3 font-semibold text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {members.map(([id, member]: [string, any]) => {
              const isEditing = editingId === id;
              if (isEditing) {
                return (
                  <tr key={id} className="bg-amber-50/50 dark:bg-amber-900/20 border-b border-stone-100 dark:border-stone-700">
                    <td className="p-2">
                      <input
                        type="text"
                        className="w-full p-1.5 border border-stone-300 dark:border-stone-600 rounded bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100 text-sm"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        autoFocus
                      />
                    </td>
                    <td className="p-2">
                      <select
                        className="w-full p-1.5 border border-stone-300 dark:border-stone-600 rounded bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100 text-sm"
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
                          className="w-full p-1.5 border border-stone-300 dark:border-stone-600 rounded bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100 text-xs mb-1"
                          value={formData.targetGuildId}
                          onChange={(e) => setFormData({ ...formData, targetGuildId: e.target.value })}
                        >
                          {(sortedGuilds as [string, any][]).map(([gId, g]) => (
                            <option key={gId} value={gId}>{g.name}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          className="w-full p-1.5 border border-stone-300 dark:border-stone-600 rounded bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100 text-sm"
                          value={formData.note}
                          onChange={e => setFormData({ ...formData, note: e.target.value })}
                          placeholder={t('common.member_note', '成員備註')}
                        />
                      </div>
                    </td>
                    <td className="p-2 text-stone-400 dark:text-stone-500 text-xs">
                      {archiveRemarks[id]}
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
                          className="p-2 text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
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
                <tr key={id} className="border-b border-stone-100 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700">
                  <td className="p-3 font-medium text-stone-800 dark:text-stone-200">{member.name}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${member.role === 'leader' ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300' :
                      member.role === 'coleader' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300' :
                        'bg-stone-200 dark:bg-stone-600 text-stone-700 dark:text-stone-300'
                      }`}>
                      {member.role === 'leader' ? t('roles.leader') : member.role === 'coleader' ? t('roles.coleader') : t('roles.member')}
                    </span>
                  </td>
                  <td className="p-3 text-stone-500 dark:text-stone-400 text-sm">{member.note}</td>
                  <td className="p-3 text-stone-400 dark:text-stone-500 text-xs">{archiveRemarks[id]}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => startEdit(id)}
                        className="p-2 text-stone-500 dark:text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                        title={t('common.edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleArchiveClick(id, member.name)}
                        className="p-2 text-stone-500 dark:text-stone-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-600 rounded-lg transition-colors"
                        title={t('members.archive_member')}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteMember(id)}
                        className="p-2 text-stone-500 dark:text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
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
                <td colSpan={5} className="p-8 text-center text-stone-500 dark:text-stone-400">
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
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-stone-50 dark:bg-stone-700 px-6 py-4 border-b border-stone-200 dark:border-stone-600 flex justify-between items-center">
              <h3 className="text-lg font-bold text-stone-800 dark:text-stone-200 flex items-center gap-2">
                <Archive className="w-5 h-5 text-amber-600" />
                {t('members.archive_member')}
              </h3>
              <button onClick={closeArchiveModal} className="p-2 hover:bg-stone-200 dark:hover:bg-stone-600 rounded-full transition-colors">
                <X className="w-5 h-5 text-stone-500 dark:text-stone-400" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-400 dark:border-amber-600 p-4 rounded-r-lg flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-bold mb-1">{t('members.confirm_archive')}</p>
                  <p><strong>{archiveModal.memberName}</strong> - <strong>{archiveModal.guildName}</strong></p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">
                  {t('members.archive_reason')} <span className="text-stone-400 dark:text-stone-500 font-normal">({t('common.optional')})</span>
                </label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-stone-300 dark:border-stone-600 rounded-lg bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100 focus:ring-2 focus:ring-amber-500 outline-none"
                  placeholder={t('common.note')}
                  value={archiveModal.reason}
                  onChange={(e) => setArchiveModal(prev => ({ ...prev, reason: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    onClick={() => appendArchiveReason('退坑')}
                    className="px-2 py-1 text-xs bg-stone-100 dark:bg-stone-600 text-stone-600 dark:text-stone-300 rounded hover:bg-stone-200 dark:hover:bg-stone-500 transition-colors"
                  >
                    退坑
                  </button>
                  <button
                    onClick={() => appendArchiveReason('退DC')}
                    className="px-2 py-1 text-xs bg-stone-100 dark:bg-stone-600 text-stone-600 dark:text-stone-300 rounded hover:bg-stone-200 dark:hover:bg-stone-500 transition-colors"
                  >
                    退DC
                  </button>
                  <button
                    onClick={() => appendArchiveReason('公會轉移')}
                    className="px-2 py-1 text-xs bg-stone-100 dark:bg-stone-600 text-stone-600 dark:text-stone-300 rounded hover:bg-stone-200 dark:hover:bg-stone-500 transition-colors"
                  >
                    公會轉移
                  </button>
                  <button
                    onClick={() => appendArchiveReason('失聯')}
                    className="px-2 py-1 text-xs bg-stone-100 dark:bg-stone-600 text-stone-600 dark:text-stone-300 rounded hover:bg-stone-200 dark:hover:bg-stone-500 transition-colors"
                  >
                    失聯
                  </button>
                </div>
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
                  className="flex-1 py-2.5 bg-stone-200 dark:bg-stone-600 text-stone-700 dark:text-stone-200 rounded-xl font-bold hover:bg-stone-300 dark:hover:bg-stone-500 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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
