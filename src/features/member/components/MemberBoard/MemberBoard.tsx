// src/components/MemberBoard/MemberBoard.tsx
import { useEffect, useMemo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useMemberBoardStore } from './store/useMemberBoardStore';
import { buildTieredData } from './utils/dataUtils';
import TierSection from './TierSection';
import ZoomControls from './ZoomControls';
import NotificationModal from './NotificationModal';
import ArchiveModal from './ArchiveModal';
import type { Member, Guild, TieredData } from '@entities/member/types';
import StagingArea from './StagingArea';
import DeletionArea from './DeletionArea';
import ConnectionLines from './ConnectionLines';
import { RotateCcw, CheckSquare, Square } from 'lucide-react';

type Props = {
    initialMembers: Member[];
    initialGuilds: Guild[];
    onSave?: () => void;
};

export default function MemberBoard({ initialMembers, initialGuilds, onSave }: Props) {
    const {
        init,
        localMembers,
        localGuilds,
        saveToDatabase,
        isMultiSelectMode,
        setMultiSelectMode,
        selectedIds,
        clearSelection,
        batchDelete,
        pasteMembers,
        undo,
        redo,
        history,
        redoStack,
    } = useMemberBoardStore();

    useEffect(() => {
        init(initialMembers, initialGuilds);
    }, [initialMembers, initialGuilds, init]);

    const handleSave = async () => {
        await saveToDatabase();
        if (onSave) {
            onSave();
        }
    };

    const tieredData: TieredData[] = useMemo(() => buildTieredData(localMembers, initialGuilds), [localMembers, initialGuilds]);

    // ==================== 熱鍵 ====================
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Shift to toggle multi-select
            if (e.key === 'Shift') {
                setMultiSelectMode(!isMultiSelectMode);
            }

            // Undo / Redo
            if (e.ctrlKey) {
                if (e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    undo();
                } else if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    redo();
                }
            }

            if (!isMultiSelectMode || !e.ctrlKey) return;

            const selected = Array.from(selectedIds);

            if (e.key.toLowerCase() === 'c') {
                e.preventDefault();
                const copied = localMembers.filter(m => selected.includes(m.id!));
                navigator.clipboard.writeText(JSON.stringify(copied));
            } else if (e.key.toLowerCase() === 'x') {
                e.preventDefault();
                const copied = localMembers.filter(m => selected.includes(m.id!));
                navigator.clipboard.writeText(JSON.stringify(copied));
                batchDelete();
                clearSelection();
            } else if (e.key.toLowerCase() === 'v') {
                e.preventDefault();
                navigator.clipboard.readText().then(text => {
                    try {
                        const pasted: Member[] = JSON.parse(text);
                        if (pasted.length === 0) return;

                        const guildNames = localGuilds.map(g => g.name).join('\n');
                        const choice = prompt(
                            `請選擇要貼上的公會名稱（輸入名稱）:\n\n${guildNames}`,
                            localGuilds[0]?.name || ''
                        );

                        if (!choice) return;

                        const targetGuild = localGuilds.find(g => g.name === choice);
                        if (!targetGuild?.id) {
                            alert('找不到該公會');
                            return;
                        }

                        const newMembers = pasted.map(m => ({
                            ...m,
                            id: crypto.randomUUID(),
                            guildId: targetGuild.id!,
                            updatedAt: Date.now(),
                        }));

                        pasteMembers(newMembers);
                    } catch (err) {
                        console.error('貼上失敗', err);
                    }
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isMultiSelectMode, selectedIds, localMembers, localGuilds, batchDelete, clearSelection, pasteMembers, undo, redo]);

    // ==================== 拖曳 ====================

    useEffect(() => {
        const handleGlobalPointerDown = (e: PointerEvent) => {
            if (e.target instanceof HTMLElement && e.target.tagName !== 'INPUT') {
                if (document.activeElement instanceof HTMLInputElement) {
                    document.activeElement.blur();
                }
            }

            // Clear selection on background click
            if (selectedIds.size > 0) {
                const target = e.target as HTMLElement;
                const isInteractive = target.closest(
                    '.member-card, .guild-section, .staging-area, .deletion-area, .batch-action-bar, .top-controls, button, [role="button"], [data-radix-popper-content-wrapper], .radix-popover-content, [data-radix-popover-content], .radix-dropdown-menu, [data-radix-dropdown-menu]'
                );
                if (!isInteractive) {
                    clearSelection();
                }
            }
        };
        window.addEventListener('pointerdown', handleGlobalPointerDown, { capture: true });
        return () => window.removeEventListener('pointerdown', handleGlobalPointerDown, { capture: true });
    }, [selectedIds, clearSelection]);



    return (
        <div className="flex-1 relative w-full overflow-hidden bg-gray-950 text-gray-100">
            {/* 頂部控制列 */}
            <div className="top-controls absolute top-3 right-3 z-50 flex items-center gap-2">
                <button
                    onClick={undo}
                    disabled={history.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${history.length > 0
                        ? 'bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-600'
                        : 'bg-gray-900 text-gray-600 border border-gray-800 cursor-not-allowed opacity-50'
                        }`}
                >
                    <RotateCcw size={14} />
                    <span>Undo</span>
                </button>
                <button
                    onClick={redo}
                    disabled={redoStack.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${redoStack.length > 0
                        ? 'bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-600'
                        : 'bg-gray-900 text-gray-600 border border-gray-800 cursor-not-allowed opacity-50'
                        }`}
                >
                    <RotateCcw size={14} className="scale-x-[-1]" />
                    <span>Redo</span>
                </button>
                <button
                    onClick={() => setMultiSelectMode(!isMultiSelectMode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${isMultiSelectMode
                        ? 'bg-indigo-700 text-white border-indigo-500'
                        : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
                        }`}
                >
                    {isMultiSelectMode ? <CheckSquare size={14} /> : <Square size={14} />}
                    <span>多選模式</span>
                    {selectedIds.size > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 bg-indigo-600 text-white text-xs rounded">
                            {selectedIds.size}
                        </span>
                    )}
                </button>
                <button
                    onClick={handleSave}
                    className="px-5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium shadow transition"
                >
                    上傳變更
                </button>
            </div>
            <TransformWrapper
                initialScale={0.6}
                minScale={0.2}
                maxScale={1.5}
                wheel={{ step: 0.1 }}
                pinch={{ disabled: false }}
                doubleClick={{ disabled: true }}
                limitToBounds={false}
                centerOnInit={false}
            >
                <TransformComponent wrapperStyle={{ width: '300%', height: '100%' }}>
                    <div className="min-h-[180vh] pb-[1200px] p-4 relative">
                        <ConnectionLines />
                        <div className="w-full grid grid-cols-2 gap-4 relative z-10">
                            {tieredData.map(({ tier, guilds }) => (
                                <TierSection key={tier} tier={tier} guilds={guilds} />
                            ))}
                        </div>
                    </div>
                </TransformComponent>

                <ZoomControls />
            </TransformWrapper>

            <StagingArea />
            <DeletionArea />

            <NotificationModal />
            <ArchiveModal />
        </div>
    );
}
