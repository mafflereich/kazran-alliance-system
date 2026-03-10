import React from 'react';
import { X, Swords } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getImageUrl } from '@/shared/lib/utils';
import { useAppContext } from '@/store';

interface MemberStatsModalProps {
  member: any;
  onClose: () => void;
}

export default function MemberStatsModal({ member, onClose }: MemberStatsModalProps) {
  const { t, i18n } = useTranslation();
  const { db } = useAppContext();

  if (!member) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-700/50">
          <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100 flex items-center gap-2">
            {member.name} {t('raid.stats', '練度資訊')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Object.values(db.costumes)
              .filter(c => member.records?.[c.id]?.level >= 0)
              .sort((a, b) => (b.orderNum || 99) - (a.orderNum || 99))
              .map(costume => {
                const level = member.records[costume.id].level;
                const hasWeapon = member.exclusiveWeapons?.[costume.characterId];
                
                let levelColorClass = "bg-orange-400 text-stone-900";
                if (level <= 0) levelColorClass = "bg-stone-300 text-stone-900";
                else if (level === 1) levelColorClass = "bg-blue-300 text-stone-900";
                else if (level === 2) levelColorClass = "bg-blue-400 text-stone-900";
                else if (level === 3) levelColorClass = "bg-purple-300 text-stone-900";
                else if (level === 4) levelColorClass = "bg-purple-400 text-stone-900";

                return (
                  <div key={costume.id} className="bg-stone-50 dark:bg-stone-700/50 rounded-xl p-3 border border-stone-200 dark:border-stone-700 flex flex-col items-center gap-2 relative">
                    {costume.imageName && (
                      <div className="w-16 h-16 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-600">
                        <img
                          src={getImageUrl(costume.imageName)}
                          alt={i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <div className="text-xs font-medium text-center truncate w-full text-stone-700 dark:text-stone-300" title={i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}>
                      {i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}
                    </div>
                    <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${levelColorClass}`}>
                      +{level}
                    </div>
                    {hasWeapon && (
                      <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center shadow-sm">
                        <Swords className="w-3.5 h-3.5 text-amber-600" />
                      </div>
                    )}
                  </div>
                );
            })}
          </div>
          {(!member.records || Object.keys(member.records).length === 0) && (
            <div className="text-center text-stone-500 py-8">
              {t('raid.no_stats', '尚無練度資料')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
