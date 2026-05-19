import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Link as LinkIcon, User as UserIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Member, Guild } from '@/entities/member/types';
import { Profile } from './types';

interface Props {
  isSearchActive: boolean;
  selectedProfile: Profile | null;
  searchQuery: string;
  onSearch: (q: string) => void;
  searchResults: Member[];
  isBinding: boolean;
  mode: 'single' | 'multi';
  stagedIds: string[];
  allProfiles: Profile[];
  onBindClick: (member: Member) => void;
  guilds: Record<string, Guild>;
}

export default function MemberSearchPanel({
  isSearchActive, selectedProfile, searchQuery, onSearch, searchResults,
  isBinding, mode, stagedIds, allProfiles, onBindClick, guilds,
}: Props) {
  const { t } = useTranslation('admin');

  const renderBindAction = (member: Member) => {
    const isStaged = mode === 'multi' && stagedIds.includes(member.id!);
    const boundToOther = allProfiles.find(p =>
      p.id?.split(',').map(id => id.trim()).filter(Boolean).includes(member.id!) &&
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

    if (boundToOther) {
      return (
        <div
          className="flex items-center gap-2 px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 rounded-lg text-sm font-bold"
          title={t('binding.already_bound_to_other', '已被其他帳號綁定')}
        >
          <AlertCircle className="w-4 h-4" />
          {t('binding.already_bound_to_other', '已被其他帳號綁定')}
        </div>
      );
    }

    return (
      <button
        onClick={() => onBindClick(member)}
        disabled={isBinding}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-400 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
      >
        {isBinding ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
        {t('binding.bind')}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
        {t('binding.search_members')}
      </h3>

      {!isSearchActive ? (
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
              onChange={(e) => onSearch(e.target.value)}
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
                      {t('binding.guild')}: {guilds[member.guildId]?.name || 'Unknown'}
                    </p>
                  </div>
                  {renderBindAction(member)}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
