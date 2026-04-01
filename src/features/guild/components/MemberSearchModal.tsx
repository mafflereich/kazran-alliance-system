import React, { useState } from 'react';
import { X, Search, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/store';
import { Member } from '@/entities/member/types';

interface MemberSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MemberSearchModal({ isOpen, onClose }: MemberSearchModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { searchMembers, db, setCurrentView } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const PAGE_SIZE = 20;

  if (!isOpen) return null;

  const handleSearch = async (page: number = 1) => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const { data, total } = await searchMembers(searchQuery, includeArchived, page, PAGE_SIZE);
      setSearchResults(data);
      setTotalResults(total);
      setCurrentPage(page);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(1);
    }
  };

  const handleGoToGuild = (guildId: string) => {
    navigate(`/guild/${guildId}`);
    onClose();
  };

  const totalPages = Math.ceil(totalResults / PAGE_SIZE);

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 bg-stone-900/60 dark:bg-black/70 backdrop-blur-sm pt-[80px]">
      <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-600 flex justify-between items-center bg-stone-50 dark:bg-stone-700">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-200 flex items-center gap-2">
            <Search className="w-5 h-5 text-stone-500 dark:text-stone-400" />
            {t('dashboard.global_search_member', '全域搜尋成員')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 dark:hover:bg-stone-600 rounded-full transition-colors">
            <X className="w-5 h-5 text-stone-500 dark:text-stone-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-6">
          {/* Search Input Area */}
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-stone-400 dark:text-stone-500" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('dashboard.enter_member_name', '請輸入成員名稱...')}
                  className="w-full pl-10 pr-4 py-2 border border-stone-300 dark:border-stone-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all bg-stone-50 dark:bg-stone-700 focus:bg-white dark:focus:bg-stone-600 dark:text-stone-100"
                />
              </div>
              <button
                onClick={() => handleSearch(1)}
                disabled={isSearching || !searchQuery.trim()}
                className="px-6 py-2 bg-stone-800 dark:bg-stone-600 text-white font-medium rounded-xl hover:bg-stone-700 dark:hover:bg-stone-500 transition-colors shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  t('common.search', '搜尋')
                )}
              </button>
            </div>

            <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400 cursor-pointer select-none self-start">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="w-4 h-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
              />
              {t('dashboard.include_archived', '包括封存成員')}
            </label>
          </div>

          {/* Results Area */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                {t('dashboard.search_results', '搜尋結果')}
                {hasSearched && ` (${totalResults})`}
              </h3>

              {/* Pagination Controls */}
              {hasSearched && totalPages > 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => handleSearch(currentPage - 1)}
                    disabled={currentPage === 1 || isSearching}
                    className="px-2 py-1 rounded hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    &lt;
                  </button>
                  <span className="text-stone-600 dark:text-stone-400">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => handleSearch(currentPage + 1)}
                    disabled={currentPage === totalPages || isSearching}
                    className="px-2 py-1 rounded hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    &gt;
                  </button>
                </div>
              )}
            </div>

            <div className="border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden divide-y divide-stone-100 dark:divide-stone-700 max-h-[400px] overflow-y-auto">
              {searchResults.length > 0 ? (
                searchResults.map((member) => {
                  const guildName = db.guilds[member.guildId]?.name || 'Unknown Guild';
                  const isArchived = member.status === 'archived';

                  return (
                    <div key={member.id} className="flex items-center justify-between p-4 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">
                      <div className="flex flex-col">
                        <span className="font-medium text-stone-800 dark:text-stone-200 flex items-center gap-2">
                          {member.name}
                        </span>
                        <span className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{isArchived ? '-' : guildName}</span>
                      </div>
                      <button
                        onClick={() => !isArchived && handleGoToGuild(member.guildId)}
                        disabled={isArchived}
                        className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${isArchived
                          ? 'bg-stone-100 text-stone-400 dark:bg-stone-700 dark:text-stone-500 cursor-not-allowed'
                          : 'text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30 dark:hover:bg-amber-900/50'
                          }`}
                        title={isArchived ? t('dashboard.member_archived', '成員已封存') : t('dashboard.go_to_guild', '前往公會')}
                      >
                        {isArchived ? t('dashboard.archived', '已封存') : t('dashboard.view_guild', '查看公會')}
                        {!isArchived && <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                  );
                })
              ) : hasSearched ? (
                <div className="p-8 text-center text-stone-500 dark:text-stone-400 flex flex-col items-center gap-2">
                  <Search className="w-8 h-8 text-stone-300 dark:text-stone-600" />
                  <p>{t('dashboard.no_results', '找不到符合的成員')}</p>
                </div>
              ) : (
                <div className="p-8 text-center text-stone-400 dark:text-stone-500">
                  {t('dashboard.search_hint', '輸入名稱搜尋成員')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
