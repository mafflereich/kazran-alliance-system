import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Member, Guild } from '@entities/member/types';

type Store = {
    localMembers: Member[];
    localGuilds: Guild[];
    stagingMembers: Member[]; // ← 暫存區成員
    history: { local: Member[], staging: Member[] }[]; // ← 歷史紀錄，用於 Undo
    redoStack: { local: Member[], staging: Member[] }[]; // ← Redo 堆疊
    selectedIds: Set<string>;
    isMultiSelectMode: boolean;
    initialMemberStates: Record<string, { guildId: string; note?: string }>;

    // 初始化
    init: (members: Member[], guilds: Guild[]) => void;

    // 單一成員操作
    addMember: (member: Member) => void;
    updateMember: (id: string, updates: Partial<Member>) => void;
    deleteMember: (id: string) => void;
    duplicateMember: (id: string) => void;
    moveSelectedMembers: (targetGuildId: string) => void;
    moveMember: (id: string, newGuildId: string) => void;
    moveToStaging: (id: string) => void;
    undo: () => void;
    redo: () => void; // ← 新增 redo

    // 批次操作
    batchUpdateColor: (color: string) => void;
    batchDelete: () => void;
    batchDuplicate: () => void;
    batchMoveToGuild: (guildId: string) => void;

    // 多選
    toggleSelect: (id: string) => void;
    setMultiSelectMode: (mode: boolean) => void;
    clearSelection: () => void;

    // 貼上（Ctrl+V）
    pasteMembers: (pasted: Member[]) => void;

    // Notification Modal State
    notification: {
        isOpen: boolean;
        title: string;
        message: string;
        type: 'success' | 'error' | 'info';
        copyContent?: string;
    };
    closeNotification: () => void;

    // 儲存到資料庫
    saveToDatabase: () => Promise<void>;
};

