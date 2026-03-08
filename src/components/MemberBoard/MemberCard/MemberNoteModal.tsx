// src/components/MemberBoard/MemberCard/MemberNoteModal.tsx
import { Pencil } from 'lucide-react';
import { useState } from 'react';

type MemberNoteModalProps = {
    memberName: string;
    initialNote: string;
    onSave: (note: string) => void;
    onCancel: () => void;
};

export default function MemberNoteModal({
    memberName,
    initialNote,
    onSave,
    onCancel,
}: MemberNoteModalProps) {
    const [note, setNote] = useState(initialNote);

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 shadow-2xl w-full max-w-xl text-gray-100">
                {/* 標題與 icon */}
                <div className="flex items-center gap-3 mb-5">
                    <Pencil size={20} className="text-indigo-400" />
                    <h3 className="text-lg font-semibold">
                        編輯備註 - {memberName}
                    </h3>
                </div>

                {/* 文字輸入區 */}
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="
                        w-full h-40 text-sm bg-gray-800 border border-gray-700 
                        rounded px-3 py-2 outline-none resize-none 
                        focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
                    "
                    autoFocus
                    placeholder="輸入備註內容..."
                />

                {/* 按鈕 */}
                <div className="flex justify-end gap-3 mt-5">
                    <button
                        onClick={onCancel}
                        className="
                            px-6 py-2 bg-gray-700 hover:bg-gray-600 
                            rounded text-gray-200 transition-colors
                        "
                    >
                        取消
                    </button>
                    <button
                        onClick={() => onSave(note)}
                        className="
                            px-6 py-2 bg-indigo-600 hover:bg-indigo-500 
                            rounded text-white transition-colors font-medium
                        "
                    >
                        儲存
                    </button>
                </div>
            </div>
        </div>
    );
}