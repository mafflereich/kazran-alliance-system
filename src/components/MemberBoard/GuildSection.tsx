// src/components/MemberBoard/GuildSection.tsx
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { MoveRight, Plus } from 'lucide-react';
import MemberCard from './MemberCard/MemberCard';
import type { Guild, Member } from './types';
import { useMemberBoardStore } from './store/useMemberBoardStore';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

type GuildWithMembers = Guild & { members: Member[] };

type Props = {
    guild: GuildWithMembers;
    cardWidth: number;  // 固定卡片寬度，由 TierSection 傳入
};

export default function GuildSection({ guild, cardWidth }: Props) {
    const { selectedIds, isMultiSelectMode, toggleSelect, addMember } = useMemberBoardStore();
    const [isAdding, setIsAdding] = useState(false);
    const [newMemberName, setNewMemberName] = useState('');

    const { setNodeRef, isOver } = useDroppable({
        id: `guild-${guild.id}`,
    });

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
            totalScore: 0,
            updatedAt: Date.now(),
        };

        addMember(newMember);
        
        setIsAdding(false);
        setNewMemberName('');
    };

    // ... (rest of the component)


    // 排序：leader > coleader > 其他人
    const sortedMembers = [...(guild.members || [])].sort((a, b) => {
        const getPriority = (role: string) => {
            if (role === 'leader') return 1;
            if (role === 'coleader') return 2;
            return 999;
        };

        const priA = getPriority(a.role);
        const priB = getPriority(b.role);

        if (priA !== priB) return priA - priB;
        return a.name.localeCompare(b.name);
    });

    // 公會總分小計
    const guildTotalScore = (guild.members || []).reduce((sum, m) => sum + (m.totalScore ?? 0), 0);

    return (
        <div
            ref={setNodeRef}
            className={`
        relative bg-gray-900 rounded-xl border overflow-hidden flex flex-col shadow-sm flex-shrink-0 transition-all duration-200
        ${isOver
                    ? 'border-4 border-indigo-500 bg-indigo-950/50 ring-2 ring-indigo-500/40 shadow-2xl scale-[1.03] animate-pulse'
                    : 'border-gray-700'}
      `}
            style={{ width: `${cardWidth + 20}px` }}
        >
            {/* 公會標題 + 總分小計 */}
            <div className="px-4 py-3 bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-700 flex justify-between items-center">
                <div>
                    <h3 className="text-base font-semibold text-gray-100 truncate">
                        {guild.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                        {guild.members.length} 人
                    </p>
                </div>

                <div className="text-base font-bold text-emerald-400">
                    {guildTotalScore}
                </div>
            </div>

            <SortableContext
                id={`guild-${guild.id}`}
                items={sortedMembers.map(m => m.id!)}
                strategy={verticalListSortingStrategy}
            >
                <div className="p-0.5 grid grid-cols-1 gap-0 bg-gray-950/60 min-h-[50px]">
                    {sortedMembers.map((member) => {
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
                            />
                        );
                    })}
                </div>
            </SortableContext>

            {/* 拖曳到此公會時的明顯提示 */}
            {isOver && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900/70 to-transparent pointer-events-none z-10">
                    <MoveRight size={72} className="text-indigo-300 animate-bounce mb-4" strokeWidth={2.5} />
                    <div className="text-indigo-200 text-lg font-bold tracking-wide drop-shadow-2xl px-6 py-3 bg-indigo-950/70 rounded-xl border-2 border-indigo-400/50 shadow-lg animate-pulse">
                        鬆開移動至此公會
                    </div>
                </div>
            )}

            {/* 新增成員按鈕 */}
            <div className="p-2 border-t border-gray-700 bg-gray-900">
                {isAdding ? (
                    <div className="flex gap-2">
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
                            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
                            autoFocus
                        />
                        <button
                            onClick={handleAddMember}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded text-xs"
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