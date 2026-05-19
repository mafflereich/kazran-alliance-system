import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Users, Save, Undo, X, Loader2 } from 'lucide-react';
import { Member, Guild } from '@/entities/member/types';
import { Profile } from './types';

interface Props {
  selectedProfile: Profile | null;
  newBindingMember: Member | null;
  onSelectProfile: (profile: Profile) => void;
  onSelectUnbound: (member: Member) => void;
  onBack: () => void;
  leftSearchQuery: string;
  onLeftSearchQueryChange: (q: string) => void;
  leftSearchType: 'name' | 'discordId';
  onLeftSearchTypeChange: (type: 'name' | 'discordId') => void;
  leftSearchResults: { member: Member; profile: Profile | null }[];
  stagedIds: string[];
  onUnbindStage: (id: string) => void;
  hasUnsavedChanges: boolean;
  canSaveNewBinding: boolean;
  isBinding: boolean;
  onSave: () => void;
  onRestore: () => void;
  onSaveNewBinding: () => void;
  editingDiscordId: string;
  onEditingDiscordIdChange: (v: string) => void;
  editingDiscordUsername: string;
  onEditingDiscordUsernameChange: (v: string) => void;
  guilds: Record<string, Guild>;
  members: Record<string, Member>;
}

function StagedMembersList({
  stagedIds, members, guilds, onUnbindStage, t,
}: {
  stagedIds: string[];
  members: Record<string, Member>;
  guilds: Record<string, Guild>;
  onUnbindStage: (id: string) => void;
  t: (key: string, fallback?: string) => string;
}) {
  return (
    <div className="space-y-2">
      {stagedIds.map(id => {
        const member = members[id];
        if (!member) return null;
        return (
          <div key={id} className="flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-900/50 rounded-lg border border-stone-100 dark:border-stone-800">
            <div>
              <p className="font-medium text-stone-800 dark:text-stone-200">{member.name}</p>
              <p className="text-xs text-stone-500">{guilds[member.guildId]?.name}</p>
            </div>
            <button
              onClick={() => onUnbindStage(id)}
              className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title={t('binding.unbind', '解除')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function MultiMatchPanel({
  selectedProfile, newBindingMember, onSelectProfile, onSelectUnbound, onBack,
  leftSearchQuery, onLeftSearchQueryChange,
  leftSearchType, onLeftSearchTypeChange,
  leftSearchResults, stagedIds, onUnbindStage,
  hasUnsavedChanges, canSaveNewBinding, isBinding, onSave, onRestore, onSaveNewBinding,
  editingDiscordId, onEditingDiscordIdChange,
  editingDiscordUsername, onEditingDiscordUsernameChange,
  guilds, members,
}: Props) {
  const { t } = useTranslation('admin');

  const isEditingExisting = selectedProfile !== null;
  const isCreatingNew = newBindingMember !== null;

  if (!isEditingExisting && !isCreatingNew) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
          {t('binding.select_bound_profile', '選擇成員')}
        </h3>

        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => { onLeftSearchTypeChange('name'); onLeftSearchQueryChange(''); }}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                leftSearchType === 'name'
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
              }`}
            >
              {t('binding.search_by_name', '成員名稱')}
            </button>
            <button
              onClick={() => { onLeftSearchTypeChange('discordId'); onLeftSearchQueryChange(''); }}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                leftSearchType === 'discordId'
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
              }`}
            >
              Discord ID
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              value={leftSearchQuery}
              onChange={(e) => onLeftSearchQueryChange(e.target.value)}
              placeholder={
                leftSearchType === 'name'
                  ? t('binding.search_by_name_placeholder', '搜尋成員名稱...')
                  : t('binding.search_by_discord_id', '搜尋 Discord ID...')
              }
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
          {leftSearchResults.map(({ member, profile }) => {
            const isBound = profile !== null;
            return (
              <div
                key={member.id}
                onClick={() => isBound ? onSelectProfile(profile!) : onSelectUnbound(member)}
                className="w-full flex items-center justify-between p-4 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer"
              >
                <div>
                  <p className="font-bold text-stone-800 dark:text-stone-100">{member.name}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {t('binding.guild')}: {guilds[member.guildId]?.name || 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isBound ? (
                    <span className="text-sm font-medium text-indigo-500 dark:text-indigo-400">
                      @{profile!.discord_username}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-stone-400 bg-stone-100 dark:bg-stone-700 px-2 py-1 rounded-md">
                      {t('binding.unbound', '未綁定')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (isCreatingNew) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
        <button onClick={onBack} className="text-sm text-stone-500 hover:text-indigo-500 flex items-center gap-1">
          <Undo className="w-4 h-4" /> {t('common.back', '返回')}
        </button>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1">
            Discord ID
            <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={editingDiscordId}
            onChange={(e) => onEditingDiscordIdChange(e.target.value)}
            placeholder={t('binding.enter_discord_id', '輸入 Discord ID...')}
            autoFocus
            className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Discord {t('binding.username', '用戶名')}
          </label>
          <input
            type="text"
            value={editingDiscordUsername}
            onChange={(e) => onEditingDiscordUsernameChange(e.target.value)}
            placeholder={t('binding.enter_discord_username', '輸入 Discord 用戶名...')}
            className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>

        <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2">
            <Users className="w-4 h-4" />
            {t('binding.bound_members', '已綁定成員')} ({stagedIds.length})
          </h4>
          <StagedMembersList
            stagedIds={stagedIds}
            members={members}
            guilds={guilds}
            onUnbindStage={onUnbindStage}
            t={t as any}
          />
        </div>

        <button
          onClick={onSaveNewBinding}
          disabled={!canSaveNewBinding || isBinding}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 rounded-xl font-bold transition-colors shadow-lg shadow-indigo-600/20"
        >
          {isBinding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('binding.save_changes', '儲存變更')}
        </button>
      </div>
    );
  }

  // Editing existing profile
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-stone-500 hover:text-indigo-500 flex items-center gap-1">
          <Undo className="w-4 h-4" /> {t('common.back', '返回')}
        </button>
        {hasUnsavedChanges && (
          <span className="text-xs font-medium text-amber-500 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-md">
            {t('binding.unsaved_changes', '有未儲存的變更')}
          </span>
        )}
      </div>

      <div className="w-full flex items-center gap-4 p-4 rounded-xl border bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 ring-2 ring-indigo-500/20">
        <img
          src={selectedProfile!.avatar_url || 'https://picsum.photos/seed/avatar/100/100'}
          alt={selectedProfile!.display_name}
          className="w-12 h-12 rounded-full border-2 border-white dark:border-stone-700 shadow-sm"
          referrerPolicy="no-referrer"
        />
        <div className="text-left flex-1">
          <p className="font-bold text-stone-800 dark:text-stone-100">{selectedProfile!.display_name}</p>
          <p className="text-xs text-stone-500 dark:text-stone-400 font-mono">{selectedProfile!.discord_id}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
          Discord {t('binding.username', '用戶名')}
        </label>
        <input
          type="text"
          value={editingDiscordUsername}
          onChange={(e) => onEditingDiscordUsernameChange(e.target.value)}
          className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
        />
      </div>

      <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2">
          <Users className="w-4 h-4" />
          {t('binding.bound_members', '已綁定成員')} ({stagedIds.length})
        </h4>
        <StagedMembersList
          stagedIds={stagedIds}
          members={members}
          guilds={guilds}
          onUnbindStage={onUnbindStage}
          t={t as any}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onRestore}
          disabled={!hasUnsavedChanges || isBinding}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50 rounded-xl font-medium transition-colors"
        >
          <Undo className="w-4 h-4" />
          {t('binding.restore', '還原')}
        </button>
        <button
          onClick={onSave}
          disabled={!hasUnsavedChanges || isBinding}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 rounded-xl font-bold transition-colors shadow-lg shadow-indigo-600/20"
        >
          {isBinding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('binding.save_changes', '儲存變更')}
        </button>
      </div>
    </div>
  );
}
