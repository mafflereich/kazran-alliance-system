import { useState, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Copy, Trash2, MoveHorizontal, Palette, ArrowLeft, Lock, Unlock, Crown, Shield, User } from 'lucide-react';
import { useMemberBoardStore } from '../store/useMemberBoardStore';
import type { Guild, Member } from '@entities/member/types';

type Props = {
    member: Member;
    contextMenuPosition?: { x: number; y: number } | null;
    onCloseContextMenu?: () => void;
    originalGuild?: Guild;
    isInDeletionArea?: boolean;
};

const COLORS = [
    { id: 'default', bg: 'bg-gray-850', buttonBg: 'bg-gray-700', border: 'border-gray-700', buttonBorder: 'border-gray-500', hover: 'hover:bg-gray-800/80', name: '預設' },
    { id: 'red', bg: 'bg-red-700', buttonBg: 'bg-red-700', border: 'border-red-500', buttonBorder: 'border-red-500', hover: 'hover:bg-red-600', name: '紅色' },
    { id: 'orange', bg: 'bg-orange-700', buttonBg: 'bg-orange-700', border: 'border-orange-500', buttonBorder: 'border-orange-500', hover: 'hover:bg-orange-600', name: '橘色' },
    { id: 'yellow', bg: 'bg-yellow-700', buttonBg: 'bg-yellow-700', border: 'border-yellow-500', buttonBorder: 'border-yellow-500', hover: 'hover:bg-yellow-600', name: '黃色' },
    { id: 'green', bg: 'bg-green-700', buttonBg: 'bg-green-700', border: 'border-green-500', buttonBorder: 'border-green-500', hover: 'hover:bg-green-600', name: '綠色' },
    { id: 'blue', bg: 'bg-blue-700', buttonBg: 'bg-blue-700', border: 'border-blue-500', buttonBorder: 'border-blue-500', hover: 'hover:bg-blue-600', name: '藍色' },
    { id: 'purple', bg: 'bg-purple-700', buttonBg: 'bg-purple-700', border: 'border-purple-500', buttonBorder: 'border-purple-500', hover: 'hover:bg-purple-600', name: '紫色' },
    { id: 'pink', bg: 'bg-pink-700', buttonBg: 'bg-pink-700', border: 'border-pink-500', buttonBorder: 'border-pink-500', hover: 'hover:bg-pink-600', name: '粉色' },
];