export const useMemberBoardStore = create<Store>((set, get) => ({
    localMembers: [],
    localGuilds: [],
    stagingMembers: [],
    history: [],
    redoStack: [], // ← 初始化
    selectedIds: new Set(),
    isMultiSelectMode: false,
    initialMemberStates: {},
    notification: {
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
    },

    closeNotification: () => set((state) => ({ notification: { ...state.notification, isOpen: false } })),

    init: (members, guilds) => {
        const initialStates: Record<string, { guildId: string; note?: string }> = {};
        members.forEach(m => {
            if (m.id) {
                initialStates[m.id] = { guildId: m.guildId, note: m.note };
            }
        });
        set({
            localMembers: [...members],
            localGuilds: [...guilds],
            stagingMembers: [],
            history: [],
            redoStack: [],
            initialMemberStates: initialStates,
        });
    },

    addMember: (member) =>
        set((state) => {
            const newMembers = [...state.localMembers, { ...member }];
            return {
                localMembers: newMembers,
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
                redoStack: [], // 新操作清空 redo
                initialMemberStates: {
                    ...state.initialMemberStates,
                    [member.id!]: { guildId: 'new', note: member.note }
                }
            };
        }),

    updateMember: (id, updates) =>
        set((state) => ({
            localMembers: state.localMembers.map((m) =>
                m.id === id ? { ...m, ...updates } : m
            ),
            stagingMembers: state.stagingMembers.map((m) =>
                m.id === id ? { ...m, ...updates } : m
            ),
            history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
            redoStack: [], // 新操作清空 redo
        })),

    deleteMember: (id) =>
        set((state) => ({
            localMembers: state.localMembers.filter((m) => m.id !== id),
            stagingMembers: state.stagingMembers.filter((m) => m.id !== id),
            selectedIds: new Set([...state.selectedIds].filter((sid) => sid !== id)),
            history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
            redoStack: [], // 新操作清空 redo
        })),

    duplicateMember: (id) =>
        set((state) => {
            const original = state.localMembers.find((m) => m.id === id) || state.stagingMembers.find(m => m.id === id);
            if (!original) return state;
            const copy = { ...original, id: uuidv4(), updatedAt: Date.now() };
            const newInitialStates = {
                ...state.initialMemberStates,
                [copy.id]: { guildId: copy.guildId, note: copy.note }
            };
            return {
                localMembers: [...state.localMembers, copy],
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
                redoStack: [], // 新操作清空 redo
                initialMemberStates: newInitialStates
            };
        }),

    moveMember: (id, newGuildId) =>
        set((state) => {
            const member = state.localMembers.find(m => m.id === id) || state.stagingMembers.find(m => m.id === id);
            if (!member) return {};

            const initialState = state.initialMemberStates[id];
            let newNote = member.note;

            if (initialState) {
                if (newGuildId === initialState.guildId) {
                    newNote = initialState.note;
                } else {
                    const originalGuild = state.localGuilds.find(g => g.id === initialState.guildId);
                    if (originalGuild) {
                        newNote = originalGuild.name;
                    }
                }
            }

            const updatedMember = { ...member, guildId: newGuildId, note: newNote, updatedAt: Date.now() };

            // Remove from staging if it was there
            const newStaging = state.stagingMembers.filter(m => m.id !== id);

            // Remove from old position in localMembers
            const filteredLocal = state.localMembers.filter(m => m.id !== id);

            let newLocal;
            if (member.guildId !== newGuildId) {
                // Moving to different guild: append to end
                newLocal = [...filteredLocal, updatedMember];
            } else {
                // Moving within same guild: keep original position
                const oldIndex = state.localMembers.findIndex(m => m.id === id);
                newLocal = [...filteredLocal];
                newLocal.splice(oldIndex, 0, updatedMember);
            }

            return {
                localMembers: newLocal,
                stagingMembers: newStaging,
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
                redoStack: [], // 新操作清空 redo
            };
        }),

    moveToStaging: (id) =>
        set((state) => {
            const member = state.localMembers.find(m => m.id === id);
            if (!member) return {};

            const updatedMember = { ...member, guildId: 'staging', updatedAt: Date.now() };

            return {
                localMembers: state.localMembers.filter(m => m.id !== id),
                stagingMembers: [...state.stagingMembers, updatedMember],
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
                redoStack: [], // 新操作清空 redo
            };
        }),

    undo: () =>
        set((state) => {
            if (state.history.length === 0) return {};
            const previous = state.history[state.history.length - 1];
            return {
                localMembers: previous.local,
                stagingMembers: previous.staging,
                history: state.history.slice(0, -1),
                redoStack: [...state.redoStack, { local: state.localMembers, staging: state.stagingMembers }],
            };
        }),

    redo: () =>
        set((state) => {
            if (state.redoStack.length === 0) return {};
            const next = state.redoStack[state.redoStack.length - 1];
            return {
                localMembers: next.local,
                stagingMembers: next.staging,
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
                redoStack: state.redoStack.slice(0, -1),
            };
        }),

    batchUpdateColor: (color) =>
        set((state) => ({
            localMembers: state.localMembers.map((m) =>
                state.selectedIds.has(m.id!) ? { ...m, color, updatedAt: Date.now() } : m
            ),
            stagingMembers: state.stagingMembers.map((m) =>
                state.selectedIds.has(m.id!) ? { ...m, color, updatedAt: Date.now() } : m
            ),
            history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
        })),

    batchDelete: () =>
        set((state) => ({
            localMembers: state.localMembers.filter((m) => !state.selectedIds.has(m.id!)),
            stagingMembers: state.stagingMembers.filter((m) => !state.selectedIds.has(m.id!)),
            selectedIds: new Set(),
            history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
        })),

    batchDuplicate: () =>
        set((state) => {
            const duplicatesLocal = state.localMembers
                .filter((m) => state.selectedIds.has(m.id!))
                .map((m) => ({ ...m, id: uuidv4(), updatedAt: Date.now() }));

            const duplicatesStaging = state.stagingMembers
                .filter((m) => state.selectedIds.has(m.id!))
                .map((m) => ({ ...m, id: uuidv4(), updatedAt: Date.now() }));

            const newInitialStates = { ...state.initialMemberStates };
            [...duplicatesLocal, ...duplicatesStaging].forEach(d => {
                newInitialStates[d.id] = { guildId: d.guildId, note: d.note };
            });

            return {
                localMembers: [...state.localMembers, ...duplicatesLocal],
                stagingMembers: [...state.stagingMembers, ...duplicatesStaging],
                initialMemberStates: newInitialStates,
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
            };
        }),

    batchMoveToGuild: (guildId) =>
        set((state) => {
            const newLocalMembers = [...state.localMembers];
            let newStagingMembers = [...state.stagingMembers];

            // 處理 localMembers 中的選取項目
            for (let i = 0; i < newLocalMembers.length; i++) {
                const m = newLocalMembers[i];
                if (state.selectedIds.has(m.id!)) {
                    const initialState = state.initialMemberStates[m.id!];
                    let newNote = m.note;
                    if (initialState) {
                        if (guildId === initialState.guildId) {
                            newNote = initialState.note;
                        } else {
                            const originalGuild = state.localGuilds.find(g => g.id === initialState.guildId);
                            if (originalGuild) {
                                newNote = originalGuild.name;
                            }
                        }
                    }
                    newLocalMembers[i] = { ...m, guildId, note: newNote, updatedAt: Date.now() };
                }
            }

            // 處理 stagingMembers 中的選取項目
            const stagingToMove = newStagingMembers.filter(m => state.selectedIds.has(m.id!));
            newStagingMembers = newStagingMembers.filter(m => !state.selectedIds.has(m.id!));

            stagingToMove.forEach(m => {
                const initialState = state.initialMemberStates[m.id!];
                let newNote = m.note;
                if (initialState) {
                    if (guildId === initialState.guildId) {
                        newNote = initialState.note;
                    } else {
                        const originalGuild = state.localGuilds.find(g => g.id === initialState.guildId);
                        if (originalGuild) {
                            newNote = originalGuild.name;
                        }
                    }
                }
                newLocalMembers.push({ ...m, guildId, note: newNote, updatedAt: Date.now() });
            });

            return {
                localMembers: newLocalMembers,
                stagingMembers: newStagingMembers,
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
            };
        }),

    moveSelectedMembers: (targetGuildId: string) =>
        set((state) => {
            if (state.selectedIds.size === 0) return {};

            const selectedIds = state.selectedIds;

            // 處理 localMembers
            let newLocalMembers = state.localMembers.filter(m => !selectedIds.has(m.id!));
            let newStagingMembers = [...state.stagingMembers];

            const membersToMove = [...state.localMembers, ...state.stagingMembers].filter(m => selectedIds.has(m.id!));

            if (targetGuildId === 'staging') {
                const updated = membersToMove.map(m => ({ ...m, guildId: 'staging', updatedAt: Date.now() }));
                newStagingMembers = [...newStagingMembers, ...updated];
            } else {
                const updated = membersToMove.map(m => ({ ...m, guildId: targetGuildId, updatedAt: Date.now() }));
                newLocalMembers = [...newLocalMembers, ...updated];
            }

            return {
                localMembers: newLocalMembers,
                stagingMembers: newStagingMembers,
                selectedIds: new Set(),
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
                redoStack: [],
            };
        }),

    toggleSelect: (id) =>
        set((state) => {
            const newSet = new Set(state.selectedIds);
            newSet.has(id) ? newSet.delete(id) : newSet.add(id);
            return { selectedIds: newSet };
        }),

    setMultiSelectMode: (mode) => set({ isMultiSelectMode: mode }),
    clearSelection: () => set({ selectedIds: new Set() }),

    // Ctrl+V 貼上
    pasteMembers: (pasted) =>
        set((state) => {
            const newMembers = pasted.map(m => ({ ...m }));
            const newInitialStates = { ...state.initialMemberStates };
            newMembers.forEach(m => {
                newInitialStates[m.id!] = { guildId: 'pasted', note: m.note };
            });
            return {
                localMembers: [...state.localMembers, ...newMembers],
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers }],
                initialMemberStates: newInitialStates,
            };
        }),

    // 儲存到資料庫
    saveToDatabase: async () => {
        const { localMembers, initialMemberStates, localGuilds, stagingMembers } = get();

        if (stagingMembers.length > 0) {
            alert('暫存區還有成員未分配公會，請先將他們拖曳至公會中再儲存。');
            return;
        }

        const finalMembers = [...localMembers];

        console.log('💾 儲存到資料庫...', {
            totalMembers: finalMembers.length,
        });

        try {

            const { supabaseUpsert } = await import('@/shared/api/supabase');

            // Pick fields to save
            const membersToSave = finalMembers.map(m => ({
                id: m.id,
                name: m.name,
                guildId: m.guildId,
                role: m.role,
                records: m.records,
                exclusiveWeapons: m.exclusiveWeapons,
                note: m.note,
                color: m.color,
                totalScore: m.totalScore,
                updatedAt: m.updatedAt,
            }));

            const { error } = await supabaseUpsert('members', membersToSave);

            if (error) {
                console.error('儲存失敗', error);
                alert('儲存失敗：' + error.message);
                return;
            }


            // Identify moved members and group by SOURCE guild
            const movedGroups: Record<string, string[]> = {};

            finalMembers.forEach(m => {
                if (!m.id) return;
                const initialState = initialMemberStates[m.id];

                // Check if member moved
                if (initialState && initialState.guildId !== m.guildId) {
                    const sourceGuildId = initialState.guildId;
                    const sourceGuild = localGuilds.find(g => g.id === sourceGuildId);

                    if (sourceGuild) {
                        if (!movedGroups[sourceGuild.name]) {
                            movedGroups[sourceGuild.name] = [];
                        }
                        movedGroups[sourceGuild.name].push(m.name);
                    }
                }
            });

            // Prepare payload for API
            const apiPayload = Object.entries(movedGroups).map(([guildName, members]) => ({
                guildName,
                members
            }));

            if (apiPayload.length > 0) {
                // Generate local preview message immediately for testing/fallback
                let localMessage = '';
                apiPayload.forEach(group => {
                    localMessage += `\n${group.guildName}\n${group.members.join(' ')}\n請 {會長} {副會長} 今天送出他們\n`;
                });

                try {

                    const response = await fetch('https://chaosop.duckdns.org/api/memberMoveMessage', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(apiPayload),
                    });

                    if (response.ok) {
                        const message = await response.text();

                        // Auto copy message to clipboard
                        if (message) {
                            navigator.clipboard.writeText(message).catch(err => console.error('Auto copy failed:', err));
                        }

                        set({
                            notification: {
                                isOpen: true,
                                title: '儲存成功',
                                message: message ? `已儲存 ${finalMembers.length} 位成員！\n\nDiscord 通知訊息:\n${message}` : `已儲存 ${finalMembers.length} 位成員！\n(Discord 通知已發送)`,
                                type: 'success',
                                copyContent: message || undefined,
                            }
                        });
                    } else {
                        console.error('API Error:', response.statusText);

                        // Auto copy local message as fallback
                        if (localMessage) {
                            navigator.clipboard.writeText(localMessage).catch(err => console.error('Auto copy failed:', err));
                        }

                        set({
                            notification: {
                                isOpen: true,
                                title: '儲存成功 (API 錯誤)',
                                message: `已儲存成員，但 API 回傳錯誤: ${response.statusText}\n\n(本地預覽訊息):\n${localMessage}`,
                                type: 'error', // Or warning
                                copyContent: localMessage,
                            }
                        });
                    }
                } catch (apiErr) {
                    console.error('API Call Failed:', apiErr);

                    // Auto copy local message as fallback
                    if (localMessage) {
                        navigator.clipboard.writeText(localMessage).catch(err => console.error('Auto copy failed:', err));
                    }

                    set({
                        notification: {
                            isOpen: true,
                            title: '儲存成功 (API 連線失敗)',
                            message: `已儲存成員，但 API 連線失敗 (可能是 CORS 或 HTTPS 阻擋)。\n\n(本地預覽訊息):\n${localMessage}`,
                            type: 'error',
                            copyContent: localMessage,
                        }
                    });
                }
            } else {
                set({
                    notification: {
                        isOpen: true,
                        title: '儲存成功',
                        message: `已儲存 ${finalMembers.length} 位成員到資料庫！`,
                        type: 'success',
                    }
                });
            }

            // 儲存成功後清空 pending
            set({
                localMembers: finalMembers,
            });

        } catch (err: any) {
            console.error('儲存失敗', err);
            set({
                notification: {
                    isOpen: true,
                    title: '儲存失敗',
                    message: '儲存發生錯誤：' + err.message,
                    type: 'error',
                }
            });
        }
    },
}));