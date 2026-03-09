// src/features/member/components/MemberBoard/StagingArea.tsx
import { useDroppable, useDndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Inbox } from 'lucide-react';
import MemberCard from './MemberCard/MemberCard';
import { useMemberBoardStore } from './store/useMemberBoardStore';

export default function StagingArea() {
    const { stagingMembers, selectedIds, isMultiSelectMode, toggleSelect, moveSelectedMembers } = useMemberBoardStore();
    const { setNodeRef, isOver } = useDroppable({
        id: 'staging-area',
    });
    const { active } = useDndContext();
    const isDragging = active !== null;

    const handleStagingClick = (e: React.MouseEvent) => {
        if (isMultiSelectMode && selectedIds.size > 0) {
            e.preventDefault();
            e.stopPropagation();
            moveSelectedMembers('staging');
        }
    };

    return (
        <div
            ref={setNodeRef}
            onClick={handleStagingClick}
            className={`
                fixed top-24 left-8 w-64 bg-gray-900/90 backdrop-blur-md border-2 rounded-2xl shadow-2xl transition-all duration-300 z-[100]
                ${isOver ? 'border-indigo-500 scale-105 bg-indigo-950/40' : 'border-gray-700'}
                ${isMultiSelectMode && selectedIds.size > 0 ? 'cursor-pointer ring-2 ring-indigo-500' : 'cursor-default'}
                ${stagingMembers.length > 0 || isDragging ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-4 hover:opacity-100'}
            `}
        >
            <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-300">
                    <Inbox size={18} />
                    <span className="text-sm font-bold uppercase tracking-wider">暫存區 (Staging)</span>
                </div>
                <span className="bg-gray-800 text-gray-400 text-[10px] px-2 py-0.5 rounded-full border border-gray-700">
                    {stagingMembers.length}
                </span>
            </div>

            <div className="max-h-64 overflow-y-auto p-2 custom-scrollbar min-h-[60px]">
                {stagingMembers.length === 0 && !isOver && (
                    <div className="h-12 flex items-center justify-center text-gray-600 text-[10px] italic">
                        拖曳成員至此暫存
                    </div>
                )}
                
                <SortableContext
                    id="staging-area"
                    items={stagingMembers.map(m => m.id!)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="flex flex-col gap-1">
                        {stagingMembers.map((member) => (
                            <MemberCard
                                key={member.id}
                                member={member}
                                isSelected={selectedIds.has(member.id!)}
                                isMultiSelectMode={isMultiSelectMode}
                                onToggleSelect={() => toggleSelect(member.id!)}
                                fixedWidth={230}
                            />
                        ))}
                    </div>
                </SortableContext>
            </div>

            {isOver && (
                <div className="absolute inset-0 bg-indigo-600/20 rounded-2xl animate-pulse pointer-events-none border-2 border-indigo-400" />
            )}
        </div>
    );
}
