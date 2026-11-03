import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectFilter {
  id: string;
  label: string;
  /** 有選取時顯示的短標籤（例如「公會：青龍」）；沒給就只顯示選項名稱 */
  shortLabel?: string;
  options: FilterSelectOption[];
}

interface FilterSelectProps {
  filter: FilterSelectFilter;
  value: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
  /** 觸發按鈕佔滿容器寬度（表格儲存格、表單欄位用） */
  fullWidth?: boolean;
  /** 外層容器額外的 class（例如 flex-1） */
  className?: string;
}

/** 選項數量超過這個值才顯示搜尋框（角色、Tier 這種三五個的不需要） */
const SEARCH_VISIBLE_THRESHOLD = 8;
/** 面板最小寬度，也要留出與視窗邊界的距離 */
const PANEL_MIN_WIDTH = 288;
const PANEL_MAX_HEIGHT = 320;

/**
 * 可搜尋的篩選 / 選擇器（公會、角色、權限類別、Tier…）。
 *
 * 為什麼不用 <select>：公會有上百個，原生下拉選單只能一行一行滾、不能搜尋，
 * 也很難定位。這裡是 popover：選項多時上方多一個搜尋框、清單限高可滾動、
 * 已選值可一鍵清除，鍵盤（↑ ↓ Enter Esc）也能操作。
 *
 * 面板用 portal 掛到 <body> 並以 fixed 定位：
 *  - 表格的 `overflow-x-auto`、modal 的 `overflow-hidden` 都會裁掉絕對定位的子元素，
 *    用 portal 就不會被裁掉，也不必為了放下拉而改版面。
 *  - z-index 高於 modal（z-[130]），開在 modal 裡也看得到。
 *
 * 開啟狀態由外層管理（一次只開一個），按 Esc 只會關掉這一層。
 */
export default function FilterSelect({
  filter,
  value,
  isOpen,
  onToggle,
  onClose,
  onChange,
  fullWidth = false,
  className = '',
}: FilterSelectProps) {
  const { i18n } = useTranslation(['admin', 'translation']);
  const isZh = i18n.language.startsWith('zh');

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 篩選器物件可能是父層每次 render 新建的，用 ref 取最新值避免重置搜尋字
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const valueRef = useRef(value);
  valueRef.current = value;

  const selectedOption = filter.options.find(option => option.value === value);
  const hasSelection = !!value;
  const showSearch = filter.options.length >= SEARCH_VISIBLE_THRESHOLD;

  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return filter.options;
    return filter.options.filter(
      option =>
        option.label.toLowerCase().includes(normalized) || option.value.toLowerCase().includes(normalized),
    );
  }, [filter.options, query]);

  // 開啟時重置搜尋字，並把焦點放到「可以馬上打字」的地方
  useEffect(() => {
    if (!isOpen) return;
    const currentFilter = filterRef.current;
    setQuery('');
    const selectedIndex = currentFilter.options.findIndex(option => option.value === valueRef.current);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : -1);

    const frame = window.requestAnimationFrame(() => {
      const target = currentFilter.options.length >= SEARCH_VISIBLE_THRESHOLD ? searchRef.current : listRef.current;
      target?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const updatePosition = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    const width = Math.max(rect.width, PANEL_MIN_WIDTH);
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(PANEL_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow));
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));

    setPanelStyle(
      openUp
        ? { left, bottom: window.innerHeight - rect.top + gap, width, maxHeight }
        : { left, top: rect.bottom + gap, width, maxHeight },
    );
  }, []);

  // 展開時定位；捲動 / 視窗縮放時跟著移動
  useEffect(() => {
    if (!isOpen) {
      setPanelStyle(null);
      return;
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // 點到這組（觸發按鈕或面板）以外的地方就收起來
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, onClose]);

  const commit = (nextValue: string) => {
    onChange(nextValue);
    onClose();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      // 只關掉這一層；不要讓外層 modal 的 Escape 一起關閉
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(visibleOptions.length - 1, index + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(0, index - 1));
      return;
    }
    if (event.key === 'Enter') {
      const option = visibleOptions[activeIndex];
      if (!option) return;
      event.preventDefault();
      commit(option.value);
    }
  };

  const triggerTone = hasSelection
    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200'
    : 'border-stone-300 bg-white text-stone-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200';

  const triggerText = selectedOption
    ? filter.shortLabel
      ? `${filter.shortLabel}${isZh ? '：' : ': '}${selectedOption.label}`
      : selectedOption.label
    : filter.label;

  return (
    <div ref={containerRef} className={`relative ${fullWidth ? 'w-full' : ''} ${className}`.trim()}>
      <div
        className={`items-stretch overflow-hidden rounded-lg border text-xs transition-colors ${
          fullWidth ? 'flex w-full' : 'inline-flex'
        } ${triggerTone}`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          title={selectedOption?.label ?? filter.label}
          className={`flex items-center gap-1 px-2.5 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.06] ${
            fullWidth ? 'flex-1 min-w-0 justify-between' : 'max-w-[220px]'
          }`}
        >
          <span className="truncate font-medium">{triggerText}</span>
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {hasSelection && (
          <button
            type="button"
            onClick={() => commit('')}
            aria-label={isZh ? '清除篩選' : 'Clear filter'}
            title={isZh ? '清除篩選' : 'Clear filter'}
            className="flex items-center px-1.5 border-l border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen &&
        panelStyle &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="fixed z-[200] flex flex-col overflow-hidden rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 shadow-2xl"
          >
            {showSearch && (
              <div className="p-2 border-b border-stone-200 dark:border-stone-700">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={event => {
                      setQuery(event.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={isZh ? '輸入關鍵字搜尋…' : 'Search options…'}
                    className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            )}

            <div
              ref={listRef}
              role="listbox"
              aria-label={filter.label}
              tabIndex={-1}
              onKeyDown={handleKeyDown}
              className="flex-1 overflow-y-auto py-1 focus:outline-none"
            >
              <button
                type="button"
                role="option"
                aria-selected={!hasSelection}
                onClick={() => commit('')}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                  !hasSelection
                    ? 'font-bold text-amber-700 dark:text-amber-300'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700/60'
                }`}
              >
                <span className="flex-1 truncate">{isZh ? '全部（不篩選）' : 'All (no filter)'}</span>
                {!hasSelection && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>

              {visibleOptions.map((option, index) => {
                const selected = option.value === value;
                const active = index === activeIndex;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    title={option.label}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commit(option.value)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                      selected ? 'font-bold text-amber-700 dark:text-amber-300' : 'text-stone-700 dark:text-stone-200'
                    } ${active ? 'bg-stone-100 dark:bg-stone-700/60' : ''}`}
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                    {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}

              {visibleOptions.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-stone-500 dark:text-stone-400">
                  {isZh ? '找不到符合的選項。' : 'No matching option.'}
                </p>
              )}
            </div>

            <div className="px-3 py-1.5 border-t border-stone-200 dark:border-stone-700 text-[11px] text-stone-500 dark:text-stone-400">
              {isZh ? `共 ${visibleOptions.length} 個選項` : `${visibleOptions.length} options`}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

