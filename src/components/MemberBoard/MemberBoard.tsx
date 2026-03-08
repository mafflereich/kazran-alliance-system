// src/components/MemberBoard/MemberBoard.tsx
import { useEffect, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { DndContext, closestCorners, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useMemberBoardStore } from './store/useMemberBoardStore';
import { buildTieredData } from './utils/dataUtils';
import TierSection from './TierSection';
import BatchActionBar from './BatchActionBar';
import ZoomControls from './ZoomControls';
import NotificationModal from './NotificationModal';
import type { Member, Guild, TieredData } from './types';

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
        deleteMember,
        pasteMembers,
        moveMember,
    } = useMemberBoardStore();

    const [disablePan, setDisablePan] = useState(false);

    useEffect(() => {
        init(initialMembers, initialGuilds);
    }, [initialMembers, initialGuilds, init]);

    const handleSave = async () => {
        await saveToDatabase();
        if (onSave) {
            onSave();
        }
    };

    const tieredData: TieredData[] = buildTieredData(localMembers, initialGuilds);

    // ==================== 熱鍵 ====================
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
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
                selected.forEach(id => deleteMember(id));
                clearSelection();
            } else if (e.key.toLowerCase() === 'v') {
                e.preventDefault();
                navigator.clipboard.readText().then(text => {
                    try {
                        const pasted: Member[] = JSON.parse(text);
                        if (pasted.length === 0) return;

                        // 彈出選擇公會的選單（這裡用簡單的 prompt 示範，你可以改成 modal）
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
                        console.log(`已暫存 ${newMembers.length} 位成員到公會 ${targetGuild.name}`);
                    } catch (err) {
                        console.error('貼上失敗', err);
                    }
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isMultiSelectMode, selectedIds, localMembers, localGuilds, deleteMember, clearSelection, pasteMembers]);

    // ==================== 拖曳 ====================
    const handleDragStart = () => setDisablePan(true);

    const handleDragEnd = (event: DragEndEvent) => {
        setDisablePan(false);
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        if (overId.startsWith('guild-')) {
            const targetGuildId = overId.replace('guild-', '');
            moveMember(activeId, targetGuildId);
        } else {
            const targetMember = localMembers.find(m => m.id === overId);
            if (targetMember) moveMember(activeId, targetMember.guildId);
        }
    };

    return (
        <div className="relative h-screen w-full overflow-hidden bg-gray-950 text-gray-100">
            {/* 頂部控制列 */}
            <div className="absolute top-3 right-3 z-50 flex items-center gap-3">
                <button
                    onClick={() => setMultiSelectMode(!isMultiSelectMode)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${isMultiSelectMode
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700 border border-gray-700'
                        }`}
                >
                    {isMultiSelectMode ? '關閉多選' : '多選模式'}
                </button>

                <button
                    onClick={handleSave}
                    className="px-5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium shadow transition"
                >
                    儲存變更
                </button>
            </div>

            <TransformWrapper
                initialScale={0.6}
                minScale={0.2}
                maxScale={1.5}
                panning={{ disabled: disablePan }}
                wheel={{ step: 0.1 }}
                pinch={{ disabled: false }}
                doubleClick={{ disabled: true }}
                limitToBounds={false}           // 關鍵：允許超出邊界
                centerOnInit={false}
            >
                <TransformComponent wrapperStyle={{ width: '300%', height: '100%' }}>
                    {/* 強制內容高度 + 大量底部 padding，讓可以拉到最底 */}
                    <div className="min-h-[180vh] pb-[1200px] p-4">
                        <DndContext
                            collisionDetection={closestCorners}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <div className="w-full grid grid-cols-2 gap-4">
                                {tieredData.map(({ tier, guilds }) => (
                                    <TierSection key={tier} tier={tier} guilds={guilds} />
                                ))}
                            </div>
                        </DndContext>
                    </div>
                </TransformComponent>

                <ZoomControls />
            </TransformWrapper>

            <BatchActionBar />
            <NotificationModal />
        </div>
    );
}