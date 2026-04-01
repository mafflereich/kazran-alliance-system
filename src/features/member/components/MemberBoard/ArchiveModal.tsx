import { X } from 'lucide-react';
import { useMemberBoardStore } from './store/useMemberBoardStore';

export default function ArchiveModal() {
    const { archiveModal, closeArchiveModal, updateArchiveMemberReason, confirmArchiveAndSave } = useMemberBoardStore();

    if (!archiveModal.isOpen) return null;

    const handleConfirm = async () => {
        await confirmArchiveAndSave();
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div 
                className="bg-gray-900 border border-amber-500/50 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-gray-100">封存成員</h3>
                    </div>
                    <button 
                        onClick={closeArchiveModal}
                        className="text-gray-400 hover:text-gray-200 transition-colors rounded-full p-1 hover:bg-gray-800"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                    <p className="text-sm text-gray-400 mb-4">請輸入每位成員的封存訊息：</p>
                    
                    <div className="space-y-3">
                        {archiveModal.members.map((member) => (
                            <div key={member.id} className="flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-200 truncate">
                                        {member.name}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {member.guildName}
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    value={member.reason}
                                    onChange={(e) => updateArchiveMemberReason(member.id, e.target.value)}
                                    placeholder="封存訊息..."
                                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-900/50 border-t border-gray-800 flex justify-end gap-3">
                    <button
                        onClick={closeArchiveModal}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors border border-gray-600"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        確認封存
                    </button>
                </div>
            </div>
        </div>
    );
}
