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
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; member: Member | null }>({
    isOpen: false,
    member: null,
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

    if (mode === 'single') {
      if (!selectedProfile) return;
      setConfirmModal({ isOpen: true, member });
    } else if (!stagedIds.includes(member.id)) {
      setStagedIds([...stagedIds, member.id]);
    }
  };

  const handleUnbindStage = (memberId: string) => {
    if (newBindingMember !== null) {
      setStagedIds(stagedIds.filter(id => id !== memberId));
    } else if (stagedIds.length > 1) {
      setStagedIds(stagedIds.filter(id => id !== memberId));
    } else {
      showToast(t('binding.cannot_unbind_last', '必須至少保留一個綁定的成員'), 'warning');
    }
  };

  const executeSingleBind = async () => {
    const member = confirmModal.member;
    if (!selectedProfile || !member || !member.id) return;

    setIsBinding(true);
    setConfirmModal({ isOpen: false, member: null });
    try {
      const isAlreadyBound = member.id ? profileByMemberId.has(member.id) : false;
      if (isAlreadyBound) {
        showToast(t('binding.already_bound', '此成員已綁定其他 Discord 帳號'), 'error');
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ id: member.id })
        .eq('discord_id', selectedProfile.discord_id);
      if (updateError) throw updateError;

      Logger.info({ source: 'admin_tools', action: 'bind_identity', message: '綁定單一身分', details: { discordId: selectedProfile.discord_id, memberId: member.id } });
      showToast(t('binding.bind_success', '身份綁定成功！'), 'success');
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
      const updatePayload: Record<string, string> = { id: newIdString };
      if (editingDiscordUsername !== (selectedProfile.discord_username ?? '')) {
        updatePayload.discord_username = editingDiscordUsername;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('discord_id', selectedProfile.discord_id);
      if (updateError) throw updateError;

      Logger.info({ source: 'admin_tools', action: 'bind_identity', message: '綁定多成員身分', details: { discordId: selectedProfile.discord_id, memberIds: stagedIds } });
      showToast(t('binding.bind_success', '身份綁定成功！'), 'success');
      await fetchAllProfiles();
      setSelectedProfile({ ...selectedProfile, id: newIdString, discord_username: editingDiscordUsername });
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

      if (existingProfile) {
        const updatePayload: Record<string, string> = { id: newIdString };
        if (editingDiscordUsername.trim()) updatePayload.discord_username = editingDiscordUsername.trim();
        const { error } = await supabase.from('profiles').update(updatePayload).eq('discord_id', discordId);
        if (error) throw error;
      } else {
        const insertPayload: Record<string, string> = { discord_id: discordId, id: newIdString };
        if (editingDiscordUsername.trim()) insertPayload.discord_username = editingDiscordUsername.trim();
        const { error } = await supabase.from('profiles').insert(insertPayload);
        if (error) throw error;
      }

      Logger.info({ source: 'admin_tools', action: 'bind_identity', message: '建立新身分綁定', details: { discordId, memberIds: stagedIds, created: !existingProfile } });
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
