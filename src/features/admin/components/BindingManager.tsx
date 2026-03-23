import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/store';
import { supabase } from '@/shared/api/supabase';
import { Search, Link as LinkIcon, User as UserIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
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
  const [unmatchedProfiles, setUnmatchedProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isBinding, setIsBinding] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; member: Member | null }>({
    isOpen: false,
    member: null
  });

  useEffect(() => {
    fetchUnmatchedProfiles();
  }, []);

  const fetchUnmatchedProfiles = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or('id.is.null,id.eq.""');

      if (error) throw error;
      setUnmatchedProfiles(data || []);
    } catch (error) {
      console.error('Error fetching unmatched profiles:', error);
      showToast(t('binding.fetch_failed', '無法取得未匹配資料'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleBind = (member: Member) => {
    if (!selectedProfile || !member.id) return;
    setConfirmModal({ isOpen: true, member });
  };

  const executeBind = async () => {
    const member = confirmModal.member;
    if (!selectedProfile || !member || !member.id) return;

    setIsBinding(true);
    setConfirmModal({ isOpen: false, member: null });
    try {
      // 1. Check if member.id is already bound to another profile
      const { data: existing, error: checkError } = await supabase
        .from('profiles')
        .select('discord_id')
        .eq('id', member.id)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existing) {
        showToast(t('binding.already_bound'), 'error');
        return;
      }

      // 2. Update profile with member.id
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ id: member.id })
        .eq('discord_id', selectedProfile.discord_id);

      if (updateError) throw updateError;

      showToast(t('binding.bind_success'), 'success');
      setSelectedProfile(null);
      setSearchQuery('');
      setSearchResults([]);
      fetchUnmatchedProfiles();
    } catch (error: any) {
      console.error('Error binding profile:', error);
      showToast(t('binding.bind_failed', { error: error.message }), 'error');
    } finally {
      setIsBinding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-stone-800 dark:text-stone-200">{t('binding.title')}</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side: Unmatched Profiles */}
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
                <button
                  key={profile.discord_id}
                  onClick={() => setSelectedProfile(profile)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
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
                  <div className="text-left">
                    <p className="font-bold text-stone-800 dark:text-stone-100">{profile.display_name}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="text-xs text-stone-500 dark:text-stone-400 font-mono">{profile.discord_id}</p>
                      {profile.discord_username && (
                        <p className="text-xs text-indigo-500 dark:text-indigo-400 font-medium italic">@{profile.discord_username}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

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
                      <button
                        onClick={() => handleBind(member)}
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
        onConfirm={executeBind}
        onCancel={() => setConfirmModal({ isOpen: false, member: null })}
      />
    </div>
  );
}
