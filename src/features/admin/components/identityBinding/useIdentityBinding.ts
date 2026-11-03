import { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '@/store';
import { supabase, fetchAllPaginated } from '@/shared/api/supabase';
import { Logger } from '@/shared/utils/logger';
import { useTranslation } from 'react-i18next';
import { Member } from '@/entities/member/types';
import { Profile } from './types';

export function useIdentityBinding() {
  const { t } = useTranslation('admin');
  const { db, showToast } = useAppContext();

  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [newBindingMember, setNewBindingMember] = useState<Member | null>(null);
  const [isBinding, setIsBinding] = useState(false);
  /**
   * 綁定確認視窗。
   *   kind = 'bind'  → 單一匹配：確認後直接寫入 profiles.id
   *   kind = 'stage' → 多重匹配：確認後只加入暫存清單（按「儲存變更」才寫入）
   *   fromProfile    → 該成員目前綁定的舊帳號；有值代表這次是「轉綁」（換 DC 帳號）
   */
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    kind: 'bind' | 'stage';
    member: Member | null;
    fromProfile: Profile | null;
  }>({
    isOpen: false,
    kind: 'bind',
    member: null,
    fromProfile: null,
  });
  const [deleteProfileModal, setDeleteProfileModal] = useState<{ isOpen: boolean; profile: Profile | null }>({
    isOpen: false,
    profile: null,
  });

  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [leftSearchQuery, setLeftSearchQuery] = useState('');
  const [leftSearchType, setLeftSearchType] = useState<'name' | 'discordId'>('name');
  const [stagedIds, setStagedIds] = useState<string[]>([]);
  const [editingDiscordId, setEditingDiscordId] = useState('');
  const [editingDiscordUsername, setEditingDiscordUsername] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Member[]>([]);

  useEffect(() => {
    fetchAllProfiles();
  }, []);

  const fetchAllProfiles = async () => {
    setIsLoading(true);
    try {
      // keyset 分頁：profiles 超過 PostgREST 的 1000 列上限時不會被靜默截斷
      const data = await fetchAllPaginated<any>(
        'profiles',
        'id, discord_id, discord_username, display_name, avatar_url',
        undefined,
        { orderBy: 'discord_id', pageSize: 500 },
      );
      setAllProfiles((data || []) as Profile[]);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      showToast(t('binding.fetch_failed', '無法取得資料'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const unmatchedProfiles = useMemo(
    () => allProfiles.filter(p => !p.id || p.id.trim() === ''),
    [allProfiles]
  );

  /**
   * member_id → 綁定的 profile（O(1) 查找）。
   * 原本是「每個成員都 allProfiles.find(...split())」＝ O(成員數 × profile 數)，
   * 1,259 位成員 × 682 筆 profile ≈ 86 萬次字串切割，每打一個字都要重算。
   * 改成預先建 Map 後，查詢是 O(1)，整個過程只切 685 次。
   */
  const profileByMemberId = useMemo(() => {
    const map = new Map<string, Profile>();
    allProfiles.forEach(profile => {
      (profile.id || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
        .forEach(memberId => {
          if (!map.has(memberId)) map.set(memberId, profile);
        });
    });
    return map;
  }, [allProfiles]);

  const leftSearchResults = useMemo(() => {
    if (!leftSearchQuery.trim()) return [];
    const query = leftSearchQuery.toLowerCase();
    const results: { member: Member; profile: Profile | null }[] = [];

    if (leftSearchType === 'name') {
      Object.values(db.members).forEach(member => {
        if (member.status === 'active' && member.name.toLowerCase().includes(query)) {
          const boundProfile = member.id ? (profileByMemberId.get(member.id) ?? null) : null;
          results.push({ member, profile: boundProfile });
        }
      });
    } else {
      const matchedProfiles = allProfiles.filter(p =>
        p.discord_id.toLowerCase().includes(query)
      );
      matchedProfiles.forEach(profile => {
        const memberIds = (profile.id || '').split(',').map(id => id.trim()).filter(Boolean);
        memberIds.forEach(memberId => {
          const member = db.members[memberId];
          if (member && member.status === 'active') results.push({ member, profile });
        });
      });
    }

    return results;
  }, [leftSearchQuery, leftSearchType, db.members, allProfiles, profileByMemberId]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchResults(
      Object.values(db.members).filter(
        m => m.status === 'active' && m.name.toLowerCase().includes(query.toLowerCase())
      )
    );
  };

  const handleBindClick = (member: Member) => {
    if (!member.id) return;
    const isActive = selectedProfile !== null || newBindingMember !== null;
    if (!isActive) return;

    // 成員若已綁在其他 Discord 帳號，代表對方換了 DC 帳號（或轉讓），
    // 這裡不再擋下，而是標記 fromProfile 讓 UI 跳出「轉綁」確認。
    // DB trigger（sync_profile_members_from_profile）本來就會把成員從舊 profile 移轉過來。
    const boundProfile = profileByMemberId.get(member.id) ?? null;
    const targetDiscordId = selectedProfile?.discord_id ?? editingDiscordId.trim();
    const fromProfile =
      boundProfile && boundProfile.discord_id !== targetDiscordId ? boundProfile : null;

    if (mode === 'single') {
      if (!selectedProfile) return;
      if (boundProfile && boundProfile.discord_id === selectedProfile.discord_id) {
        showToast(t('binding.already_bound_to_this', '已綁定'), 'info');
        return;
      }
      setConfirmModal({ isOpen: true, kind: 'bind', member, fromProfile });
      return;
    }

    if (stagedIds.includes(member.id)) return;

    if (fromProfile) {
      setConfirmModal({ isOpen: true, kind: 'stage', member, fromProfile });
    } else {
      setStagedIds([...stagedIds, member.id]);
    }
  };

  /** 多重匹配：確認「轉綁」後只加入暫存清單，實際移轉在儲存時發生 */
  const confirmStageTransfer = () => {
    const member = confirmModal.member;
    setConfirmModal({ isOpen: false, kind: 'bind', member: null, fromProfile: null });
    if (!member?.id) return;
    setStagedIds(prev => (prev.includes(member.id!) ? prev : [...prev, member.id!]));
  };

  /**
   * 移除暫存成員。
   * 允許清空到 0 位：儲存後等於「解除此 Discord 帳號的所有綁定」，
   * 換 DC 帳號時必須先能完全解除，才有辦法再綁到新帳號。
   */
  const handleUnbindStage = (memberId: string) => {
    setStagedIds(prev => prev.filter(id => id !== memberId));
  };

  const executeSingleBind = async () => {
    const member = confirmModal.member;
    const fromProfile = confirmModal.fromProfile;
    if (!selectedProfile || !member || !member.id) return;

    setIsBinding(true);
    setConfirmModal({ isOpen: false, kind: 'bind', member: null, fromProfile: null });
    try {
      // 成員原本綁在別的帳號（換 DC 帳號 / 轉讓）時不再直接擋下：
      // 寫入新 profile 的 id 後，DB trigger（sync_profile_members_from_profile）
      // 會把成員從舊 profile 移轉過來，並自動重建舊 profile 的 id 快取。
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({ id: member.id })
        .eq('discord_id', selectedProfile.discord_id)
        .select('discord_id');
      if (updateError) throw updateError;
      // RLS 沒擋錯誤但實際 0 列更新時（沒有 admin 權限）會靜默失敗，必須自己檢查
      if (!data || data.length === 0) {
        throw new Error(t('binding.no_rows_updated', '沒有更新任何資料，請確認你的權限'));
      }

      const fromLabel = fromProfile
        ? (fromProfile.discord_username || fromProfile.display_name || fromProfile.discord_id)
        : null;

      Logger.info({
        source: 'admin_tools',
        action: 'bind_identity',
        message: fromProfile ? '轉移身分綁定' : '綁定單一身分',
        details: {
          discordId: selectedProfile.discord_id,
          memberId: member.id,
          fromDiscordId: fromProfile?.discord_id ?? null,
        },
      });
      showToast(
        fromLabel
          ? t('binding.transfer_success', { name: member.name, from: fromLabel })
          : t('binding.bind_success', '身份綁定成功！'),
        'success'
      );
      setSelectedProfile(null);
      setSearchQuery('');
      setSearchResults([]);
      fetchAllProfiles();
    } catch (error: any) {
      console.error('Error binding profile:', error);
      Logger.error({ source: 'admin_tools', action: 'bind_identity', message: '綁定單一身分失敗', details: { discordId: selectedProfile?.discord_id, memberId: member.id, error: error.message } });
      showToast(t('binding.bind_failed', { error: error.message }), 'error');
    } finally {
      setIsBinding(false);
    }
  };

  const executeMultiSave = async () => {
    if (!selectedProfile) return;
    setIsBinding(true);
    try {
      const newIdString = stagedIds.join(',');
      // 清單為空 = 解除此帳號的所有綁定（舊帳號換 DC 時的必要步驟）。
      // 寫 NULL 讓 DB trigger 清空 profile_members，成員才會變成「未綁定」。
      const updatePayload: Record<string, string | null> = { id: newIdString || null };
      if (editingDiscordUsername !== (selectedProfile.discord_username ?? '')) {
        updatePayload.discord_username = editingDiscordUsername;
      }

      // 這些成員原本綁在其他帳號 → 儲存後會被移轉過來
      const transferredIds = stagedIds.filter(id => {
        const boundProfile = profileByMemberId.get(id);
        return !!boundProfile && boundProfile.discord_id !== selectedProfile.discord_id;
      });

      const { data, error: updateError } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('discord_id', selectedProfile.discord_id)
        .select('discord_id');
      if (updateError) throw updateError;
      if (!data || data.length === 0) {
        throw new Error(t('binding.no_rows_updated', '沒有更新任何資料，請確認你的權限'));
      }

      Logger.info({
        source: 'admin_tools',
        action: 'bind_identity',
        message: stagedIds.length === 0 ? '解除身分綁定' : '綁定多成員身分',
        details: {
          discordId: selectedProfile.discord_id,
          memberIds: stagedIds,
          transferredIds,
        },
      });
      showToast(
        stagedIds.length === 0
          ? t('binding.unbind_all_success', '已解除所有成員綁定')
          : t('binding.bind_success', '身份綁定成功！'),
        'success'
      );
      await fetchAllProfiles();
      setSelectedProfile({ ...selectedProfile, id: newIdString || null, discord_username: editingDiscordUsername });
    } catch (error: any) {
      console.error('Error saving multi-bind:', error);
      Logger.error({ source: 'admin_tools', action: 'bind_identity', message: '綁定多成員身分失敗', details: { discordId: selectedProfile?.discord_id, memberIds: stagedIds, error: error.message } });
      showToast(t('binding.bind_failed', { error: error.message }), 'error');
    } finally {
      setIsBinding(false);
    }
  };

  const executeNewBinding = async () => {
    if (!editingDiscordId.trim() || stagedIds.length === 0) return;
    setIsBinding(true);
    try {
      const discordId = editingDiscordId.trim();
      const newIdString = stagedIds.join(',');
      const existingProfile = allProfiles.find(p => p.discord_id === discordId);
      const transferredIds = stagedIds.filter(id => {
        const boundProfile = profileByMemberId.get(id);
        return !!boundProfile && boundProfile.discord_id !== discordId;
      });

      if (existingProfile) {
        const updatePayload: Record<string, string> = { id: newIdString };
        if (editingDiscordUsername.trim()) updatePayload.discord_username = editingDiscordUsername.trim();
        const { data, error } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('discord_id', discordId)
          .select('discord_id');
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(t('binding.no_rows_updated', '沒有更新任何資料，請確認你的權限'));
        }
      } else {
        const insertPayload: Record<string, string> = { discord_id: discordId, id: newIdString };
        if (editingDiscordUsername.trim()) insertPayload.discord_username = editingDiscordUsername.trim();
        const { data, error } = await supabase
          .from('profiles')
          .insert(insertPayload)
          .select('discord_id');
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(t('binding.no_rows_updated', '沒有更新任何資料，請確認你的權限'));
        }
      }

      Logger.info({
        source: 'admin_tools',
        action: 'bind_identity',
        message: '建立新身分綁定',
        details: { discordId, memberIds: stagedIds, created: !existingProfile, transferredIds },
      });
      showToast(t('binding.bind_success', '身份綁定成功！'), 'success');
      await fetchAllProfiles();
      setNewBindingMember(null);
      setStagedIds([]);
      setEditingDiscordId('');
      setEditingDiscordUsername('');
    } catch (error: any) {
      console.error('Error creating new binding:', error);
      Logger.error({ source: 'admin_tools', action: 'bind_identity', message: '建立新身分綁定失敗', details: { discordId: editingDiscordId.trim(), memberIds: stagedIds, error: error.message } });
      showToast(t('binding.bind_failed', { error: error.message }), 'error');
    } finally {
      setIsBinding(false);
    }
  };

  const handleDeleteProfileClick = (profile: Profile) => {
    setDeleteProfileModal({ isOpen: true, profile });
  };

  const executeDeleteProfile = async () => {
    const profile = deleteProfileModal.profile;
    if (!profile) return;

    setIsBinding(true);
    setDeleteProfileModal({ isOpen: false, profile: null });
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('discord_id', profile.discord_id);
      if (error) throw error;

      Logger.warn({ source: 'admin_tools', action: 'delete_identity', message: '刪除身分綁定 Profile', details: { discordId: profile.discord_id, boundMemberIds: profile.id } });
      showToast(t('binding.delete_profile_success', '已刪除 Profile'), 'success');
      if (selectedProfile?.discord_id === profile.discord_id) setSelectedProfile(null);
      fetchAllProfiles();
    } catch (error: any) {
      console.error('Error deleting profile:', error);
      Logger.error({ source: 'admin_tools', action: 'delete_identity', message: '刪除身分綁定 Profile 失敗', details: { discordId: profile.discord_id, error: error.message } });
      showToast(t('binding.delete_profile_failed', { error: error.message }), 'error');
    } finally {
      setIsBinding(false);
    }
  };

  const switchToSingle = () => {
    setMode('single');
    setSelectedProfile(null);
    setNewBindingMember(null);
    setSearchQuery('');
    setSearchResults([]);
    setEditingDiscordUsername('');
  };

  const switchToMulti = () => {
    setMode('multi');
    setSelectedProfile(null);
    setNewBindingMember(null);
    setSearchQuery('');
    setSearchResults([]);
    setLeftSearchQuery('');
    setEditingDiscordId('');
    setEditingDiscordUsername('');
  };

  const handleMultiSelectProfile = (profile: Profile) => {
    setSelectedProfile(profile);
    setNewBindingMember(null);
    setStagedIds(profile.id ? profile.id.split(',').map(id => id.trim()).filter(Boolean) : []);
    setEditingDiscordUsername(profile.discord_username ?? '');
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleMultiSelectUnbound = (member: Member) => {
    setNewBindingMember(member);
    setSelectedProfile(null);
    setStagedIds(member.id ? [member.id] : []);
    setEditingDiscordId('');
    setEditingDiscordUsername('');
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleMultiBack = () => {
    setSelectedProfile(null);
    setNewBindingMember(null);
    setStagedIds([]);
    setEditingDiscordId('');
    setEditingDiscordUsername('');
    setSearchQuery('');
    setSearchResults([]);
  };

  const restoreMultiStage = () => {
    setStagedIds(
      selectedProfile
        ? (selectedProfile.id || '').split(',').map(id => id.trim()).filter(Boolean)
        : []
    );
    setEditingDiscordUsername(selectedProfile?.discord_username ?? '');
  };

  const originalIds = (selectedProfile?.id || '').split(',').map(id => id.trim()).filter(Boolean);
  const hasUnsavedChanges =
    !!selectedProfile &&
    mode === 'multi' &&
    (originalIds.sort().join(',') !== [...stagedIds].sort().join(',') ||
      editingDiscordUsername !== (selectedProfile.discord_username ?? ''));

  const canSaveNewBinding =
    newBindingMember !== null &&
    editingDiscordId.trim() !== '' &&
    stagedIds.length > 0;

  return {
    db,
    allProfiles,
    unmatchedProfiles,
    profileByMemberId,
    leftSearchResults,
    searchResults,
    isLoading,
    selectedProfile,
    newBindingMember,
    isBinding,
    confirmModal,
    setConfirmModal,
    deleteProfileModal,
    setDeleteProfileModal,
    handleDeleteProfileClick,
    executeDeleteProfile,
    mode,
    leftSearchQuery,
    setLeftSearchQuery,
    leftSearchType,
    setLeftSearchType,
    stagedIds,
    searchQuery,
    hasUnsavedChanges,
    canSaveNewBinding,
    fetchAllProfiles,
    handleSearch,
    handleBindClick,
    handleUnbindStage,
    confirmStageTransfer,
    executeSingleBind,
    executeMultiSave,
    executeNewBinding,
    switchToSingle,
    switchToMulti,
    handleMultiSelectProfile,
    handleMultiSelectUnbound,
    handleMultiBack,
    restoreMultiStage,
    setSelectedProfile,
    editingDiscordId,
    setEditingDiscordId,
    editingDiscordUsername,
    setEditingDiscordUsername,
  };
}
