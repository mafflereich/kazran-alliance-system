import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '@/store';
import { supabase } from '@/shared/api/supabase';
import { Search, User as UserIcon, Loader2, Save, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Member } from '@/entities/member/types';

interface Profile {
  id: string | null;
  discord_id: string;
  discord_username: string;
  display_name: string;
  avatar_url: string;
  user_role: string;
  user_guilds: string;
}

export default function RoleSetting() {
  const { t } = useTranslation('admin');
  const { db, showToast } = useAppContext();
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [leftSearchQuery, setLeftSearchQuery] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [selectedRole, setSelectedRole] = useState<'manager' | 'member'>('member');
  const [isSaving, setIsSaving] = useState(false);

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
      
      // Update selected profile if it exists
      if (selectedProfile) {
        const updatedProfile = data?.find(p => p.discord_id === selectedProfile.discord_id);
        if (updatedProfile) {
          setSelectedProfile(updatedProfile);
          setSelectedRole((updatedProfile.user_role as 'manager' | 'member') || 'member');
        }
      }
    } catch (error) {
      console.error('Error fetching profiles:', error);
      showToast(t('binding.fetch_failed', '無法取得資料'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Left search results for bound members
  const leftSearchResults = useMemo(() => {
    const query = leftSearchQuery.toLowerCase();
    const results: { member: Member; profile: Profile }[] = [];
    
    // Only look at profiles that have an ID (are bound)
    const boundProfiles = allProfiles.filter(p => p.id && p.id.trim() !== '');

    Object.values(db.members).forEach(member => {
      if (member.status === 'active' && (!query || member.name.toLowerCase().includes(query))) {
        // Find if this member is bound to any profile
        const boundProfile = boundProfiles.find(p => p.id?.split(',').map(id => id.trim()).filter(Boolean).includes(member.id));
        if (boundProfile) {
          results.push({ member, profile: boundProfile });
        }
      }
    });
    return results;
  }, [leftSearchQuery, db.members, allProfiles]);

  const handleProfileSelect = (profile: Profile) => {
    setSelectedProfile(profile);
    setSelectedRole((profile.user_role as 'manager' | 'member') || 'member');
  };

  const handleSaveRole = async () => {
    if (!selectedProfile) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ user_role: selectedRole })
        .eq('discord_id', selectedProfile.discord_id);

      if (error) throw error;

      showToast(t('role_setting.save_success', '權限更新成功'), 'success');
      await fetchAllProfiles();
    } catch (error: any) {
      console.error('Error updating role:', error);
      showToast(t('role_setting.save_failed', '權限更新失敗'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const hasUnsavedChanges = selectedProfile && selectedProfile.user_role !== selectedRole;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
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
        {/* Left Side: Search Bound Members */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
            {t('role_setting.search_members', '搜尋已綁定的成員')}
          </h3>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              value={leftSearchQuery}
              onChange={(e) => setLeftSearchQuery(e.target.value)}
              placeholder={t('role_setting.search_bound_members', '搜尋已綁定的成員...')}
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {leftSearchResults.length === 0 ? (
                <div className="text-center py-12 text-stone-400">
                  <p className="text-sm">{t('role_setting.no_results', '找不到符合的成員')}</p>
                </div>
              ) : (
                leftSearchResults.map(({ member, profile }) => (
                  <div
                    key={member.id}
                    onClick={() => handleProfileSelect(profile)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer group ${
                      selectedProfile?.discord_id === profile.discord_id
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 ring-2 ring-indigo-500/20'
                        : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-stone-800 dark:text-stone-100">{member.name}</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {t('binding.guild')}: {db.guilds[member.guildId]?.name || 'Unknown'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-medium text-indigo-500 dark:text-indigo-400">@{profile.discord_username}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        profile.user_role === 'manager' 
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
                          : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                      }`}>
                        {profile.user_role === 'manager' ? t('role_setting.role_manager', '管理員') : t('role_setting.role_member', '一般成員')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right Side: Role Setting */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
            {t('role_setting.title', '權限更改')}
          </h3>

          {!selectedProfile ? (
            <div className="bg-stone-50 dark:bg-stone-900/50 rounded-xl p-12 text-center border border-dashed border-stone-200 dark:border-stone-800">
              <UserIcon className="w-12 h-12 text-stone-300 dark:text-stone-700 mx-auto mb-3" />
              <p className="text-stone-500 dark:text-stone-400">{t('role_setting.select_member_first', '請先從左側選擇一個使用者')}</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Profile Card */}
              <div className="w-full flex items-center gap-4 p-4 rounded-xl border bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700">
                <img
                  src={selectedProfile.avatar_url || 'https://picsum.photos/seed/avatar/100/100'}
                  alt={selectedProfile.display_name}
                  className="w-16 h-16 rounded-full border-2 border-stone-100 dark:border-stone-700 shadow-sm"
                  referrerPolicy="no-referrer"
                />
                <div className="text-left flex-1">
                  <p className="font-bold text-lg text-stone-800 dark:text-stone-100">{selectedProfile.display_name}</p>
                  <div className="flex flex-col gap-1 mt-1">
                    <p className="text-sm text-stone-500 dark:text-stone-400 font-mono">{selectedProfile.discord_id}</p>
                    {selectedProfile.discord_username && (
                      <p className="text-sm text-indigo-500 dark:text-indigo-400 font-medium italic">@{selectedProfile.discord_username}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Role Selection */}
              <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-6 space-y-4">
                <h4 className="font-bold text-stone-800 dark:text-stone-200">{t('role_setting.new_role', '新權限')}</h4>
                
                <div className="space-y-3">
                  <label className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedRole === 'member' 
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500' 
                      : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700/50'
                  }`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="member" 
                      checked={selectedRole === 'member'} 
                      onChange={() => setSelectedRole('member')}
                      className="w-4 h-4 text-indigo-600 border-stone-300 focus:ring-indigo-500"
                    />
                    <div className="ml-3">
                      <span className="block text-sm font-medium text-stone-900 dark:text-stone-100">
                        {t('role_setting.role_member', '一般成員 (member)')}
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedRole === 'manager' 
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500' 
                      : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700/50'
                  }`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="manager" 
                      checked={selectedRole === 'manager'} 
                      onChange={() => setSelectedRole('manager')}
                      className="w-4 h-4 text-indigo-600 border-stone-300 focus:ring-indigo-500"
                    />
                    <div className="ml-3">
                      <span className="block text-sm font-medium text-stone-900 dark:text-stone-100">
                        {t('role_setting.role_manager', '管理員 (manager)')}
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end pt-4">
                <button
                  onClick={handleSaveRole}
                  disabled={!hasUnsavedChanges || isSaving}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 rounded-xl font-bold transition-colors shadow-lg shadow-indigo-600/20"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('role_setting.save_changes', '儲存變更')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
