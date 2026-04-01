import { Trash2, Copy, Palette, MoveHorizontal, X } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { useState, useRef, useEffect } from 'react';
import { useMemberBoardStore } from './store/useMemberBoardStore';

export default function BatchActionBar() {
    const {
        selectedIds,
        batchUpdateColor,
        batchDelete,
        batchDuplicate,
        batchMoveToGuild,
        clearSelection,
        localGuilds,
        isMultiSelectMode,
    } = useMemberBoardStore();

    const [showColorPicker, setShowColorPicker] = useState(false);
    const [tempColor, setTempColor] = useState<string>('#000000');
    const pickerRef = useRef<HTMLDivElement>(null);

    const [showMoveMenu, setShowMoveMenu] = useState(false);

    // 點擊外面關閉 picker
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showColorPicker && pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                setShowColorPicker(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showColorPicker]);

    if (selectedIds.size === 0 || !isMultiSelectMode) return null;

    return (
        <div className="batch-action-bar fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900/95 backdrop-blur-md border border-gray-700 shadow-2xl rounded-2xl px-8 py-4 flex items-center gap-6 z-50 text-gray-200">
            <div className="font-medium">
                已選 {selectedIds.size} 位
            </div>

            <button
                onClick={batchDuplicate}
                className="flex items-center gap-2 px-5 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition text-gray-200"
            >
                <Copy size={18} /> 複製
            </button>

            <div className="relative" ref={pickerRef}>
                <button
                    onClick={() => {
                        setShowColorPicker(!showColorPicker);
                        setTempColor('#000000'); // 預設顏色
                    }}
                    className="flex items-center gap-2 px-5 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition text-gray-200"
                >
                    <Palette size={18} /> 顏色
                </button>

                {showColorPicker && (
                    <div
                        className="absolute bottom-full left-0 mb-4 bg-gray-900 p-4 rounded-xl border border-gray-700 shadow-xl z-10"
                        onClick={(e) => e.stopPropagation()} // 防止點 picker 關閉
                    >
                        <HexColorPicker
                            color={tempColor}
                            onChange={setTempColor}
                        />
                        <div className="flex justify-end gap-3 mt-3">
                            <button
                                onClick={() => setShowColorPicker(false)}
                                className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => {
                                    batchUpdateColor(tempColor);
                                    setShowColorPicker(false);
                                }}
                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm text-white"
                            >
                                套用
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="relative">
                <button
                    onClick={() => setShowMoveMenu(!showMoveMenu)}
                    className="flex items-center gap-2 px-5 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition text-gray-200"
                >
                    <MoveHorizontal size={18} /> 移動
                </button>
                {showMoveMenu && (
                    <div className="absolute bottom-full right-0 mb-4 bg-gray-900 rounded-xl border border-gray-700 shadow-xl py-2 min-w-[180px] max-h-64 overflow-y-auto">
                        {localGuilds
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
                                        batchMoveToGuild(g.id!);
                                        setShowMoveMenu(false);
                                    }}
                                    className="w-full text-left px-5 py-3 hover:bg-gray-800 transition text-gray-200"
                                >
                                    {g.name}
                                </button>
                            ))}
                    </div>
                )}
            </div>

            <button
                onClick={batchDelete}
                className="flex items-center gap-2 px-5 py-2 bg-red-950/70 border border-red-800 rounded-lg hover:bg-red-900/70 transition text-red-300"
            >
                <Trash2 size={18} /> 刪除
            </button>

            <button
                onClick={clearSelection}
                className="p-3 text-gray-400 hover:text-gray-200 rounded-full hover:bg-gray-800 transition"
            >
                <X size={20} />
            </button>
        </div>
    );
}