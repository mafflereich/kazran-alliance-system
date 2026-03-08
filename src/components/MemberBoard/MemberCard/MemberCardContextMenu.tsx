import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as Popover from '@radix-ui/react-popover';
import { Pencil, Copy, Trash2, MoveHorizontal, Palette } from 'lucide-react';
import { useMemberBoardStore } from '../store/useMemberBoardStore';
import type { Member } from '../types';
import MemberNoteModal from './MemberNoteModal';

type Props = {
    member: Member;
    contextMenuPosition?: { x: number; y: number } | null;
    onCloseContextMenu?: () => void;
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

export default function MemberCardContextMenu({ member, contextMenuPosition, onCloseContextMenu }: Props) {
    const { duplicateMember, deleteMember, moveMember, localGuilds, updateMember } = useMemberBoardStore();
    const [showContextMenu, setShowContextMenu] = useState(false);
    const [showGuildMenu, setShowGuildMenu] = useState(false);
    const [showColorMenu, setShowColorMenu] = useState(false);
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (contextMenuPosition) {
            setMenuPosition(contextMenuPosition);
            setShowContextMenu(true);
            setShowGuildMenu(false);
            setShowColorMenu(false);
        }
    }, [contextMenuPosition]);

    const handleOpenChange = (open: boolean) => {
        setShowContextMenu(open);
        if (!open && onCloseContextMenu) {
            onCloseContextMenu();
        }
    };

    return (
        <>
            <Popover.Root open={showContextMenu} onOpenChange={handleOpenChange}>
                <Popover.Portal>
                    <Popover.Content
                        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 z-[10000] min-w-[160px]"
                        sideOffset={5}
                        align="start"
                        style={{
                            position: 'fixed',
                            top: `${menuPosition.y}px`,
                            left: `${menuPosition.x}px`,
                        }}
                    >
                        <button
                            onClick={() => { setShowNoteModal(true); setShowContextMenu(false); }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-800 text-gray-200 flex items-center gap-2 cursor-pointer"
                        >
                            <Pencil size={14} /> 編輯備註
                        </button>
                        <button
                            onClick={() => { setShowColorMenu(!showColorMenu); setShowGuildMenu(false); }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-800 text-gray-200 flex items-center gap-2 cursor-pointer"
                        >
                            <Palette size={14} /> 標記顏色
                        </button>
                        <button
                            onClick={() => { duplicateMember(member.id!); setShowContextMenu(false); }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-800 text-gray-200 flex items-center gap-2 cursor-pointer"
                        >
                            <Copy size={14} /> 複製
                        </button>
                        <button
                            onClick={() => { deleteMember(member.id!); setShowContextMenu(false); }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-red-900/50 text-red-300 flex items-center gap-2 cursor-pointer"
                        >
                            <Trash2 size={14} /> 刪除
                        </button>
                        <button
                            onClick={() => { setShowGuildMenu(!showGuildMenu); setShowColorMenu(false); }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-indigo-900/50 text-indigo-300 flex items-center gap-2 cursor-pointer"
                        >
                            <MoveHorizontal size={14} /> 移動到其他公會
                        </button>
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>

            {/* 公會子選單 */}
            <Popover.Root open={showGuildMenu} onOpenChange={setShowGuildMenu}>
                <Popover.Portal>
                    <Popover.Content
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
                                        moveMember(member.id!, g.id!);
                                        setShowGuildMenu(false);
                                        setShowContextMenu(false);
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
                                    updateMember(member.id!, { color: color.id === 'default' ? undefined : color.id });
                                    setShowColorMenu(false);
                                    setShowContextMenu(false);
                                }}
                                title={color.name}
                                className={`w-6 h-6 rounded-full border ${color.buttonBg} ${color.buttonBorder} hover:scale-110 transition-transform`}
                            />
                        ))}
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>

            {/* 備註編輯 Modal */}
            {showNoteModal && createPortal(
                <MemberNoteModal
                    memberName={member.name}
                    initialNote={member.note || ''}
                    onSave={(note) => {
                        updateMember(member.id!, { note });
                        setShowNoteModal(false);
                    }}
                    onCancel={() => setShowNoteModal(false)}
                />,
                document.body
            )}
        </>
    );
}
