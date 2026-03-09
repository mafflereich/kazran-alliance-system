// src/components/MemberBoard/MemberCard/MemberCard.tsx
import { useState, useEffect } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { Member } from '@entities/member/types';
import MemberCardContextMenu from './MemberCardContextMenu';
import { useMemberBoardStore } from '../store/useMemberBoardStore';

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
    const { initialMemberStates, localGuilds } = useMemberBoardStore();

    const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

    // ==================== 多選模式強制禁用 ====================

    const initialState = initialMemberStates[member.id!];
    const isMoved = initialState && initialState.guildId !== member.guildId;
    const isNew = initialState && initialState.guildId === 'new';
    const isPasted = initialState && initialState.guildId === 'pasted';

    const isHexColor = member.color?.startsWith('#');
    const baseBgClass = !isHexColor && member.color && COLOR_CLASSES[member.color]
        ? COLOR_CLASSES[member.color]
        : 'bg-gray-850 border-gray-700 hover:border-gray-500 hover:bg-gray-800/80';

    const customStyle = isHexColor ? {
        backgroundColor: `${member.color}40`,
        borderColor: `${member.color}80`,
    } : {};

    const originalGuild = isMoved && !isNew && !isPasted ? localGuilds.find(g => g.id === initialState.guildId) : null;


    return (
        <Tooltip.Provider delayDuration={200}>
            <div
                style={{
                    ...customStyle,
                    minHeight: '40px',
                    width: `${fixedWidth}px`,
                }}
                className={`
          relative flex flex-col justify-center px-2 py-1 rounded-md border text-[18px] transition-all duration-100 group overflow-hidden cursor-default m-0.5
          ${isLeader ? 'border-yellow-400 bg-gradient-to-r from-yellow-900/60 to-gray-900 shadow-[0_0_10px_rgba(250,204,21,0.3)]' : ''}
          ${isVice ? 'border-purple-400 bg-gradient-to-r from-purple-900/50 to-gray-900 shadow-[0_0_8px_rgba(192,132,252,0.3)]' : ''}
          ${isNew ? 'bg-emerald-900/40 border-emerald-500/50' : (isMoved || isPasted ? 'bg-amber-900/40 border-amber-500/50' : '')}
          ${isSelected
                        ? 'bg-indigo-950/70 border-indigo-500 ring-1 ring-indigo-400/50 shadow-md'
                        : (!isHexColor && !isMoved && !isNew && !isPasted ? baseBgClass : '')}
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
                <div className="flex items-center w-full">
                    {/* 名稱（靠左） */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex items-center gap-1">
                            <span className="font-medium text-gray-100 truncate leading-none relative z-10">
                                {member.name}
                            </span>
                            {isMoved && originalGuild && (
                                <span className="text-[18px] px-1 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 whitespace-nowrap">
                                    ← {originalGuild.name}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* 總分（靠右） */}
                    <div className={`text-[18px] font-medium transition-colors hover:text-emerald-300 text-emerald-400`}>
                        {member.totalScore ?? 0}
                    </div>
                </div>

                {/* 備註（名字下方） */}
                {member.note && (
                    <div className="mt-0.5 relative z-10">
                        <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                                <div className={`text-[18px] text-gray-400 truncate min-h-[12px] transition-colors select-none`}               >
                                    {member.note}
                                </div>
                            </Tooltip.Trigger>
                        </Tooltip.Root>
                    </div>
                )}

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