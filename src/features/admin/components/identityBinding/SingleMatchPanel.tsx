import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, Copy, Trash2 } from 'lucide-react';
import { Profile } from './types';

interface Props {
  unmatchedProfiles: Profile[];
  isLoading: boolean;
  selectedProfile: Profile | null;
  onSelectProfile: (profile: Profile) => void;
  onDeleteProfile: (profile: Profile) => void;
}

export default function SingleMatchPanel({ unmatchedProfiles, isLoading, selectedProfile, onSelectProfile, onDeleteProfile }: Props) {
  const { t } = useTranslation('admin');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (discordId: string, username: string) => {
    navigator.clipboard.writeText(username);
    setCopiedId(discordId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
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
              onClick={() => onSelectProfile(profile)}
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
                      <p className="text-xs text-indigo-500 dark:text-indigo-400 font-medium italic">
                        @{profile.discord_username}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(profile.discord_id, profile.discord_username);
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteProfile(profile);
                }}
                className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                title={t('binding.delete_profile', '刪除 Profile')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
