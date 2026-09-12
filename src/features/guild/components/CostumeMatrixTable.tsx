import React from 'react';
import { Swords } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/store';
import { getImageUrl } from '@/shared/lib/utils';

interface CostumeMatrixTableProps {
  members: any[];
  costumes: any[];
}

const roleOrder: Record<string, number> = { leader: 1, coleader: 2, member: 3 };

const levelColorClass = (level: number): string => {
  if (level <= 0) return 'bg-stone-300 text-stone-900';
  if (level === 1) return 'bg-blue-300 text-stone-900';
  if (level === 2) return 'bg-blue-400 text-stone-900';
  if (level === 3) return 'bg-purple-300 text-stone-900';
  if (level === 4) return 'bg-purple-400 text-stone-900';
  return 'bg-orange-400 text-stone-900';
};

export default function CostumeMatrixTable({ members, costumes }: CostumeMatrixTableProps) {
  const { t, i18n } = useTranslation();
  const { db } = useAppContext();
  const [isDragging, setIsDragging] = React.useState(false);
  const [startX, setStartX] = React.useState(0);
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };
  const handleMouseLeave = () => setIsDragging(false);
  const handleMouseUp = () => setIsDragging(false);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    scrollRef.current.scrollLeft = scrollLeft - (x - startX) * 1.5;
  };

  const sortedMembers = React.useMemo(() => {
    return [...members].sort((a, b) => {
      const orderA = roleOrder[a.role] || 99;
      const orderB = roleOrder[b.role] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [members]);

  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
      <div
        ref={scrollRef}
        className={`overflow-x-auto overflow-y-auto max-h-[70vh] cursor-grab [&::-webkit-scrollbar:horizontal]:hidden ${isDragging ? 'cursor-grabbing select-none' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
      >
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300">
              <th className="p-2.5 font-semibold sticky left-0 bg-stone-50 dark:bg-stone-700 z-30 border-r border-b-2 border-stone-200 dark:border-stone-600 shadow-[1px_0_0_0_#e7e5e4] dark:shadow-[1px_0_0_0_#44403c]">
                {t('common.member')}
              </th>
              {costumes.map(c => (
                <th
                  key={c.id}
                  className="p-2 font-semibold text-center text-xs w-24 border-r border-b-2 border-stone-200 dark:border-stone-600 last:border-r-0 sticky top-0 bg-stone-50 dark:bg-stone-700 z-20 align-top"
                >
                  {c.imageName && (
                    <div className="w-[46px] h-[46px] mx-auto mb-1.5 bg-stone-100 dark:bg-stone-700 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-600">
                      <img
                        src={getImageUrl(c.imageName)}
                        alt={i18n.language === 'en' ? (c.nameE || c.name) : c.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <div className="truncate w-[88px] mx-auto" title={i18n.language === 'en' ? (c.nameE || c.name) : c.name}>
                    {i18n.language === 'en' ? (c.nameE || c.name) : c.name}
                  </div>
                  <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 truncate w-[88px] mx-auto">
                    <span title={i18n.language === 'en' ? (db.characters[c.characterId]?.nameE || db.characters[c.characterId]?.name) : db.characters[c.characterId]?.name}>
                      {i18n.language === 'en' ? (db.characters[c.characterId]?.nameE || db.characters[c.characterId]?.name) : db.characters[c.characterId]?.name}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map(member => (
              <tr key={member.id} className="border-b border-stone-100 dark:border-stone-700">
                <td className="p-2.5 font-medium text-stone-800 dark:text-stone-200 sticky left-0 z-10 bg-white dark:bg-stone-800 border-r border-stone-200 dark:border-stone-600 shadow-[1px_0_0_0_#e7e5e4] dark:shadow-[1px_0_0_0_#44403c] whitespace-nowrap">
                  <span className={member.role === 'leader'
                    ? 'px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                    : member.role === 'coleader'
                      ? 'px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                      : ''}>
                    {member.name}
                  </span>
                </td>
                {costumes.map(c => {
                  const record = member.records?.[c.id];
                  const hasCostume = record && record.level >= 0;
                  const hasExclusiveWeapon = member.exclusiveWeapons?.[c.characterId] ?? false;
                  return (
                    <td key={c.id} className={`p-0 text-center border-r border-stone-100 dark:border-stone-700 last:border-r-0 h-full ${hasCostume ? levelColorClass(Number(record.level)) : ''}`}>
                      <div className="flex flex-col items-center justify-center h-full min-h-[44px] py-1 gap-0.5">
                        {hasCostume ? (
                          <>
                            <span className="font-bold text-sm leading-none">+{record.level}</span>
                            {hasExclusiveWeapon && <Swords className="w-3.5 h-3.5 text-stone-700" />}
                          </>
                        ) : (
                          <>
                            <span className="text-sm text-stone-300 dark:text-stone-600 leading-none">-</span>
                            {hasExclusiveWeapon && <Swords className="w-3.5 h-3.5 text-amber-500/60" />}
                          </>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {sortedMembers.length === 0 && (
              <tr>
                <td colSpan={costumes.length + 1} className="p-8 text-center text-stone-500 dark:text-stone-400">
                  {t('my_costumes.no_members')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}