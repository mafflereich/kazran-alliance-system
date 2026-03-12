// src/components/MemberBoard/MemberCard/MemberCard.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { TooltipProvider } from "@radix-ui/react-tooltip";
import type { Member, Guild } from '@entities/member/types';
import MemberCardContextMenu from './MemberCardContextMenu';
import { useMemberBoardStore } from '../store/useMemberBoardStore';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/shared/ui/Tooltip";

type Props = {
    member: Member;
    isSelected: boolean;
    isMultiSelectMode: boolean;
    onToggleSelect: () => void;
    isLeader?: boolean;
    isVice?: boolean;
    fixedWidth: number;
    index?: number;
    originalGuild?: Guild;
    isInDeletionArea?: boolean;
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
    index = 0,
    originalGuild,
    isInDeletionArea = false,
}: Props) {

    const { initialMemberStates, localGuilds } = useMemberBoardStore();

    const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const nameRef = useRef<HTMLDivElement>(null);
    const [isNameTruncated, setIsNameTruncated] = useState(false);

    const noteRef = useRef<HTMLDivElement>(null);
    const [isNoteTruncated, setIsNoteTruncated] = useState(false);

    // ==================== 多選模式強制禁用 ====================

    const initialState = initialMemberStates[member.id!];
    const isMoved = initialState && initialState.guildId !== member.guildId;
    const isNew = initialState && initialState.guildId === 'new';
    const isPasted = initialState && initialState.guildId === 'pasted';

    const isOverCapacity = index >= 30;

    const isHexColor = member.color?.startsWith('#');
    const baseBgClass = !isHexColor && member.color && COLOR_CLASSES[member.color]
        ? COLOR_CLASSES[member.color]
        : 'bg-gray-850 border-gray-700 hover:border-gray-500 hover:bg-gray-800/80';

    const customStyle = isHexColor ? {
        backgroundColor: `${member.color}40`,
        borderColor: `${member.color}80`,
    } : {};

    // Calculate originalGuild if not provided via prop
    const calculatedOriginalGuild = useMemo(() => {
        if (!isMoved || isNew || isPasted || !initialState) return null;
        return localGuilds.find(g => g.id === initialState.guildId) || null;
    }, [isMoved, isNew, isPasted, localGuilds, initialState]);

    // Use prop if provided, otherwise use calculated value
    const finalOriginalGuild = originalGuild || calculatedOriginalGuild;

    useEffect(() => {
        if (!nameRef.current) return;

        const checkTruncation = () => {
            if (nameRef.current) {
                const { scrollWidth, clientWidth } = nameRef.current;
                setIsNameTruncated(scrollWidth > clientWidth + 1);
            }
        };

        checkTruncation();

        const observer = new ResizeObserver(() => {
            checkTruncation();
        });

        // 觀察 ref 元素本身
        observer.observe(nameRef.current);

        // 也可以觀察整個卡片（如果寬度變化來自父層）
        // observer.observe(nameRef.current.parentElement!);

        return () => {
            observer.disconnect();
        };
    }, [member.name, originalGuild?.name, fixedWidth]);


    useEffect(() => {
        if (!noteRef.current) return;

        const checkTruncation = () => {
            if (noteRef.current) {
                const { scrollHeight, clientHeight } = noteRef.current;
                setIsNoteTruncated(scrollHeight > clientHeight + 1);
            }
        };

        checkTruncation();

        const observer = new ResizeObserver(() => {
            checkTruncation();
        });

        // 觀察 ref 元素本身
        observer.observe(noteRef.current);

        return () => {
            observer.disconnect();
        };
    }, [member.note, member.seasonNote]);

    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip open={member.isReserved ? undefined : false}>
                <TooltipTrigger asChild>
                    <div
                        id={`member-${member.id}`}
                        style={{
                            ...customStyle,
                            minHeight: '40px',
                            width: `${fixedWidth}px`,
                        }}
                        className={`
          member-card
          relative flex flex-col justify-center px-2 py-1 rounded-md border text-[18px] transition-all duration-100 group overflow-hidden m-0.5 select-none
          ${member.isReserved ? 'cursor-not-allowed opacity-60 grayscale-[0.5]' : 'cursor-default'}
          ${isLeader && !isSelected ? 'border-yellow-400 bg-yellow-900/60' : ''}
          ${isVice && !isSelected ? 'border-purple-400 bg-purple-900/50' : ''}
          ${isOverCapacity && !isSelected ? 'bg-red-600 border-red-400 text-white' : ''}
          ${isNew && !isSelected && !isOverCapacity ? 'bg-emerald-900/40 border-emerald-500/50' : ((isMoved || isPasted) && !isSelected && !isOverCapacity ? 'bg-amber-900/40 border-amber-500/50' : '')}
          ${isSelected
                                ? 'bg-indigo-800/70 border-indigo-500 ring-1 ring-indigo-400/50 shadow-md'
                                : (!isHexColor && !isMoved && !isNew && !isPasted ? baseBgClass : '')}
        `}
                        onClick={(e) => {
                            if (member.isReserved) return;
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
                        {member.isReserved && (
                            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                                <div className="text-yellow-400 bg-black/60 backdrop-blur-[1px] px-2 py-0.5 rounded border border-yellow-500/50 text-[10px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                                    Reserved
                                </div>
                            </div>
                        )}
                        <div className="flex items-start justify-between gap-3">  {/* 主容器改 justify-between */}

                            {/* 左邊：名字 */}
                            <div className="min-w-0 flex-1">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex min-w-0">
                                            {/* 名字可截斷 */}
                                            <div ref={nameRef} className="truncate text-[18px] w-full">
                                                {member.name}
                                            </div>
                                        </div>
                                    </TooltipTrigger>
                                    {isNameTruncated && <TooltipContent
                                        side="top"
                                        align="end"
                                        sideOffset={4}
                                        alignOffset={-10}
                                        collisionBoundary={document.body}  // 可選：限制碰撞邊界
                                    >{member.name}
                                    </TooltipContent>}
                                </Tooltip>
                            </div>

                            {/* 右邊：總分 */}
                            <div className="flex-shrink-0 text-right">
                                <div className="text-[18px] font-medium transition-colors hover:text-emerald-300 text-emerald-400">
                                    {member.score ?? 0}
                                </div>
                            </div>

                        </div>

                        {isMoved && finalOriginalGuild && (
                            <span className="max-w-[120px] truncate text-[18px] px-1 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 whitespace-nowrap inline-block">
                                ↑ {finalOriginalGuild.name}
                            </span>
                        )}

                        {/* 備註（名字下方） */}
                        {(member.note || member.seasonNote) && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div ref={noteRef} className="mt-1 text-xs text-gray-400 line-clamp-2 cursor-default select-none">
                                        {member.seasonNote && <span className="text-blue-400 mr-1">[{member.seasonNote}]</span>}
                                        {member.note}
                                    </div>
                                </TooltipTrigger>
                                {isNoteTruncated && <TooltipContent
                                    side="top"
                                    align="end"
                                    sideOffset={4}
                                    alignOffset={-10}
                                    collisionBoundary={document.body}  // 可選：限制碰撞邊界
                                >
                                    <p className="whitespace-pre-wrap">
                                        {member.seasonNote && <span className="text-blue-400">[{member.seasonNote}]</span>} {member.note}
                                    </p>
                                </TooltipContent>}
                            </Tooltip>
                        )}

                        {/* 右鍵選單 */}
                        <MemberCardContextMenu
                            member={member}
                            contextMenuPosition={contextMenuPosition}
                            onCloseContextMenu={() => setContextMenuPosition(null)}
                            originalGuild={finalOriginalGuild}
                            isInDeletionArea={isInDeletionArea}
                        />
                    </div>
                </TooltipTrigger>
            </Tooltip>
        </TooltipProvider>
    );
}