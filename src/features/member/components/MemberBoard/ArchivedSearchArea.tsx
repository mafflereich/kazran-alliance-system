import { useState, useMemo } from 'react';
import { Search, X, Archive, User } from 'lucide-react';
import { useMemberBoardStore } from './store/useMemberBoardStore';

export default function ArchivedSearchArea() {
    const { isArchivedSearchOpen, openArchivedSearch, closeArchivedSearch, archivedMembers, archivedMembersLoading } = useMemberBoardStore();
    const [searchQuery, setSearchQuery] = useState('');

    const filteredMembers = useMemo(() => {
        if (!searchQuery.trim()) {
            return archivedMembers;
        }
        const query = searchQuery.toLowerCase();
        return archivedMembers.filter(
            (m) =>
                m.name.toLowerCase().includes(query) ||
                m.guildName.toLowerCase().includes(query)
        );
    }, [archivedMembers, searchQuery]);

    if (!isArchivedSearchOpen) return null;

    const handleClose = () => {
        closeArchivedSearch();
        setSearchQuery('');
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-20">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

            <div className="relative w-[400px] max-h-[70vh] bg-gray-900 border-2 border-amber-600/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10">
                <div className="p-4 border-b border-gray-700 flex items-center justify-between bg-amber-900/20">
                    <div className="flex items-center gap-2 text-amber-400">
                        <Archive size={18} />
                        <span className="font-bold">封存成員搜尋</span>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 border-b border-gray-700">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="輸入名稱篩選封存成員..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-600 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-[200px]">
                    {archivedMembersLoading && (
                        <div className="flex items-center justify-center py-8 text-gray-500">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-600 border-t-transparent mr-2" />
                            載入中...
                        </div>
                    )}

                    {!archivedMembersLoading && filteredMembers.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                            <User size={32} className="mb-2 opacity-50" />
                            <p>{searchQuery ? '找不到相符的封存成員' : '暫無封存成員'}</p>
                        </div>
                    )}

                    {!archivedMembersLoading && filteredMembers.length > 0 && (
                        <div className="flex flex-col gap-2">
                            {filteredMembers.map((member) => (
                                <div
                                    key={member.id}
                                    className="p-3 bg-gray-800/50 border border-gray-700 rounded-xl hover:bg-gray-800 hover:border-amber-500/30 transition cursor-pointer"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-gray-100">{member.name}</span>
                                    </div>
                                    <div className="mt-1 text-xs text-gray-500">
                                        原公會：{member.guildName}
                                    </div>
                                    {member.reason && (
                                        <div className="mt-1 text-xs text-gray-400 italic">
                                            {member.reason}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}