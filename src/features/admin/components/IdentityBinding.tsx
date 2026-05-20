import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import ConfirmModal from '@/shared/ui/ConfirmModal';
import { useIdentityBinding } from './identityBinding/useIdentityBinding';
import SingleMatchPanel from './identityBinding/SingleMatchPanel';
import MultiMatchPanel from './identityBinding/MultiMatchPanel';
import MemberSearchPanel from './identityBinding/MemberSearchPanel';

export default function IdentityBinding() {
  const { t } = useTranslation('admin');
  const binding = useIdentityBinding();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex bg-stone-100 dark:bg-stone-800 p-1 rounded-lg">
          <button
            onClick={binding.switchToSingle}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              binding.mode === 'single'
                ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            {t('binding.single_match', '單一匹配')}
          </button>
          <button
            onClick={binding.switchToMulti}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              binding.mode === 'multi'
                ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            {t('binding.multi_match', '多重匹配')}
          </button>
        </div>

        <button
          onClick={binding.fetchAllProfiles}
          disabled={binding.isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50"
          title={t('common.refresh', '重新整理')}
        >
          <RefreshCw className={`w-4 h-4 ${binding.isLoading ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh', '重新整理')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {binding.mode === 'single' ? (
          <SingleMatchPanel
            unmatchedProfiles={binding.unmatchedProfiles}
            isLoading={binding.isLoading}
            selectedProfile={binding.selectedProfile}
            onSelectProfile={binding.setSelectedProfile}
            onDeleteProfile={binding.handleDeleteProfileClick}
          />
        ) : (
          <MultiMatchPanel
            selectedProfile={binding.selectedProfile}
            newBindingMember={binding.newBindingMember}
            onSelectProfile={binding.handleMultiSelectProfile}
            onSelectUnbound={binding.handleMultiSelectUnbound}
            onBack={binding.handleMultiBack}
            leftSearchQuery={binding.leftSearchQuery}
            onLeftSearchQueryChange={binding.setLeftSearchQuery}
            leftSearchType={binding.leftSearchType}
            onLeftSearchTypeChange={binding.setLeftSearchType}
            leftSearchResults={binding.leftSearchResults}
            stagedIds={binding.stagedIds}
            onUnbindStage={binding.handleUnbindStage}
            hasUnsavedChanges={binding.hasUnsavedChanges}
            canSaveNewBinding={binding.canSaveNewBinding}
            isBinding={binding.isBinding}
            onSave={binding.executeMultiSave}
            onRestore={binding.restoreMultiStage}
            onSaveNewBinding={binding.executeNewBinding}
            editingDiscordId={binding.editingDiscordId}
            onEditingDiscordIdChange={binding.setEditingDiscordId}
            editingDiscordUsername={binding.editingDiscordUsername}
            onEditingDiscordUsernameChange={binding.setEditingDiscordUsername}
            guilds={binding.db.guilds}
            members={binding.db.members}
          />
        )}

        <MemberSearchPanel
          isSearchActive={!!binding.selectedProfile || !!binding.newBindingMember}
          selectedProfile={binding.selectedProfile}
          searchQuery={binding.searchQuery}
          onSearch={binding.handleSearch}
          searchResults={binding.searchResults}
          isBinding={binding.isBinding}
          mode={binding.mode}
          stagedIds={binding.stagedIds}
          allProfiles={binding.allProfiles}
          onBindClick={binding.handleBindClick}
          guilds={binding.db.guilds}
        />
      </div>

      <ConfirmModal
        isOpen={binding.confirmModal.isOpen}
        title={t('binding.bind')}
        message={t('binding.confirm_bind', { name: binding.confirmModal.member?.name })}
        onConfirm={binding.executeSingleBind}
        onCancel={() => binding.setConfirmModal({ isOpen: false, member: null })}
      />

      <ConfirmModal
        isOpen={binding.deleteProfileModal.isOpen}
        title={t('binding.delete_profile', '刪除 Profile')}
        message={t('binding.confirm_delete_profile', { name: binding.deleteProfileModal.profile?.display_name })}
        onConfirm={binding.executeDeleteProfile}
        onCancel={() => binding.setDeleteProfileModal({ isOpen: false, profile: null })}
      />
    </div>
  );
}
