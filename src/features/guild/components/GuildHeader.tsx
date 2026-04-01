import React from 'react';
import { Menu, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GuildHeaderProps {
  guildName: string;
  memberCount: number;
  onOpenSidebar: () => void;
  onOpenSearch: () => void;
  canSeeAllGuilds: boolean;
}

export default function GuildHeader({ guildName, memberCount, onOpenSidebar, onOpenSearch, canSeeAllGuilds }: GuildHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="bg-white dark:bg-stone-800 px-4 py-2 shadow-sm flex items-center gap-4 shrink-0">
      <button
        onClick={onOpenSidebar}
        className="p-2 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
      >
        <Menu className="w-5 h-5 text-stone-600 dark:text-stone-400" />
      </button>
      <div className="flex items-center gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-bold text-lg text-stone-800 dark:text-stone-200">{guildName}</h1>
          <span className={`text-xs font-medium ${memberCount > 30 ? 'text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded' : 'text-stone-500 dark:text-stone-400'}`}>
            {t('dashboard.member_count')}: {memberCount} / 30
          </span>
        </div>
        {canSeeAllGuilds && (
          <button
            onClick={onOpenSearch}
            className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:text-stone-500 dark:hover:text-stone-300 dark:hover:bg-stone-700 rounded-lg transition-colors"
            title={t('dashboard.global_search_member', '全域搜尋成員')}
          >
            <Search className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
