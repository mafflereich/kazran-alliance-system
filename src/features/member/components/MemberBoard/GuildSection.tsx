
import { Plus } from 'lucide-react';
import MemberCard from './MemberCard/MemberCard';
import type { Guild, Member } from '@entities/member/types';
import { useMemberBoardStore } from './store/useMemberBoardStore';
import { useState, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';

type GuildWithMembers = Guild & { members: Member[] };

type Props = {
    guild: GuildWithMembers;
    cardWidth: number;  // 固定卡片寬度，由 TierSection 傳入
};

export default function GuildSection({ guild, cardWidth }: Props) {
    const { selectedIds, isMultiSelectMode, toggleSelect, addMember, moveSelectedMembers } = useMemberBoardStore();
    const [isAdding, setIsAdding] = useState(false);
    const [newMemberName, setNewMemberName] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    const handleGuildClick = (e: React.MouseEvent) => {
        if (isMultiSelectMode && selectedIds.size > 0) {
            e.preventDefault();
            e.stopPropagation();
            moveSelectedMembers(guild.id!);
        }
    };

    // 點擊外部關閉輸入框
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsAdding(false);
                setNewMemberName('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleAddMember = async () => {
        if (!newMemberName.trim()) return;

        // Create new member object
        const newMember: Member = {
            id: uuidv4(),
            name: newMemberName.trim(),
            guildId: guild.id!,
            role: 'member',
            records: {},
            exclusiveWeapons: {},
            score: 0,
            updatedAt: Date.now(),
        };

        addMember(newMember);

        setIsAdding(false);
        setNewMemberName('');
    };

    // 排序：先按角色優先級
    const sortedMembers = useMemo(() => {
        return [...(guild.members || [])].sort((a, b) => {
            const getPriority = (role: string) => {
                if (role === 'leader') return 1;
                if (role === 'coleader') return 2;
                return 999;
            };

            const priA = getPriority(a.role);
            const priB = getPriority(b.role);

            if (priA !== priB) return priA - priB;

            return (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
        });
    }, [guild.members]);

    // 補足到 30 個位置
    const displaySlots = useMemo(() => {
        const slots = [...sortedMembers];
        while (slots.length < 30) {
            slots.push({ id: `empty-${guild.id}-${slots.length}` } as any);
        }
        return slots;
    }, [sortedMembers, guild.id]);

    // 公會總分小計
    const guildTotalScore = useMemo(() => {
        return (guild.members || []).reduce((sum, m) => sum + (m.score ?? 0), 0);
    }, [guild.members]);

    return (
        <div
            ref={containerRef}
            onClick={handleGuildClick}
            className={`
        guild-section relative bg-gray-900 rounded-xl border overflow-hidden flex flex-col shadow-sm flex-shrink-0 transition-all duration-200 select-none
        ${isMultiSelectMode && selectedIds.size > 0 ? 'cursor-pointer ring-2 ring-indigo-500' : 'cursor-default'}
        border-gray-700
      `}
            style={{ width: `${cardWidth + 50}px` }}
        >
            {/* 公會標題 + 總分小計 */}
            <div className="px-4 py-3 bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-700 flex justify-between items-center">
                <div>
                    <h3 className="text-base font-semibold text-gray-100 truncate">
                        {guild.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                        {guild.members.length} / 30 人
                    </p>
                </div>

                <div className="text-base font-bold text-emerald-400">
                    {guildTotalScore}
                </div>
            </div>

            <div className="p-0.5 grid grid-cols-1 gap-0 bg-gray-950/60 min-h-[50px] place-items-center">
                {displaySlots.map((member, index) => {
                    const isEmpty = member.id?.startsWith('empty-');
                    if (isEmpty) {
                        return (
                            <div
                                key={member.id}
                                className="border border-dashed border-gray-800 rounded-md m-0.5 flex items-center justify-center text-[9px] text-gray-700 italic"
                                style={{
                                    minHeight: '40px',
                                    width: `${cardWidth}px`,
                                }}
                            >
                                Slot {index + 1}
                            </div>
                        );
                    }

                    const isLeader = member.role === 'leader';
                    const isVice = member.role === 'coleader';

                    return (
                        <MemberCard
                            key={member.id}
                            member={member}
                            isSelected={selectedIds.has(member.id!)}
                            isMultiSelectMode={isMultiSelectMode}
                            onToggleSelect={() => toggleSelect(member.id!)}
                            isLeader={isLeader}
                            isVice={isVice}
                            fixedWidth={cardWidth}
                            index={index}
                        />
                    );
                })}
            </div>

            {/* 新增成員按鈕 */}
            <div className="p-2 border-t border-gray-700 bg-gray-900">
                {isAdding ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newMemberName}
                            onChange={(e) => setNewMemberName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddMember();
                                if (e.key === 'Escape') {
                                    setIsAdding(false);
                                    setNewMemberName('');
                                }
                            }}
                            placeholder="輸入名稱..."
                            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 min-w-0"
                            autoFocus
                        />
                        <button
                            onClick={handleAddMember}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded text-xs flex-shrink-0"
                        >
                            新增
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="w-full flex items-center justify-center gap-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded py-1 transition-colors text-xs"
                    >
                        <Plus size={14} />
                        新增成員
                    </button>
                )}
            </div>
        </div>
    );
}