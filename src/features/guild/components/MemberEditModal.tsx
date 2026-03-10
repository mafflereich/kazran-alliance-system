import { useState } from 'react';
import { useAppContext } from '@/store';
import { X, Save, CheckCircle2, Swords } from 'lucide-react';
import { getImageUrl } from '@/shared/lib/utils';
import { useTranslation } from 'react-i18next';
import { logEvent } from '@/analytics';

export default function MemberEditModal({ memberId, onClose }: { memberId: string, onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { db, updateMember, showToast } = useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const member = db.members[memberId];

  if (!member) return null;

  const [records, setRecords] = useState(member.records ?? {});
  const [exclusiveWeapons, setExclusiveWeapons] = useState(member.exclusiveWeapons ?? {});

  const handleSave = async () => {
    setIsSaving(true);
    logEvent('GuildDashboard', 'Update Member Costume', member.name);

    try {
      setShowSuccess(true);
      await updateMember(memberId, { records, exclusiveWeapons: exclusiveWeapons });

      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error("Error updating member:", error);
      showToast(t('common.save_failed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const characters = Object.values(db.characters).sort((a, b) => {
    const aHasNew = Object.values(db.costumes).some(c => c.characterId === a.id && c.isNew);
    const bHasNew = Object.values(db.costumes).some(c => c.characterId === b.id && c.isNew);

    if (aHasNew && !bHasNew) return -1;
    if (!aHasNew && bHasNew) return 1;

    return a.orderNum - b.orderNum;
  });

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 bg-stone-900/60 dark:bg-black/70 backdrop-blur-sm pt-[80px]">
      <div className="bg-stone-100 dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[calc(100vh-120px)] flex flex-col overflow-hidden">
        <div className="bg-white dark:bg-stone-800 px-6 py-4 border-b border-stone-200 dark:border-stone-700 flex justify-between items-center sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-200">{t('common.edit_member_title', { name: member.name })}</h2>
            <p className="text-stone-500 dark:text-stone-400 text-sm">{t('common.edit_member_desc')}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-full transition-colors">
            <X className="w-6 h-6 text-stone-500 dark:text-stone-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {characters.map(character => {
            const hasExclusiveWeapon = exclusiveWeapons[character.id] ?? false;

            const characterCostumes = Object.values(db.costumes).filter(c => c.characterId === character.id).sort((a, b) => (a.orderNum ?? 999) - (b.orderNum ?? 999));
            return (
              <div key={character.id} className={`bg-white dark:bg-stone-800 rounded-xl shadow-sm border ${hasExclusiveWeapon ? 'border-orange-400' : 'border-stone-200 dark:border-stone-700'} overflow-hidden`}>
                <div className="bg-stone-50 dark:bg-stone-700 px-5 py-3 border-b border-stone-200 dark:border-stone-600 flex justify-between items-center">
                  <h3 className="font-bold text-stone-800 dark:text-stone-200">{i18n.language === 'en' ? (character.nameE || character.name) : character.name}</h3>
                  <label className="flex items-center gap-2 cursor-pointer group bg-stone-50 dark:bg-stone-700 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 active:bg-stone-100 transition-colors shrink-0">
                    <Swords className={`w-4 h-4 transition-colors ${hasExclusiveWeapon ? 'text-amber-600' : 'text-stone-400'}`} />
                    <span className={`text-sm font-bold ${hasExclusiveWeapon ? 'text-amber-700' : 'text-stone-500 dark:text-stone-400'}`}>{t('common.ur_exclusive')}</span>
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={hasExclusiveWeapon}
                        onChange={(e) => setExclusiveWeapons({ ...exclusiveWeapons, [character.id]: e.target.checked })}
                      />
                      <div className="w-10 h-6 bg-stone-200 dark:bg-stone-600 rounded-full peer peer-checked:bg-amber-500 transition-colors shadow-inner"></div>
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-md"></div>
                    </div>
                  </label>
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-700">
                  {characterCostumes.map(costume => {
                    const record = records[costume.id] || { level: -1 };

                    return (
                      <div key={costume.id} className="p-4 flex flex-col gap-3 hover:bg-stone-50/50 dark:hover:bg-stone-700/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {costume.imageName && (
                            <div className="w-[40px] h-[40px] bg-stone-100 dark:bg-stone-700 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-600 flex-shrink-0">
                              <img
                                src={getImageUrl(costume.imageName)}
                                alt={i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          <div className="font-medium text-stone-800 dark:text-stone-200">
                            {i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 flex-1 flex-wrap">
                            <label className="text-sm font-bold text-stone-500 dark:text-stone-400 whitespace-nowrap mr-2">{t('common.level')}</label>
                            <div className="flex flex-wrap gap-1">
                              {[
                                { val: -1, label: t('common.not_owned') },
                                { val: 0, label: '+0' },
                                { val: 1, label: '+1' },
                                { val: 2, label: '+2' },
                                { val: 3, label: '+3' },
                                { val: 4, label: '+4' },
                                { val: 5, label: '+5' }
                              ].map(opt => {
                                let activeColorClass = "bg-orange-400 text-stone-900 shadow-sm scale-105";
                                if (opt.val <= 0) activeColorClass = "bg-stone-300 text-stone-900 shadow-sm scale-105";
                                else if (opt.val === 1) activeColorClass = "bg-blue-300 text-stone-900 shadow-sm scale-105";
                                else if (opt.val === 2) activeColorClass = "bg-blue-400 text-stone-900 shadow-sm scale-105";
                                else if (opt.val === 3) activeColorClass = "bg-purple-300 text-stone-900 shadow-sm scale-105";
                                else if (opt.val === 4) activeColorClass = "bg-purple-400 text-stone-900 shadow-sm scale-105";

                                return (
                                  <button
                                    key={opt.val}
                                    onClick={() => setRecords({ ...records, [costume.id]: { level: opt.val } })}
                                    className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-all ${record.level == opt.val
                                      ? activeColorClass
                                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600'
                                      }`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          })
          }
        </div>

        <div className="bg-white dark:bg-stone-800 px-6 py-4 border-t border-stone-200 dark:border-stone-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="p-2 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-xl transition-colors"
            title={t('common.cancel')}
          >
            <X className="w-6 h-6" />
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center justify-center p-2 rounded-xl font-medium shadow-sm transition-all active:scale-95 disabled:opacity-70 ${showSuccess ? 'bg-green-600 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            title={showSuccess ? t('common.saved') : isSaving ? t('common.saving') : t('common.save_changes')}
          >
            {showSuccess ? <CheckCircle2 className="w-6 h-6" /> : <Save className="w-6 h-6" />}
          </button>
        </div>
      </div>
    </div>
  );
}
