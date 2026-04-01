// src/features/member/components/MemberBoard/StagingArea.tsx
import { Inbox } from 'lucide-react';
import MemberCard from './MemberCard/MemberCard';
import { useMemberBoardStore } from './store/useMemberBoardStore';

export default function StagingArea() {
    const { stagingMembers, selectedIds, isMultiSelectMode, toggleSelect, moveSelectedMembers } = useMemberBoardStore();

    const handleStagingClick = (e: React.MouseEvent) => {
        if (isMultiSelectMode && selectedIds.size > 0) {
            e.preventDefault();
            e.stopPropagation();
            moveSelectedMembers('staging');
        }
    };

    const getDynamicHeight = () => {
        const base = 50; // header
        const cardHeight = 60; // Smaller MemberCard height + gap
        const calculated = base + stagingMembers.length * cardHeight + 10;
        // Limit to 80% of viewport height to avoid going off-screen
        return Math.min(window.innerHeight * 0.8, Math.max(100, calculated));
    };

    return (
        <div
            onClick={handleStagingClick}
            className={`
                staging-area fixed top-24 left-8 w-40 bg-gray-900/90 backdrop-blur-md border-2 rounded-2xl shadow-2xl transition-all duration-300 z-[100] flex flex-col select-none
                
                ${isMultiSelectMode && selectedIds.size > 0 ? 'cursor-pointer ring-2 ring-indigo-500' : 'cursor-default'}
                ${stagingMembers.length > 0 ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-4 hover:opacity-100'}
            `}
            style={{
                maxHeight: '100vh',
                height: 'auto',
                minHeight: stagingMembers.length > 0 ? '100px' : '60px',
            }}
        >
            <div className="p-2 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-300">
                    <Inbox size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">暫存區</span>
                </div>
                <span className="bg-gray-800 text-gray-400 text-[10px] px-1.5 py-0.5 rounded-full border border-gray-700">
                    {stagingMembers.length}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-[60px]">
                {stagingMembers.length === 0 && (
                    <div className="h-12 flex items-center justify-center text-gray-600 text-[10px] italic">
                        移動成員至此暫存
                    </div>
                )}
                <div className="flex flex-col gap-1">
                    {stagingMembers.map((member) => (
                        <MemberCard
                            key={member.id}
                            member={member}
                            isSelected={selectedIds.has(member.id!)}
                            isMultiSelectMode={isMultiSelectMode}
                            onToggleSelect={() => toggleSelect(member.id!)}
                            fixedWidth={150}
                        />
                    ))}
                </div>

            </div>
        </div>
    );
}
