import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Member, Guild } from '../types';

type Store = {
    localMembers: Member[];
    localGuilds: Guild[];
    pendingPastedMembers: Member[];   // ← 貼上成員暫存（等儲存才合併）
    selectedIds: Set<string>;
    isMultiSelectMode: boolean;
    initialMemberStates: Record<string, { guildId: string; note?: string }>; // Track initial state for note restoration

    // 初始化
    init: (members: Member[], guilds: Guild[]) => void;

    // 單一成員操作
    addMember: (member: Member) => void;
    updateMember: (id: string, updates: Partial<Member>) => void;
    deleteMember: (id: string) => void;
    duplicateMember: (id: string) => void;
    moveMember: (id: string, newGuildId: string) => void;

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

    // 儲存到資料庫（這裡才真正合併 pending + 存入後端）
    saveToDatabase: () => Promise<void>;
};

export const useMemberBoardStore = create<Store>((set, get) => ({
    localMembers: [],
    localGuilds: [],
    pendingPastedMembers: [],
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
            pendingPastedMembers: [], // 重置暫存
            initialMemberStates: initialStates,
        });
    },

    addMember: (member) =>
        set((state) => ({
            localMembers: [...state.localMembers, member],
            initialMemberStates: {
                ...state.initialMemberStates,
                [member.id!]: { guildId: member.guildId, note: member.note }
            }
        })),

    updateMember: (id, updates) =>
        set((state) => ({
            localMembers: state.localMembers.map((m) =>
                m.id === id ? { ...m, ...updates, updatedAt: Date.now() } : m
            ),
        })),

    deleteMember: (id) =>
        set((state) => ({
            localMembers: state.localMembers.filter((m) => m.id !== id),
            selectedIds: new Set([...state.selectedIds].filter((sid) => sid !== id)),
        })),

    duplicateMember: (id) =>
        set((state) => {
            const original = state.localMembers.find((m) => m.id === id);
            if (!original) return state;
            const copy = { ...original, id: uuidv4(), updatedAt: Date.now() };
            // New member, initial state is current state
            const newInitialStates = {
                ...state.initialMemberStates,
                [copy.id]: { guildId: copy.guildId, note: copy.note }
            };
            return {
                localMembers: [...state.localMembers, copy],
                initialMemberStates: newInitialStates
            };
        }),

    moveMember: (id, newGuildId) =>
        set((state) => {
            const member = state.localMembers.find(m => m.id === id);
            if (!member) return {};

            const initialState = state.initialMemberStates[id];
            let newNote = member.note;

            // Only modify note if we have initial state to compare against
            if (initialState) {
                if (newGuildId === initialState.guildId) {
                    // Moved back to original guild -> Restore original note
                    newNote = initialState.note;
                } else {
                    // Moved to different guild -> Set note to original guild name
                    // Check if the note is already set to the original guild name to avoid overwriting manual edits?
                    // The requirement says "automatically write", implying overwrite or set.
                    // And "remove" when moving back.
                    // We will just set it.
                    const originalGuild = state.localGuilds.find(g => g.id === initialState.guildId);
                    if (originalGuild) {
                        newNote = originalGuild.name;
                    }
                }
            }

            return {
                localMembers: state.localMembers.map((m) =>
                    m.id === id ? { ...m, guildId: newGuildId, note: newNote, updatedAt: Date.now() } : m
                ),
            };
        }),

    batchUpdateColor: (color) =>
        set((state) => ({
            localMembers: state.localMembers.map((m) =>
                state.selectedIds.has(m.id!) ? { ...m, color, updatedAt: Date.now() } : m
            ),
        })),

    batchDelete: () =>
        set((state) => ({
            localMembers: state.localMembers.filter((m) => !state.selectedIds.has(m.id!)),
            selectedIds: new Set(),
        })),

    batchDuplicate: () =>
        set((state) => {
            const duplicates = state.localMembers
                .filter((m) => state.selectedIds.has(m.id!))
                .map((m) => ({ ...m, id: uuidv4(), updatedAt: Date.now() }));

            const newInitialStates = { ...state.initialMemberStates };
            duplicates.forEach(d => {
                newInitialStates[d.id] = { guildId: d.guildId, note: d.note };
            });

            return {
                localMembers: [...state.localMembers, ...duplicates],
                initialMemberStates: newInitialStates
            };
        }),

    batchMoveToGuild: (guildId) =>
        set((state) => ({
            localMembers: state.localMembers.map((m) => {
                if (!state.selectedIds.has(m.id!)) return m;

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

                return { ...m, guildId, note: newNote, updatedAt: Date.now() };
            }),
        })),

    toggleSelect: (id) =>
        set((state) => {
            const newSet = new Set(state.selectedIds);
            newSet.has(id) ? newSet.delete(id) : newSet.add(id);
            return { selectedIds: newSet };
        }),

    setMultiSelectMode: (mode) => set({ isMultiSelectMode: mode }),
    clearSelection: () => set({ selectedIds: new Set() }),

    // Ctrl+V 貼上 → 先放入 pending
    pasteMembers: (pasted) =>
        set((state) => ({
            pendingPastedMembers: [...state.pendingPastedMembers, ...pasted],
        })),

    // 儲存到資料庫（這裡才真正合併 pending）
    saveToDatabase: async () => {
        const { localMembers, pendingPastedMembers, initialMemberStates, localGuilds } = get();

        const finalMembers = [...localMembers, ...pendingPastedMembers];

        console.log('💾 儲存到資料庫...', {
            totalMembers: finalMembers.length,
            pendingCount: pendingPastedMembers.length,
        });

        try {

            const { supabaseUpsert } = await import('../../../supabase');

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

            // Update initial states after save to reflect the new "base" state
            const newInitialStates: Record<string, { guildId: string; note?: string }> = {};
            finalMembers.forEach(m => {
                if (m.id) {
                    newInitialStates[m.id] = { guildId: m.guildId, note: m.note };
                }
            });

            // 儲存成功後清空 pending
            set({
                localMembers: finalMembers,
                pendingPastedMembers: [],
                initialMemberStates: newInitialStates,
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