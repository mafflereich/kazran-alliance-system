import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTierTextColorDark, getTierHighlightClass, getTierHoverClass } from '@/shared/lib/utils';

interface GuildSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sortedGuilds: [string, any][];
  currentGuildId: string;
}

export default function GuildSidebar({ isOpen, onClose, sortedGuilds, currentGuildId }: GuildSidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-stone-900/50 z-40"
          onClick={onClose}
        />
      )}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-stone-900 text-stone-300 z-50
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        flex flex-col
      `}>
        <div className="p-4 flex items-center justify-between border-b border-stone-800">
          <h2 className="font-bold text-white flex items-center gap-2">
            {t('dashboard.guild_list')}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-800 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-6 px-2">
            {[1, 2, 3, 4].map(tier => {
              const tierGuilds = sortedGuilds.filter(g => (g[1].tier || 1) === tier && g[1].isDisplay !== false);
              if (tierGuilds.length === 0) return null;
              return (
                <div key={tier}>
                  <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 px-4 ${getTierTextColorDark(tier)}`}>{t('guilds.tier')} {tier}</h3>
                  <ul className="space-y-1">
                    {tierGuilds.map(([id, g]) => (
                      <li key={id}>
                        <button
                          onClick={() => {
                            navigate(`/guild/${id}`);
                            onClose();
                          }}
                          className={`w-full text-left px-4 py-2 rounded-lg transition-colors flex justify-between items-center ${id === currentGuildId
                            ? `${getTierHighlightClass(tier)} font-medium`
                            : `${getTierHoverClass(tier)} text-stone-300`
                            }`}
                        >
                          <span>{g.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
