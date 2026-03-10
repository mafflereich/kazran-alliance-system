import React from 'react';

export function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${active ? 'text-amber-600 border-b-2 border-amber-600' : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
        }`}
    >
      {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' })}
      {label}
    </button>
  );
}
