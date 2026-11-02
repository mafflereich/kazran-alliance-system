import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * 裝備表設定視窗用的可折疊分區。
 * 每個分區都能獨立展開／收合，狀態只存在元件內部（重新開啟視窗時回到預設）。
 */
export default function CollapsibleSection({
  title,
  description,
  icon,
  badge,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <section className="bg-white dark:bg-stone-800 rounded-xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-stone-50 dark:bg-stone-700 hover:bg-stone-100 dark:hover:bg-stone-600 transition-colors text-left"
      >
        <span className="flex items-center gap-3 min-w-0">
          {icon && <span className="shrink-0 text-amber-500">{icon}</span>}
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="font-bold text-stone-800 dark:text-stone-200">{title}</span>
              {badge}
            </span>
            {description && (
              <span className="block text-xs text-stone-500 dark:text-stone-400 mt-0.5 truncate">
                {description}
              </span>
            )}
          </span>
        </span>
        {open
          ? <ChevronDown className="w-5 h-5 shrink-0 text-stone-400" />
          : <ChevronRight className="w-5 h-5 shrink-0 text-stone-400" />}
      </button>
      {open && <div className="border-t border-stone-200 dark:border-stone-600">{children}</div>}
    </section>
  );
}
