import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Member, Guild, Role } from '@entities/member/types';
import { supabase } from '@/shared/api/supabase';

type Store = {
    localMembers: Member[];
    localGuilds: Guild[];
    stagingMembers: Member[]; // ← 暫存區成員
    deletedMembers: Member[]; // ← 刪除區成員
    history: { local: Member[], staging: Member[], deleted: Member[] }[]; // ← 歷史紀錄，用於 Undo
    redoStack: { local: Member[], staging: Member[], deleted: Member[] }[]; // ← Redo 堆疊
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
    batchUpdateRole: (role: Role) => void;
    batchMoveToStaging: () => void;
    batchToggleReserved: () => void;

    // 多選
    toggleSelect: (id: string) => void;
    setMultiSelectMode: (mode: boolean) => void;
    clearSelection: () => void;
    clearDeletedMembers: () => void;

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
    deletedMembers: [],
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
            deletedMembers: [],
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
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
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
            deletedMembers: state.deletedMembers.map((m) =>
                m.id === id ? { ...m, ...updates } : m
            ),
            history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
            redoStack: [], // 新操作清空 redo
        })),

    deleteMember: (id) =>
        set((state) => {
            const memberToDelete = state.localMembers.find(m => m.id === id) || state.stagingMembers.find(m => m.id === id);
            if (!memberToDelete || memberToDelete.isReserved) return state;

            return {
                localMembers: state.localMembers.filter((m) => m.id !== id),
                stagingMembers: state.stagingMembers.filter((m) => m.id !== id),
                deletedMembers: [...state.deletedMembers, memberToDelete],
                selectedIds: new Set([...state.selectedIds].filter((sid) => sid !== id)),
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
                redoStack: [], // 新操作清空 redo
            };
        }),

    duplicateMember: (id) =>
        set((state) => {
            const original = state.localMembers.find((m) => m.id === id) || state.stagingMembers.find(m => m.id === id);
            if (!original || original.isReserved) return state;
            const copy = { ...original, id: uuidv4(), updatedAt: Date.now(), parentId: original.id };
            const newInitialStates = {
                ...state.initialMemberStates,
                [copy.id]: { guildId: copy.guildId, note: copy.note }
            };
            return {
                localMembers: [...state.localMembers, copy],
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
                redoStack: [], // 新操作清空 redo
                initialMemberStates: newInitialStates
            };
        }),

    moveMember: (id, newGuildId) =>
        set((state) => {
            const member = state.localMembers.find(m => m.id === id) || state.stagingMembers.find(m => m.id === id) || state.deletedMembers.find(m => m.id === id);
            if (!member || member.isReserved) return {};

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

            // Remove from all lists
            const newStaging = state.stagingMembers.filter(m => m.id !== id);
            const filteredLocal = state.localMembers.filter(m => m.id !== id);
            const filteredDeleted = state.deletedMembers.filter(m => m.id !== id);

            let newLocal;
            // If coming from deletedMembers, member.guildId might be the original guild or 'staging'
            // We should just append to end if moving to a different guild, or keep position if moving within same guild
            // But since it's coming from deleted area, it's not in localMembers, so we can't keep position.
            // We'll append to end.
            if (member.guildId !== newGuildId || state.deletedMembers.some(m => m.id === id)) {
                // Moving to different guild OR coming from deleted area: append to end
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
                deletedMembers: filteredDeleted,
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
                redoStack: [], // 新操作清空 redo
            };
        }),

    moveToStaging: (id) =>
        set((state) => {
            // Check localMembers, stagingMembers, and deletedMembers
            const member = state.localMembers.find(m => m.id === id) || state.stagingMembers.find(m => m.id === id) || state.deletedMembers.find(m => m.id === id);
            if (!member || member.isReserved) return {};

            const updatedMember = { ...member, guildId: 'staging', updatedAt: Date.now() };

            return {
                localMembers: state.localMembers.filter(m => m.id !== id),
                stagingMembers: [...state.stagingMembers, updatedMember],
                deletedMembers: state.deletedMembers.filter(m => m.id !== id),
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
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
                deletedMembers: previous.deleted,
                history: state.history.slice(0, -1),
                redoStack: [...state.redoStack, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
            };
        }),

    redo: () =>
        set((state) => {
            if (state.redoStack.length === 0) return {};
            const next = state.redoStack[state.redoStack.length - 1];
            return {
                localMembers: next.local,
                stagingMembers: next.staging,
                deletedMembers: next.deleted,
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
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
            history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
        })),

    batchDelete: () =>
        set((state) => {
            const membersToDelete = [...state.localMembers, ...state.stagingMembers].filter(m => state.selectedIds.has(m.id!));

            return {
                localMembers: state.localMembers.filter((m) => !state.selectedIds.has(m.id!)),
                stagingMembers: state.stagingMembers.filter((m) => !state.selectedIds.has(m.id!)),
                deletedMembers: [...state.deletedMembers, ...membersToDelete],
                selectedIds: new Set(),
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
            };
        }),

    batchDuplicate: () =>
        set((state) => {
            const duplicatesLocal = state.localMembers
                .filter((m) => state.selectedIds.has(m.id!))
                .map((m) => ({ ...m, id: uuidv4(), updatedAt: Date.now(), parentId: m.id }));

            const duplicatesStaging = state.stagingMembers
                .filter((m) => state.selectedIds.has(m.id!))
                .map((m) => ({ ...m, id: uuidv4(), updatedAt: Date.now(), parentId: m.id }));

            const newInitialStates = { ...state.initialMemberStates };
            [...duplicatesLocal, ...duplicatesStaging].forEach(d => {
                newInitialStates[d.id] = { guildId: d.guildId, note: d.note };
            });

            return {
                localMembers: [...state.localMembers, ...duplicatesLocal],
                stagingMembers: [...state.stagingMembers, ...duplicatesStaging],
                initialMemberStates: newInitialStates,
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
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
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
            };
        }),

    moveSelectedMembers: (targetGuildId: string) =>
        set((state) => {
            if (state.selectedIds.size === 0) return {};

            const selectedIds = state.selectedIds;

            // 先把所有選取的成員從原本位置移除（保證唯一性）
            let newLocalMembers = state.localMembers.filter(m => !selectedIds.has(m.id!));
            let newStagingMembers = state.stagingMembers.filter(m => !selectedIds.has(m.id!));
            let newDeletedMembers = state.deletedMembers.filter(m => !selectedIds.has(m.id!));

            const membersToMove = [...state.localMembers, ...state.stagingMembers, ...state.deletedMembers].filter(m => selectedIds.has(m.id!));

            let updated: Member[];
            if (targetGuildId === 'staging') {
                updated = membersToMove.map(m => ({ ...m, guildId: 'staging', updatedAt: Date.now() }));
                newStagingMembers = [...newStagingMembers, ...updated];
            } else {
                updated = membersToMove.map(m => ({ ...m, guildId: targetGuildId, updatedAt: Date.now() }));
                newLocalMembers = [...newLocalMembers, ...updated];
            }

            return {
                localMembers: newLocalMembers,
                stagingMembers: newStagingMembers,
                deletedMembers: newDeletedMembers,
                selectedIds: new Set(),
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
                redoStack: [],
            };
        }),

    batchUpdateRole: (role) =>
        set((state) => ({
            localMembers: state.localMembers.map((m) =>
                state.selectedIds.has(m.id!) ? { ...m, role, updatedAt: Date.now() } : m
            ),
            stagingMembers: state.stagingMembers.map((m) =>
                state.selectedIds.has(m.id!) ? { ...m, role, updatedAt: Date.now() } : m
            ),
            deletedMembers: state.deletedMembers.map((m) =>
                state.selectedIds.has(m.id!) ? { ...m, role, updatedAt: Date.now() } : m
            ),
            history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
        })),

    batchMoveToStaging: () =>
        set((state) => {
            const membersToMove = [...state.localMembers, ...state.deletedMembers].filter(m => state.selectedIds.has(m.id!));
            const updatedMembers = membersToMove.map(m => ({ ...m, guildId: 'staging', updatedAt: Date.now() }));

            return {
                localMembers: state.localMembers.filter(m => !state.selectedIds.has(m.id!)),
                stagingMembers: [...state.stagingMembers, ...updatedMembers],
                deletedMembers: state.deletedMembers.filter(m => !state.selectedIds.has(m.id!)),
                selectedIds: new Set(),
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
                redoStack: [],
            };
        }),

    batchToggleReserved: () =>
        set((state) => {
            const anyReserved = [...state.localMembers, ...state.stagingMembers, ...state.deletedMembers]
                .some(m => state.selectedIds.has(m.id!) && m.isReserved);
            
            const newReservedValue = !anyReserved;

            return {
                localMembers: state.localMembers.map((m) =>
                    state.selectedIds.has(m.id!) ? { ...m, isReserved: newReservedValue, updatedAt: Date.now() } : m
                ),
                stagingMembers: state.stagingMembers.map((m) =>
                    state.selectedIds.has(m.id!) ? { ...m, isReserved: newReservedValue, updatedAt: Date.now() } : m
                ),
                deletedMembers: state.deletedMembers.map((m) =>
                    state.selectedIds.has(m.id!) ? { ...m, isReserved: newReservedValue, updatedAt: Date.now() } : m
                ),
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
            };
        }),

    toggleSelect: (id) =>
        set((state) => {
            const member = state.localMembers.find(m => m.id === id) || state.stagingMembers.find(m => m.id === id);
            if (member?.isReserved) return state;

            const newSet = new Set(state.selectedIds);
            newSet.has(id) ? newSet.delete(id) : newSet.add(id);
            return { selectedIds: newSet };
        }),

    setMultiSelectMode: (mode) => set({ isMultiSelectMode: mode }),
    clearSelection: () => set({ selectedIds: new Set() }),
    clearDeletedMembers: () => set({ deletedMembers: [] }),

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
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers }],
                initialMemberStates: newInitialStates,
            };
        }),

    // 儲存到資料庫
    saveToDatabase: async () => {
        const { localMembers, initialMemberStates, localGuilds, stagingMembers, deletedMembers } = get();

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

            // Pick fields to save (separate member data and member_notes data)
            const membersToSave = finalMembers.map(m => ({
                id: m.id,
                name: m.name,
                guildId: m.guildId,
                role: m.role,
                records: m.records,
                exclusiveWeapons: m.exclusiveWeapons,
                color: m.color,
                totalScore: m.totalScore,
                updatedAt: m.updatedAt,
            }));

            const memberNotesToSave = finalMembers.map(m => ({
                member_id: m.id,
                note: m.note,
                is_reserved: m.isReserved || false,
            }));

            // Upsert to members table
            const { error: memberError } = await supabaseUpsert('members', membersToSave);

            if (memberError) {
                console.error('儲存成員失敗', memberError);
                alert('儲存成員失敗：' + memberError.message);
                return;
            }

            // Upsert to member_notes table
            for (const noteData of memberNotesToSave) {
                const { error: noteError } = await supabase
                    .from('member_notes')
                    .upsert(noteData, { onConflict: 'member_id' });

                if (noteError) {
                    console.error('儲存備註失敗', noteError);
                    alert('儲存備註失敗：' + noteError.message);
                    return;
                }
            }

            // Handle archived members (deletedMembers)
            let archiveReason = '';
            if (deletedMembers.length > 0) {
                archiveReason = prompt('請輸入刪除區成員的封存訊息：', '') || '';
                
                for (const member of deletedMembers) {
                    if (!member.id) continue;
                    
                    // Step 1: Insert history
                    const { error: historyError } = await supabase
                        .from('members_archive_history')
                        .insert({
                            member_id: member.id,
                            from_guild_id: member.guildId, // Use current guildId as source
                            archive_reason: archiveReason
                        });

                    if (historyError) {
                        console.error('Failed to insert archive history:', historyError);
                        continue;
                    }

                    // Step 2: Update member status to archived
                    const { error: memberError } = await supabase
                        .from('members')
                        .update({ status: 'archived', guild_id: null })
                        .eq('id', member.id);

                    if (memberError) {
                        console.error('Failed to update member status:', memberError);
                        continue;
                    }

                    // Step 3: Update archive_remark in member_notes
                    const { error: noteError } = await supabase
                        .from('member_notes')
                        .update({ archive_remark: archiveReason })
                        .eq('member_id', member.id);

                    if (noteError) {
                        console.error('Failed to update archive remark:', noteError);
                        // Don't continue, just log error
                    }
                }
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

            // Add archived members to API payload if there are any
            if (deletedMembers.length > 0) {
                const archivedMemberNames = deletedMembers.map(m => m.name).filter(Boolean);
                (apiPayload as any[]).push({
                    guildName: '封存區',
                    members: archivedMemberNames,
                    archiveReason: archiveReason
                });
            }

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