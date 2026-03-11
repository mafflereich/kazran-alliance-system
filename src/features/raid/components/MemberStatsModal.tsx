import React, { useMemo } from 'react';
import { X, Swords } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getImageUrl } from '@/shared/lib/utils';
import { useAppContext } from '@/store';

interface MemberStatsModalProps {
  member: any;
  onClose: () => void;
}

export default function MemberStatsModal({ member, onClose }: MemberStatsModalProps) {
  const { t, i18n } = useTranslation(['raid', 'translation']);
  const { db } = useAppContext();

  const costumesByCharacter = useMemo(() => {
    if (!member?.records) return [];

    const grouped: Record<string, any[]> = {};
    Object.values(db.costumes).forEach(costume => {
      if (!grouped[costume.characterId]) {
        grouped[costume.characterId] = [];
      }
      grouped[costume.characterId].push(costume);
    });

    // Sort characters
    const sortedCharacterIds = Object.keys(grouped).sort((a, b) => {
      const charA = db.characters[a];
      const charB = db.characters[b];
      return (charA?.orderNum || 99) - (charB?.orderNum || 99);
    });

    return sortedCharacterIds.map(charId => {
      const char = db.characters[charId];
      const costumes = grouped[charId].sort((a, b) => (a.orderNum || 99) - (b.orderNum || 99));
      return {
        character: char,
        costumes
      };
    });
  }, [member, db.costumes, db.characters]);

  if (!member) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
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
          <div className="flex flex-wrap items-start gap-x-6 gap-y-6">
            {costumesByCharacter.map(({ character, costumes }) => (
              <div key={character?.id || 'unknown'} className="flex flex-col gap-3">
                <div className="text-sm font-bold text-stone-700 dark:text-stone-300 border-b border-stone-200 dark:border-stone-700 pb-1">
                  {character ? (i18n.language === 'en' ? (character.nameE || character.name) : character.name) : 'Unknown'}
                </div>
                <div className="flex flex-wrap gap-4">
                  {costumes.map(costume => {
                    const record = member.records[costume.id];
                    const isOwned = record && record.level >= 0;
                    const level = isOwned ? record.level : -1;
                    const hasWeapon = member.exclusiveWeapons?.[costume.characterId];
                    
                    let levelColorClass = "bg-orange-400 text-stone-900";
                    if (level <= 0) levelColorClass = "bg-stone-300 text-stone-900";
                    else if (level === 1) levelColorClass = "bg-blue-300 text-stone-900";
                    else if (level === 2) levelColorClass = "bg-blue-400 text-stone-900";
                    else if (level === 3) levelColorClass = "bg-purple-300 text-stone-900";
                    else if (level === 4) levelColorClass = "bg-purple-400 text-stone-900";

                    return (
                      <div key={costume.id} className={`w-24 bg-stone-50 dark:bg-stone-700/50 rounded-xl p-3 border border-stone-200 dark:border-stone-700 flex flex-col items-center gap-2 relative ${!isOwned ? 'opacity-60 grayscale' : ''}`}>
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
                        {isOwned && (
                          <div className="absolute -top-2 -right-2 flex flex-col items-center gap-1 z-10">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${levelColorClass}`}>
                              +{level}
                            </div>
                            {hasWeapon && (
                              <div className="w-6 h-6 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center shadow-sm">
                                <Swords className="w-3.5 h-3.5 text-amber-600" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
