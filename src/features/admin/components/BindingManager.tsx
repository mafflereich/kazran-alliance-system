import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '@/store';
import { supabase } from '@/shared/api/supabase';
import { Search, Link as LinkIcon, User as UserIcon, Loader2, CheckCircle2, AlertCircle, Copy, RefreshCw, Save, Undo, X, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Member } from '@/entities/member/types';
import ConfirmModal from '@/shared/ui/ConfirmModal';

interface Profile {
  id: string | null;
  discord_id: string;
  discord_username: string;
  display_name: string;
  avatar_url: string;
  user_role: string;
  user_guilds: string;
}

export default function BindingManager() {
  const { t } = useTranslation('admin');
  const { db, showToast } = useAppContext();
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isBinding, setIsBinding] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; member: Member | null }>({
    isOpen: false,
    member: null
  });

  // New states for Multi-Match
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [leftSearchQuery, setLeftSearchQuery] = useState('');
  const [stagedIds, setStagedIds] = useState<string[]>([]);

  useEffect(() => {
    fetchAllProfiles();
  }, []);

  const fetchAllProfiles = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*');

      if (error) throw error;
      setAllProfiles(data || []);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      showToast(t('binding.fetch_failed', '無法取得資料'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const unmatchedProfiles = useMemo(() => {
    return allProfiles.filter(p => !p.id || p.id.trim() === '');
  }, [allProfiles]);

  // Left search results for multi-match
  const leftSearchResults = useMemo(() => {
    if (!leftSearchQuery.trim()) return [];
    const query = leftSearchQuery.toLowerCase();

    const results: { member: Member; profile: Profile }[] = [];
    Object.values(db.members).forEach(member => {
      if (member.status === 'active' && member.name.toLowerCase().includes(query)) {
        // Find if this member is bound to any profile
        const boundProfile = allProfiles.find(p => p.id?.split(',').map(id => id.trim()).filter(Boolean).includes(member.id));
        if (boundProfile) {
          results.push({ member, profile: boundProfile });
        }
      }
    });
    return results;
  }, [leftSearchQuery, db.members, allProfiles]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const results = Object.values(db.members).filter(m => 
      m.status === 'active' && 
      m.name.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(results);
  };

  const handleBindClick = (member: Member) => {
    if (!selectedProfile || !member.id) return;

    if (mode === 'single') {
      setConfirmModal({ isOpen: true, member });
    } else {
      // Multi-match: stage the bind
      if (!stagedIds.includes(member.id)) {
        setStagedIds([...stagedIds, member.id]);
      }
    }
  };

  const handleUnbindStage = (memberId: string) => {
    if (stagedIds.length > 1) {
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
      // Check if member.id is already bound to another profile (comma-separated check)
      const isAlreadyBound = allProfiles.some(p => p.id?.split(',').map(id => id.trim()).filter(Boolean).includes(member.id));

      if (isAlreadyBound) {
        showToast(t('binding.already_bound', '此成員已綁定其他 Discord 帳號'), 'error');
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ id: member.id })
        .eq('discord_id', selectedProfile.discord_id);

      if (updateError) throw updateError;

      showToast(t('binding.bind_success', '身份綁定成功！'), 'success');
      setSelectedProfile(null);
      setSearchQuery('');
      setSearchResults([]);
      fetchAllProfiles();
    } catch (error: any) {
      console.error('Error binding profile:', error);
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
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ id: newIdString })
        .eq('discord_id', selectedProfile.discord_id);

      if (updateError) throw updateError;

      showToast(t('binding.bind_success', '身份綁定成功！'), 'success');
      await fetchAllProfiles();
      setSelectedProfile({ ...selectedProfile, id: newIdString });
    } catch (error: any) {
      console.error('Error saving multi-bind:', error);
      showToast(t('binding.bind_failed', { error: error.message }), 'error');
    } finally {
      setIsBinding(false);
    }
  };

  const originalIds = (selectedProfile?.id || '').split(',').map(id=>id.trim()).filter(Boolean);
  const hasUnsavedChanges = selectedProfile && mode === 'multi' &&
    originalIds.sort().join(',') !== [...stagedIds].sort().join(',');

  const renderRightSearchResult = (member: Member) => {
    const isStaged = mode === 'multi' && stagedIds.includes(member.id);
    const boundToOtherProfile = allProfiles.find(p =>
      p.id?.split(',').map(id => id.trim()).filter(Boolean).includes(member.id) &&
      p.discord_id !== selectedProfile?.discord_id
    );

    if (isStaged) {
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm font-bold">
          <CheckCircle2 className="w-4 h-4" />
          {t('binding.already_bound_to_this', '已綁定')}
        </div>
      );
    }

    if (boundToOtherProfile) {
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 rounded-lg text-sm font-bold" title={t('binding.already_bound_to_other', '已被其他帳號綁定')}>
          <AlertCircle className="w-4 h-4" />
          {t('binding.already_bound_to_other', '已被其他帳號綁定')}
        </div>
      );
    }

    return (
      <button
        onClick={() => handleBindClick(member)}
        disabled={isBinding}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-400 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
      >
        {isBinding ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <LinkIcon className="w-4 h-4" />
        )}
        {t('binding.bind')}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-stone-800 dark:text-stone-200">{t('binding.title')}</h2>
          <div className="flex bg-stone-100 dark:bg-stone-800 p-1 rounded-lg">
            <button
              onClick={() => {
                setMode('single');
                setSelectedProfile(null);
                setSearchQuery('');
                setSearchResults([]);
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                mode === 'single'
                  ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
              }`}
            >
              {t('binding.single_match', '單一匹配')}
            </button>
            <button
              onClick={() => {
                setMode('multi');
                setSelectedProfile(null);
                setSearchQuery('');
                setSearchResults([]);
                setLeftSearchQuery('');
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                mode === 'multi'
                  ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
              }`}
            >
              {t('binding.multi_match', '多重匹配')}
            </button>
          </div>
        </div>
        <button
          onClick={fetchAllProfiles}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50"
          title={t('common.refresh', '重新整理')}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh', '重新整理')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side */}
        {mode === 'single' ? (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
              {t('binding.unmatched_profiles')} ({unmatchedProfiles.length})
            </h3>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
              </div>
            ) : unmatchedProfiles.length === 0 ? (
              <div className="bg-stone-50 dark:bg-stone-900/50 rounded-xl p-8 text-center border border-dashed border-stone-200 dark:border-stone-800">
                <CheckCircle2 className="w-12 h-12 text-stone-300 dark:text-stone-700 mx-auto mb-3" />
                <p className="text-stone-500 dark:text-stone-400">{t('binding.no_unmatched')}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {unmatchedProfiles.map((profile) => (
                  <div
                    key={profile.discord_id}
                    onClick={() => setSelectedProfile(profile)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                      selectedProfile?.discord_id === profile.discord_id
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 ring-2 ring-indigo-500/20'
                        : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'
                    }`}
                  >
                    <img
                      src={profile.avatar_url || 'https://picsum.photos/seed/avatar/100/100'}
                      alt={profile.display_name}
                      className="w-12 h-12 rounded-full border-2 border-white dark:border-stone-700 shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                      <div className="text-left flex-1">
                        <p className="font-bold text-stone-800 dark:text-stone-100">{profile.display_name}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className="text-xs text-stone-500 dark:text-stone-400 font-mono">{profile.discord_id}</p>
                          {profile.discord_username && (
                            <div className="flex items-center gap-1">
                              <p className="text-xs text-indigo-500 dark:text-indigo-400 font-medium italic">@{profile.discord_username}</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(profile.discord_username);
                                  setCopiedId(profile.discord_id);
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                className="p-1 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-md transition-colors text-stone-400 hover:text-indigo-500"
                                title={t('common.copy', '複製')}
                              >
                                {copiedId === profile.discord_id ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
              {t('binding.select_bound_profile', '選擇已綁定帳號')}
            </h3>

            {!selectedProfile ? (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <input
                    type="text"
                    value={leftSearchQuery}
                    onChange={(e) => setLeftSearchQuery(e.target.value)}
                    placeholder={t('binding.search_bound_members', '搜尋已綁定的成員...')}
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {leftSearchResults.map(({ member, profile }) => (
                    <div
                      key={member.id}
                      onClick={() => {
                        setSelectedProfile(profile);
                        setStagedIds(profile.id ? profile.id.split(',').map(id => id.trim()).filter(Boolean) : []);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="w-full flex items-center justify-between p-4 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer group"
                    >
                      <div>
                        <p className="font-bold text-stone-800 dark:text-stone-100">{member.name}</p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {t('binding.guild')}: {db.guilds[member.guildId]?.name || 'Unknown'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-indigo-500 dark:text-indigo-400">
                        <span className="text-sm font-medium">@{profile.discord_username}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      setSelectedProfile(null);
                      setStagedIds([]);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="text-sm text-stone-500 hover:text-indigo-500 flex items-center gap-1"
                  >
                    <Undo className="w-4 h-4" /> {t('common.back', '返回')}
                  </button>
                  {hasUnsavedChanges && (
                    <span className="text-xs font-medium text-amber-500 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-md">
                      {t('binding.unsaved_changes', '有未儲存的變更')}
                    </span>
                  )}
                </div>

                {/* Profile Card */}
                <div className="w-full flex items-center gap-4 p-4 rounded-xl border bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 ring-2 ring-indigo-500/20">
                  <img
                    src={selectedProfile.avatar_url || 'https://picsum.photos/seed/avatar/100/100'}
                    alt={selectedProfile.display_name}
                    className="w-12 h-12 rounded-full border-2 border-white dark:border-stone-700 shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-left flex-1">
                    <p className="font-bold text-stone-800 dark:text-stone-100">{selectedProfile.display_name}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="text-xs text-stone-500 dark:text-stone-400 font-mono">{selectedProfile.discord_id}</p>
                      {selectedProfile.discord_username && (
                        <p className="text-xs text-indigo-500 dark:text-indigo-400 font-medium italic">@{selectedProfile.discord_username}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Staged Members List */}
                <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-4 space-y-3">
                  <h4 className="text-sm font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    {t('binding.bound_members', '已綁定成員')} ({stagedIds.length})
                  </h4>
                  <div className="space-y-2">
                    {stagedIds.map(id => {
                      const member = db.members[id];
                      if (!member) return null;
                      return (
                        <div key={id} className="flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-900/50 rounded-lg border border-stone-100 dark:border-stone-800">
                          <div>
                            <p className="font-medium text-stone-800 dark:text-stone-200">{member.name}</p>
                            <p className="text-xs text-stone-500">{db.guilds[member.guildId]?.name}</p>
                          </div>
                          <button
                            onClick={() => handleUnbindStage(id)}
                            className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title={t('binding.unbind', '解除')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStagedIds(selectedProfile.id ? selectedProfile.id.split(',').map(id => id.trim()).filter(Boolean) : [])}
                    disabled={!hasUnsavedChanges || isBinding}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50 rounded-xl font-medium transition-colors"
                  >
                    <Undo className="w-4 h-4" />
                    {t('binding.restore', '還原')}
                  </button>
                  <button
                    onClick={executeMultiSave}
                    disabled={!hasUnsavedChanges || isBinding}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 rounded-xl font-bold transition-colors shadow-lg shadow-indigo-600/20"
                  >
                    {isBinding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t('binding.save_changes', '儲存變更')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Right Side: Search and Bind */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
            {t('binding.search_members')}
          </h3>

          {!selectedProfile ? (
            <div className="bg-stone-50 dark:bg-stone-900/50 rounded-xl p-12 text-center border border-dashed border-stone-200 dark:border-stone-800">
              <UserIcon className="w-12 h-12 text-stone-300 dark:text-stone-700 mx-auto mb-3" />
              <p className="text-stone-500 dark:text-stone-400">{t('binding.select_profile_first')}</p>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder={t('binding.search_placeholder')}
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  autoFocus
                />
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {searchQuery.trim() === '' ? (
                  <div className="text-center py-12 text-stone-400">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">{t('binding.start_search_hint')}</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-12 text-stone-400">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">{t('binding.no_results')}</p>
                  </div>
                ) : (
                  searchResults.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
                    >
                      <div>
                        <p className="font-bold text-stone-800 dark:text-stone-100">{member.name}</p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {t('binding.guild')}: {db.guilds[member.guildId]?.name || 'Unknown'}
                        </p>
                      </div>
                      {renderRightSearchResult(member)}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={t('binding.bind')}
        message={t('binding.confirm_bind', { name: confirmModal.member?.name })}
        onConfirm={executeSingleBind}
        onCancel={() => setConfirmModal({ isOpen: false, member: null })}
      />
    </div>
  );
}

