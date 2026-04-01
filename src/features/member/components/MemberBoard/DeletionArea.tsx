// src/features/member/components/MemberBoard/DeletionArea.tsx
import { Trash2 } from 'lucide-react';
import MemberCard from './MemberCard/MemberCard';
import { useMemberBoardStore } from './store/useMemberBoardStore';

export default function DeletionArea() {
    const { deletedMembers, selectedIds, isMultiSelectMode, toggleSelect, localGuilds, initialMemberStates } = useMemberBoardStore();

    if (deletedMembers.length === 0) return null;

    const getDynamicHeight = () => {
        const base = 50; // header
        const cardHeight = 60; // Smaller MemberCard height + gap
        const calculated = base + deletedMembers.length * cardHeight + 10;
        return Math.min(window.innerHeight * 0.6, Math.max(100, calculated));
    };

    return (
        <div
            className="deletion-area fixed bottom-8 right-8 w-40 bg-red-950/80 backdrop-blur-md border-2 border-red-900/50 rounded-2xl shadow-2xl transition-all duration-300 z-[100] flex flex-col overflow-hidden select-none"
            style={{
                maxHeight: '60vh',
                height: 'auto',
            }}
        >
            <div className="p-2 border-b border-red-900/50 flex items-center justify-between bg-red-900/20">
                <div className="flex items-center gap-2 text-red-300">
                    <Trash2 size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">刪除區</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="bg-red-900/40 text-red-200 text-[10px] px-1.5 py-0.5 rounded-full border border-red-800/50">
                        {deletedMembers.length}
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 custom-scrollbar">
                <div className="flex flex-col gap-1">
                    {deletedMembers.map((member) => {
                        const initialState = initialMemberStates[member.id!];
                        const originalGuild = initialState ? localGuilds.find(g => g.id === initialState.guildId) : null;

                        return (
                            <MemberCard
                                key={member.id}
                                member={member}
                                isSelected={selectedIds.has(member.id!)}
                                isMultiSelectMode={isMultiSelectMode}
                                onToggleSelect={() => toggleSelect(member.id!)}
                                fixedWidth={150}
                                originalGuild={originalGuild}
                                isInDeletionArea={true}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
