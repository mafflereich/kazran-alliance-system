import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import FilterSelect, { type FilterSelectFilter } from '@shared/ui/FilterSelect';

export interface PickerOption {
  /** 回傳給 onSelect 的值（使用者 auth_id / 權限 key / 公會 id） */
  id: string;
  label: string;
  /** 第二行：補充資訊（遊戲成員、公會、權限 key…） */
  sublabel?: string;
  /** 第三行：白話說明 */
  description?: string;
  /** 分組標題；有值時清單會依序插入群組列 */
  group?: string;
  /** 右側小標籤（角色、Tier…） */
  badge?: string;
  /** 額外可被搜尋的文字（英文名稱、Discord 帳號、成員名稱…） */
  searchText?: string;
  /** 篩選器 id → 值；多個值以 | 分隔（例如一位使用者有多個公會） */
  filterValues?: Record<string, string>;
}

export type PickerFilter = FilterSelectFilter;

interface PickerModalProps {
  isOpen: boolean;
  title: string;
  hint?: string;
  items: PickerOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  filters?: PickerFilter[];
  emptyText?: string;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 50;

/**
 * 共用的「搜尋 + 篩選」選擇器。
 *
 * 為什麼不用 <select>：聯盟有 1000+ 成員、數百個可授權帳號，原生下拉選單
 * 既不能搜尋也很難找。這裡改成 modal：開一個清單、上面有搜尋框與篩選器、
 * 清單自動分頁（每頁 50 筆），上千筆資料也不會一次爆出來卡住畫面。
 */
export default function PickerModal({
  isOpen,
  title,
  hint,
  items,
  selectedId,
  onSelect,
  onClose,
  searchPlaceholder,
  filters,
  emptyText,
  pageSize = DEFAULT_PAGE_SIZE,
}: PickerModalProps) {
  const { t, i18n } = useTranslation(['admin', 'translation']);
  const isZh = i18n.language.startsWith('zh');
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  /** 目前展開的篩選器（一次只開一個；Esc 只關這一層） */
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  // 每次開啟都回到乾淨狀態（不要沿用上一次的搜尋字）
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveFilters({});
    setPage(1);
    setOpenFilterId(null);
  }, [isOpen]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // 有展開的篩選器 → 先收起它，不要整個 modal 一起關掉
      if (openFilterId) {
        setOpenFilterId(null);
        return;
      }
      onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, openFilterId]);

  const closeFilter = useCallback(() => setOpenFilterId(null), []);

  const changeFilter = useCallback((filterId: string, value: string) => {
    setActiveFilters(prev => ({ ...prev, [filterId]: value }));
    setPage(1);
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter(item => {
      for (const filter of filters ?? []) {
        const selected = activeFilters[filter.id] ?? '';
        if (!selected) continue;
        const rawValue = item.filterValues?.[filter.id] ?? '';
        if (!rawValue.split('|').includes(selected)) return false;
      }

      if (!normalizedQuery) return true;

      const haystack = [item.label, item.sublabel, item.description, item.searchText, item.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [items, filters, activeFilters, query]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center p-4 pt-[60px] bg-stone-900/60 dark:bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={event => event.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-600 flex items-start justify-between gap-3 bg-stone-50 dark:bg-stone-700">
          <div>
            <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">{title}</h2>
            {hint && <p className="text-xs text-stone-500 dark:text-stone-300 mt-1">{hint}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-stone-200 dark:hover:bg-stone-600 transition-colors"
            aria-label={t('common.close', '關閉')}
          >
            <X className="w-5 h-5 text-stone-500 dark:text-stone-300" />
          </button>
        </div>

        {/* Search + filters */}
        <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-700 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder ?? t('permissions.picker_search', '輸入名稱搜尋…')}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {filters && filters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {filters.map(filter => (
                <FilterSelect
                  key={filter.id}
                  filter={filter}
                  value={activeFilters[filter.id] ?? ''}
                  isOpen={openFilterId === filter.id}
                  onToggle={() => setOpenFilterId(current => (current === filter.id ? null : filter.id))}
                  onClose={closeFilter}
                  onChange={value => changeFilter(filter.id, value)}
                />
              ))}
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-700">
          {pageItems.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
              {emptyText ?? t('permissions.picker_empty', '找不到符合的資料，請換個關鍵字。')}
            </p>
          ) : (
            pageItems.map((item, index) => {
              const showGroup = item.group && pageItems[index - 1]?.group !== item.group;
              const selected = item.id === selectedId;

              return (
                <div key={item.id}>
                  {showGroup && (
                    <div className="px-4 py-1.5 bg-stone-50 dark:bg-stone-700/50 text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-300">
                      {item.group}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item.id);
                      onClose();
                    }}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                      selected
                        ? 'bg-amber-50 dark:bg-amber-900/20'
                        : 'hover:bg-stone-50 dark:hover:bg-stone-700/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-stone-800 dark:text-stone-100 break-all">
                          {item.label}
                        </span>
                        {item.badge && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.sublabel && (
                        <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 break-words">
                          {item.sublabel}
                        </div>
                      )}
                      {item.description && (
                        <div className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
                          {item.description}
                        </div>
                      )}
                    </div>
                    {selected && <Check className="w-4 h-4 text-amber-600 shrink-0 mt-1" />}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer / pagination */}
        <div className="px-5 py-2.5 border-t border-stone-200 dark:border-stone-700 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
          <span>
            {isZh ? `符合 ${filteredItems.length} 筆` : `${filteredItems.length} results`}
            {totalPages > 1 &&
              (isZh
                ? ` · 第 ${safePage} / ${totalPages} 頁`
                : ` · page ${safePage} / ${totalPages}`)}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-30"
                aria-label={isZh ? '上一頁' : 'Previous page'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-30"
                aria-label={isZh ? '下一頁' : 'Next page'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
