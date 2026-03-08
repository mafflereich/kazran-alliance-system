// src/components/MemberBoard/MemberCard/MemberCard.tsx
import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { Member } from '../types';
import MemberCardContextMenu from './MemberCardContextMenu';
import MemberScoreEditor from './MemberScoreEditor';

type Props = {
    member: Member;
    isSelected: boolean;
    isMultiSelectMode: boolean;
    onToggleSelect: () => void;
    isLeader?: boolean;
    isVice?: boolean;
    fixedWidth: number;
};

const COLOR_CLASSES: Record<string, string> = {
    red: 'bg-red-700 border-red-500 hover:bg-red-600 text-white',
    orange: 'bg-orange-700 border-orange-500 hover:bg-orange-600 text-white',
    yellow: 'bg-yellow-700 border-yellow-500 hover:bg-yellow-600 text-white',
    green: 'bg-green-700 border-green-500 hover:bg-green-600 text-white',
    blue: 'bg-blue-700 border-blue-500 hover:bg-blue-600 text-white',
    purple: 'bg-purple-700 border-purple-500 hover:bg-purple-600 text-white',
    pink: 'bg-pink-700 border-pink-500 hover:bg-pink-600 text-white',
};

export default function MemberCard({
    member,
    isSelected,
    isMultiSelectMode,
    onToggleSelect,
    isLeader = false,
    isVice = false,
    fixedWidth,
}: Props) {
    const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: member.id! });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const isHexColor = member.color?.startsWith('#');
    const baseBgClass = !isHexColor && member.color && COLOR_CLASSES[member.color]
        ? COLOR_CLASSES[member.color]
        : 'bg-gray-850 border-gray-700 hover:border-gray-500 hover:bg-gray-800/80';

    const customStyle = isHexColor ? {
        backgroundColor: `${member.color}40`, // 25% opacity
        borderColor: `${member.color}80`, // 50% opacity
    } : {};

    return (
        <Tooltip.Provider delayDuration={200}>
            <div
                ref={setNodeRef}
                style={{
                    ...style,
                    ...customStyle,
                    height: '32px',
                    width: `${fixedWidth}px`,
                }}
                className={`
          relative flex items-center px-2 rounded-md border text-[11px] transition-all duration-100 group overflow-hidden cursor-default
          ${isLeader ? 'border-yellow-400 bg-gradient-to-r from-yellow-900/60 to-gray-900 shadow-[0_0_10px_rgba(250,204,21,0.3)]' : ''}
          ${isVice ? 'border-purple-400 bg-gradient-to-r from-purple-900/50 to-gray-900 shadow-[0_0_8px_rgba(192,132,252,0.3)]' : ''}
          ${isSelected
                        ? 'bg-indigo-950/70 border-indigo-500 ring-1 ring-indigo-400/50 shadow-md'
                        : (!isHexColor ? baseBgClass : '')}
        `}
                onClick={(e) => {
                    if (isMultiSelectMode && !e.defaultPrevented) {
                        e.stopPropagation();
                        onToggleSelect();
                    }
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenuPosition({ x: e.clientX, y: e.clientY });
                }}
            >
                {/* 拖曳手柄 */}
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-indigo-400 mr-1.5 flex-shrink-0 relative z-10"
                >
                    <GripVertical size={14} />
                </div>

                {/* 名稱（靠左） */}
                <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                        <div className="flex-1 font-medium text-gray-100 truncate leading-none relative z-10">
                            {member.name}
                        </div>
                    </Tooltip.Trigger>
                    <Tooltip.Content
                        side="top"
                        align="start"
                        className="bg-gray-900/95 text-gray-100 text-xs px-3 py-1.5 rounded-md border border-gray-600 shadow-2xl backdrop-blur-sm z-[9999]"
                    >
                        {member.name}
                        <Tooltip.Arrow className="fill-gray-900/95" />
                    </Tooltip.Content>
                </Tooltip.Root>

                {/* 備註（置中） */}
                {member.note && (
                    <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                            <div className="text-[9px] text-gray-400 truncate mx-2 max-w-[80px] text-center relative z-10">
                                {member.note}
                            </div>
                        </Tooltip.Trigger>
                        <Tooltip.Content
                            side="top"
                            align="center"
                            className="bg-gray-900/95 text-gray-100 text-xs px-3 py-1.5 rounded-md border border-gray-600 shadow-2xl backdrop-blur-sm z-[9999] max-w-[300px]"
                        >
                            {member.note}
                            <Tooltip.Arrow className="fill-gray-900/95" />
                        </Tooltip.Content>
                    </Tooltip.Root>
                )}

                {/* 總分（靠右，可編輯） */}
                <MemberScoreEditor member={member} />

                {/* 右鍵選單 */}
                <MemberCardContextMenu 
                    member={member} 
                    contextMenuPosition={contextMenuPosition} 
                    onCloseContextMenu={() => setContextMenuPosition(null)} 
                />
            </div>
        </Tooltip.Provider>
    );
}