export default function MemberCardContextMenu({ member, contextMenuPosition, onCloseContextMenu, originalGuild, isInDeletionArea }: Props) {
    const { 
        stagingMembers, 
        localGuilds, 
        selectedIds, 
        isMultiSelectMode,
        batchUpdateColor,
        batchUpdateRole,
        batchMoveToStaging,
        batchToggleReserved,
        batchDelete,
        batchDuplicate,
        batchMoveToGuild,
        batchReturnToOriginalGuild,
        setSelectedIds
    } = useMemberBoardStore();
    const [showContextMenu, setShowContextMenu] = useState(false);
    const [showGuildMenu, setShowGuildMenu] = useState(false);
    const [showColorMenu, setShowColorMenu] = useState(false);
    const [showRoleMenu, setShowRoleMenu] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (contextMenuPosition) {
            const menuHeight = 400;
            let { x, y } = contextMenuPosition;
            
            if (y + menuHeight > window.innerHeight) {
                y = window.innerHeight - menuHeight - 10;
            }
            
            if (y < 0) y = 0;

            setMenuPosition({ x, y });
            setShowContextMenu(true);
            setShowGuildMenu(false);
            setShowColorMenu(false);
            setShowRoleMenu(false);
            
            // Set selectedIds to this member for batch operations
            if (!isMultiSelectMode) {
                setSelectedIds(new Set([member.id!]));
            }
        }
    }, [contextMenuPosition, member.id, isMultiSelectMode, setSelectedIds]);

    const handleOpenChange = (open: boolean) => {
        setShowContextMenu(open);
        if (!open) {
            if (!isMultiSelectMode) {
                setSelectedIds(new Set());
            }
            if (onCloseContextMenu) {
                onCloseContextMenu();
            }
        }
    };

    // 輔助函數：確保 selectedIds 正確設定後再執行 action
    const withSelectedId = (action: () => void) => {
        if (!isMultiSelectMode && selectedIds.size === 0) {
            setSelectedIds(new Set([member.id!]));
        }
        action();
    };

    const isReserved = member.isReserved;

    return (
        <>
            <Popover.Root open={showContextMenu} onOpenChange={handleOpenChange}>
                <Popover.Portal>
                    <Popover.Content
                        onPointerDown={(e) => e.stopPropagation()}
                        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 z-[10000] min-w-[160px] max-h-[400px] overflow-y-auto"
                        sideOffset={5}
                        align="start"
                        style={{
                            position: 'fixed',
                            top: `${menuPosition.y}px`,
                            left: `${menuPosition.x}px`,
                        }}
                    >
                        <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-700 mb-1 truncate">
                            {isMultiSelectMode && selectedIds.size > 0 
                                ? `已選 ${selectedIds.size} 位成員`
                                : member.name
                            }
                        </div>

                        <button
                            onClick={() => {
                                batchToggleReserved();
                                setShowContextMenu(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-800 flex items-center gap-2 cursor-pointer ${isReserved ? 'text-yellow-400' : 'text-gray-200'}`}
                        >
                            {isReserved ? <Unlock size={14} /> : <Lock size={14} />}
                            {isReserved ? '移除保留席' : '設為保留席'}
                        </button>

                        <button
                            disabled={isReserved}
                            onClick={() => { 
                                withSelectedId(() => {
                                    setShowRoleMenu(!showRoleMenu); setShowGuildMenu(false); setShowColorMenu(false); 
                                });
                            }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isReserved ? 'text-gray-600 cursor-not-allowed' : 'hover:bg-gray-800 text-gray-200 cursor-pointer'}`}
                        >
                            <Crown size={14} /> 切換身分
                        </button>

                        <div className="h-px bg-gray-700 my-1" />

                        <button
                            disabled={isReserved}
                            onClick={() => { 
                                withSelectedId(() => {
                                    setShowColorMenu(!showColorMenu); setShowGuildMenu(false); setShowRoleMenu(false); 
                                });
                            }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isReserved ? 'text-gray-600 cursor-not-allowed' : 'hover:bg-gray-800 text-gray-200 cursor-pointer'}`}
                        >
                            <Palette size={14} /> 標記顏色
                        </button>
                        <button
                            disabled={isReserved}
                            onClick={() => { 
                                batchDuplicate();
                                setShowContextMenu(false); 
                            }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isReserved ? 'text-gray-600 cursor-not-allowed' : 'hover:bg-gray-800 text-gray-200 cursor-pointer'}`}
                        >
                            <Copy size={14} /> 複製
                        </button>
                        <button
                            disabled={isReserved}
                            onClick={() => { 
                                withSelectedId(() => {
                                    setShowGuildMenu(!showGuildMenu); setShowColorMenu(false); setShowRoleMenu(false); 
                                });
                            }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isReserved ? 'text-gray-600 cursor-not-allowed' : 'hover:bg-indigo-900/50 text-indigo-300 cursor-pointer'}`}
                        >
                            <MoveHorizontal size={14} /> 移動到其他公會
                        </button>
                        {stagingMembers.every((stagingMember) => stagingMember.id != member.id) && <button
                            disabled={isReserved}
                            onClick={() => { 
                                batchMoveToStaging();
                                setShowContextMenu(false); 
                            }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isReserved ? 'text-gray-600 cursor-not-allowed' : 'hover:bg-indigo-900/50 text-indigo-300 cursor-pointer'}`}
                        >
                            <MoveHorizontal size={14} /> 加入暫存區
                        </button>}

                        {originalGuild && (isInDeletionArea || member.guildId !== originalGuild.id) && (
                            <button
                                disabled={isReserved}
                                onClick={() => {
                                    batchReturnToOriginalGuild();
                                    handleOpenChange(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isReserved ? 'text-gray-600 cursor-not-allowed' : 'hover:bg-indigo-900/50 text-indigo-300 cursor-pointer'}`}
                            >
                                <ArrowLeft className="w-4 h-4" />
                                把成員送回原公會
                            </button>
                        )}

                        {!isInDeletionArea && (
                            <button
                                disabled={isReserved}
                                onClick={() => { 
                                    batchDelete();
                                    setShowContextMenu(false); 
                                }}
                                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isReserved ? 'text-gray-600 cursor-not-allowed' : 'hover:bg-red-900/50 text-red-300 cursor-pointer'}`}
                            >
                                <Trash2 size={14} /> 刪除
                            </button>
                        )}


                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>

            {/* 公會子選單 */}
            <Popover.Root open={showGuildMenu} onOpenChange={setShowGuildMenu}>
                <Popover.Portal>
                    <Popover.Content
                        onPointerDown={(e) => e.stopPropagation()}
                        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 z-[10001] min-w-[200px] max-h-64 overflow-y-auto"
                        side="right"
                        align="start"
                        sideOffset={5}
                        style={{
                            position: 'fixed',
                            top: `${menuPosition.y}px`,
                            left: `${menuPosition.x + 160}px`,
                        }}
                    >
                        {localGuilds
                            .filter(g => g.id !== member.guildId)
                            .sort((a, b) => {
                                const tierA = a.tier ?? 999;
                                const tierB = b.tier ?? 999;
                                if (tierA !== tierB) return tierA - tierB;

                                const orderA = a.orderNum ?? 999;
                                const orderB = b.orderNum ?? 999;
                                return orderA - orderB;
                            })
                            .map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => {
                                        withSelectedId(() => {
                                            batchMoveToGuild(g.id!);
                                            setShowGuildMenu(false);
                                            setShowContextMenu(false);
                                        });
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-indigo-900/50 text-gray-200 cursor-pointer"
                                >
                                    {g.name}
                                </button>
                            ))}
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>

            {/* 顏色子選單 */}
            <Popover.Root open={showColorMenu} onOpenChange={setShowColorMenu}>
                <Popover.Portal>
                    <Popover.Content
                        onPointerDown={(e) => e.stopPropagation()}
                        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-2 px-2 z-[10001] w-[140px] grid grid-cols-4 gap-1"
                        side="right"
                        align="start"
                        sideOffset={5}
                        style={{
                            position: 'fixed',
                            top: `${menuPosition.y}px`,
                            left: `${menuPosition.x + 160}px`,
                        }}
                    >
                        {COLORS.map(color => (
                            <button
                                key={color.id}
                                onClick={() => {
                                    withSelectedId(() => {
                                        batchUpdateColor(color.id === 'default' ? undefined : color.id);
                                        setShowColorMenu(false);
                                        setShowContextMenu(false);
                                    });
                                }}
                                title={color.name}
                                className={`w-6 h-6 rounded-full border ${color.buttonBg} ${color.buttonBorder} hover:scale-110 transition-transform`}
                            />
                        ))}
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>

            {/* 身分子選單 */}
            <Popover.Root open={showRoleMenu} onOpenChange={setShowRoleMenu}>
                <Popover.Portal>
                    <Popover.Content
                        onPointerDown={(e) => e.stopPropagation()}
                        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 z-[10001] min-w-[120px]"
                        side="right"
                        align="start"
                        sideOffset={5}
                        style={{
                            position: 'fixed',
                            top: `${menuPosition.y}px`,
                            left: `${menuPosition.x + 160}px`,
                        }}
                    >
                        <button
                            onClick={() => {
                                withSelectedId(() => {
                                    batchUpdateRole('leader');
                                    setShowRoleMenu(false);
                                    setShowContextMenu(false);
                                });
                            }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${member.role === 'leader' ? 'text-yellow-400' : 'text-gray-200 hover:bg-gray-800'}`}
                        >
                            <Crown size={14} /> 會長
                        </button>
                        <button
                            onClick={() => {
                                withSelectedId(() => {
                                    batchUpdateRole('coleader');
                                    setShowRoleMenu(false);
                                    setShowContextMenu(false);
                                });
                            }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${member.role === 'coleader' ? 'text-purple-400' : 'text-gray-200 hover:bg-gray-800'}`}
                        >
                            <Shield size={14} /> 副會長
                        </button>
                        <button
                            onClick={() => {
                                withSelectedId(() => {
                                    batchUpdateRole('member');
                                    setShowRoleMenu(false);
                                    setShowContextMenu(false);
                                });
                            }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${member.role === 'member' ? 'text-gray-400' : 'text-gray-200 hover:bg-gray-800'}`}
                        >
                            <User size={14} /> 成員
                        </button>
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>

        </>
    );
}
