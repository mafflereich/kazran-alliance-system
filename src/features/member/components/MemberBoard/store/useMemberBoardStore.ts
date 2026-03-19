import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Member, Guild, Role } from '@entities/member/types';
import { supabase } from '@/shared/api/supabase';
import type { MemberBoardStore, MemberMovePayload, MemberMovePayloadItem } from './types';

const MEMBER_BOARD_STORAGE_KEY = 'memberBoardDraft';

const buildGuildGroups = (members: Member[], guilds: Guild[], getGuildId: (m: Member) => string): Record<string, string[]> => {
    const groups: Record<string, string[]> = {};
    members.forEach(m => {
        if (!m.id) return;
        const guildId = getGuildId(m);
        const guild = guilds.find(g => g.id === guildId);
        if (guild) {
            (groups[guild.name] = groups[guild.name] || []).push(m.name);
        }
    });
    return groups;
};

const getPersistedDraft = () => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(MEMBER_BOARD_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const isValidData = Array.isArray(parsed.localMembers) && Array.isArray(parsed.localGuilds);
        if (!isValidData) return null;

        // 若 localMembers/localGuilds 都空，視作無 draft（避免初始化空值覆蓋）
        if (parsed.localMembers.length === 0 && parsed.localGuilds.length === 0) {
            return null;
        }

        return parsed;
    } catch {
        console.warn('無法讀取 member board localStorage');
        return null;
    }
};

const clearPersistedDraft = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(MEMBER_BOARD_STORAGE_KEY);
};

const persistDraft = (state: any) => {
    if (typeof window === 'undefined') return;
    if (!state.isDraftInitialized || state.skipPersistUntilModified) return;

    const data = {
        localMembers: state.localMembers,
        localGuilds: state.localGuilds,
        stagingMembers: state.stagingMembers,
        deletedMembers: state.deletedMembers,
        initialMemberStates: state.initialMemberStates,
    };

    try {
        localStorage.setItem(MEMBER_BOARD_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
            console.warn('localStorage quota exceeded for memberBoardDraft, skipping persistence: ', error);
            // 若有需要，可以在這裡呼叫 clearPersistedDraft() 當回退機制
            // clearPersistDraft();
        } else {
            console.error('無法寫入 memberBoardDraft 本地存儲', error);
        }
    }
};

const makeApiPayload = (
    localMembers: Member[],
    deletedMembers: Member[],
    localGuilds: Guild[],
    initialMemberStates: Record<string, { guildId: string; note?: string; role?: Role; color?: string }>
): MemberMovePayload[] => {
    const movedItems: MemberMovePayloadItem[] = localMembers
        .filter(m => m.id && initialMemberStates[m.id!]?.guildId !== m.guildId)
        .map(m => {
            const sourceGuildName = localGuilds.find(g => g.id === initialMemberStates[m.id!]?.guildId)?.name || '未知公會';
            const targetGuildName = localGuilds.find(g => g.id === m.guildId)?.name || '未知公會';
            return {
                id: m.id,
                name: m.name,
                sourceGuild: sourceGuildName,
                targetGuild: targetGuildName,
                action: 'move' as const
            };
        });

    const archivedItems: MemberMovePayloadItem[] = deletedMembers
        .filter(m => m.id && initialMemberStates[m.id!])
        .map(m => ({
            id: m.id,
            name: m.name,
            sourceGuild: localGuilds.find(g => g.id === initialMemberStates[m.id!]?.guildId)?.name || '未知公會',
            action: 'kick' as const
        }));

    const groupItemsBySource = (items: MemberMovePayloadItem[]) =>
        items.reduce((acc, item) => {
            const key = item.sourceGuild || '未知公會';
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {} as Record<string, MemberMovePayloadItem[]>);

    const movedGroups = groupItemsBySource(movedItems);
    const archivedGroups = groupItemsBySource(archivedItems);

    return [
        ...Object.entries(movedGroups).map(([guildName, members]) => ({ guildName, members })),
        ...Object.entries(archivedGroups).map(([guildName, members]) => ({ guildName, members })),
    ];
};

const sendApiAndNotify = (
    set: (partial: any) => void,
    apiPayload: MemberMovePayload[],
    memberCount: number,
    onSuccess?: () => void
) => {
    if (apiPayload.length === 0) {
        onSuccess?.();
        set({ notification: { isOpen: true, title: '儲存成功', message: `已儲存 ${memberCount} 位成員到資料庫！`, type: 'success' } });
        return;
    }

    const buildGroupText = (group: { guildName: string; members: MemberMovePayloadItem[] }) => {
        const membersText = group.members.map(member => {
            if (member.action === 'kick') {
                return `${member.name} (踢出)`;
            }
            const targetName = member.targetGuild || member.sourceGuild || '未知公會';
            return `${member.name} (${targetName})`;
        }).join(' ');

        const isApplicantList = group.guildName === '申請者清單';
        if (isApplicantList) {
            return `# ${group.guildName}\n${membersText}`;
        }
        return `# ${group.guildName}\n${membersText}\n請 {會長} {副會長} 今天送出他們`;
    };

    const applicantGroup = apiPayload.find((group) => group.guildName === '申請者清單');
    const otherGroups = apiPayload.filter((group) => group.guildName !== '申請者清單');

    const localMessage = [
        ...otherGroups.map(buildGroupText),
        ...(applicantGroup ? [buildGroupText(applicantGroup)] : []),
    ].join('\n\n');

    fetch('https://chaosop.duckdns.org/api/memberMoveMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload),
    }).then(async (response) => {
        const isSuccess = response.ok;
        const message = isSuccess ? await response.text() : null;

        if (message) navigator.clipboard.writeText(message).catch(console.error);

        onSuccess?.();
        set({
            notification: {
                isOpen: true,
                title: isSuccess ? '儲存成功' : '儲存成功 (API 錯誤)',
                message: isSuccess
                    ? (message ? `已儲存 ${memberCount} 位成員！\n\nDiscord 通知訊息:\n${message}` : `已儲存 ${memberCount} 位成員！`)
                    : `已儲存成員，但 API 回傳錯誤\n\n(本地預覽訊息):\n${localMessage}`,
                type: isSuccess ? 'success' : 'error',
                copyContent: message || localMessage
            }
        });
    }).catch(() => {
        navigator.clipboard.writeText(localMessage).catch(console.error);
        onSuccess?.();
        set({
            notification: {
                isOpen: true,
                title: '儲存成功 (API 連線失敗)',
                message: `已儲存成員，但 API 連線失敗\n\n(本地預覽訊息):\n${localMessage}`,
                type: 'error',
                copyContent: localMessage
            }
        });
    });
};

const initialState = {
    localMembers: [] as Member[],
    localGuilds: [] as Guild[],
    stagingMembers: [] as Member[],
    deletedMembers: [] as Member[],
    history: [] as { contextMenu: any; local: Member[]; staging: Member[]; deleted: Member[]; selectedIds: Set<string>; isMultiSelectMode: boolean }[],
    redoStack: [] as { contextMenu: any; local: Member[]; staging: Member[]; deleted: Member[]; selectedIds: Set<string>; isMultiSelectMode: boolean }[],
    selectedIds: new Set<string>(),
    isMultiSelectMode: false,
    contextMenu: {
        isOpen: false,
        x: 0,
        y: 0,
        memberId: null,
        isInDeletionArea: false,
    },
    initialMemberStates: {} as Record<string, { guildId: string; note?: string; role?: Role; color?: string }>,
    isDraftInitialized: false,
    skipPersistUntilModified: true,
    notification: {
        isOpen: false,
        title: '',
        message: '',
        type: 'info' as 'success' | 'error' | 'info',
    },
    archiveModal: {
        isOpen: false,
        members: [] as { id: string; name: string; guildName: string; reason: string }[],
    },
};

const MAX_HISTORY_STEPS = 30;

const saveHistory = (state: typeof initialState & { archiveModal: typeof initialState.archiveModal }) => {
    const nextHistory = [...state.history, {
        local: state.localMembers,
        staging: state.stagingMembers,
        deleted: state.deletedMembers,
        selectedIds: new Set(state.selectedIds),
        isMultiSelectMode: state.isMultiSelectMode,
        contextMenu: { ...state.contextMenu },
    }];

    if (nextHistory.length > MAX_HISTORY_STEPS) {
        nextHistory.shift();
    }

    const nextRedo = state.redoStack.length > MAX_HISTORY_STEPS ? state.redoStack.slice(state.redoStack.length - MAX_HISTORY_STEPS) : state.redoStack;

    return {
        history: nextHistory,
        redoStack: nextRedo,
        selectedIds: new Set<string>(),
        skipPersistUntilModified: false,
    };
};

const updateMembersBySelection = (
    members: Member[],
    selectedIds: Set<string>,
    updateFn: (m: Member) => Member
) => members.map(m => selectedIds.has(m.id!) ? updateFn(m) : m);

const getInitialState = (state: { initialMemberStates: typeof initialState.initialMemberStates, localGuilds: Guild[] }, member: Member) => {
    const initial = state.initialMemberStates[member.id!];
    if (!initial) return null;
    const originalGuild = state.localGuilds.find(g => g.id === initial.guildId);
    return { initial, originalGuild };
};

const computeNewNote = (targetGuildId: string, initial: { guildId: string; note?: string }, originalGuild: Guild | undefined) => {
    if (targetGuildId === initial.guildId) {
        return initial.note;
    }
    return originalGuild?.name || initial.note;
};

const moveMemberToGuild = (member: Member, targetGuildId: string, initial: { guildId: string; note?: string } | null, originalGuild: Guild | undefined) => ({
    ...member,
    guildId: targetGuildId,
    note: initial ? computeNewNote(targetGuildId, initial, originalGuild) : member.note,
    updatedAt: Date.now()
});

export const useMemberBoardStore = create<MemberBoardStore>((set, get) => ({
    ...initialState,

    closeNotification: () => set((state) => ({ notification: { ...state.notification, isOpen: false } })),

    showNotification: (title, message, type = 'info', copyContent) => {
        if (typeof window !== 'undefined' && copyContent) {
            navigator.clipboard.writeText(copyContent).catch(() => { });
        }
        set({
            notification: {
                isOpen: true,
                title,
                message,
                type,
                copyContent
            }
        });
    },

    buildApiPayload: () => {
        const state = get();
        return makeApiPayload(state.localMembers, state.deletedMembers, state.localGuilds, state.initialMemberStates);
    },

    openArchiveModal: (members) => set({
        archiveModal: {
            isOpen: true,
            members: members.map(m => ({ ...m, reason: '' }))
        }
    }),

    closeArchiveModal: () => set({
        archiveModal: { isOpen: false, members: [] }
    }),

    updateArchiveMemberReason: (id, reason) => set((state) => ({
        archiveModal: {
            ...state.archiveModal,
            members: state.archiveModal.members.map(m =>
                m.id === id ? { ...m, reason } : m
            )
        }
    })),
    confirmArchiveAndSave: async () => {
        const state = get();
        const { localMembers, localGuilds, deletedMembers, initialMemberStates, archiveModal } = state;

        const archiveReasons = Object.fromEntries(archiveModal.members.map(m => [m.id, m.reason]));
        const membersToArchive = deletedMembers.filter(m => m.id && m.id in archiveReasons);

        if (membersToArchive.length > 0) {
            const archivePayload = membersToArchive.map(m => ({
                member_id: m.id,
                from_guild_id: initialMemberStates[m.id!]?.guildId || m.guildId,
                reason: archiveReasons[m.id!]
            }));

            // 只要呼叫一次 API！完美解決效能、錯誤捕捉與資料一致性問題
            const { error } = await supabase.rpc('archive_members_bulk', {
                payload: archivePayload
            });

            if (error) {
                throw new Error(`歸檔失敗: ${error.message}`);
            }
        }

        const apiPayload = makeApiPayload(localMembers, membersToArchive, localGuilds, initialMemberStates);

        const closeModal = () => set({
            archiveModal: { isOpen: false, members: [] },
            deletedMembers: membersToArchive.length > 0 ? [] : deletedMembers
        });

        sendApiAndNotify(set, apiPayload, localMembers.length, closeModal);
    },

    init: (members, guilds) => {
        const currentState = get();
        if (currentState.archiveModal.isOpen) {
            return;
        }

        const resolvedInitialStates: Record<string, { guildId: string; note?: string; role?: Role; color?: string }> = {};
        members.forEach(m => {
            if (m.id) {
                resolvedInitialStates[m.id] = { guildId: m.guildId, note: m.note, role: m.role, color: m.color };
            }
        });

        const persisted = getPersistedDraft();

        if (persisted) {
            set({
                localMembers: persisted.localMembers ?? members,
                localGuilds: persisted.localGuilds ?? guilds,
                stagingMembers: persisted.stagingMembers ?? [],
                deletedMembers: persisted.deletedMembers ?? [],
                history: persisted.history ?? [],
                redoStack: persisted.redoStack ?? [],
                selectedIds: new Set(),
                isMultiSelectMode: false,
                initialMemberStates: persisted.initialMemberStates ?? resolvedInitialStates,
                isDraftInitialized: true,
                skipPersistUntilModified: true,
            });
            return;
        }

        set({
            localMembers: members,
            localGuilds: guilds,
            stagingMembers: [],
            deletedMembers: [],
            history: [],
            redoStack: [],
            selectedIds: new Set(),
            isMultiSelectMode: false,
            initialMemberStates: resolvedInitialStates,
            isDraftInitialized: true,
            skipPersistUntilModified: true,
        });
    },

    addMember: (member) => {
        set((state) => ({
            localMembers: [...state.localMembers, member],
            initialMemberStates: {
                ...state.initialMemberStates,
                [member.id!]: { guildId: member.guildId, note: member.note }
            },
            ...saveHistory(state),
        }));
    },

    undo: () => {
        set((state) => {
            if (state.history.length === 0) return {};
            if (state.archiveModal.isOpen) return {};
            const previous = state.history[state.history.length - 1];
            return {
                localMembers: previous.local,
                stagingMembers: previous.staging,
                deletedMembers: previous.deleted,
                selectedIds: new Set(previous.selectedIds),
                isMultiSelectMode: previous.isMultiSelectMode,
                contextMenu: previous.contextMenu ? { ...previous.contextMenu } : { ...initialState.contextMenu },
                history: state.history.slice(0, -1),
                redoStack: [...state.redoStack, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers, selectedIds: new Set(state.selectedIds), isMultiSelectMode: state.isMultiSelectMode, contextMenu: { ...state.contextMenu } }],
            };
        });
    },

    redo: () => {
        set((state) => {
            if (state.redoStack.length === 0) return {};
            if (state.archiveModal.isOpen) return {};
            const next = state.redoStack[state.redoStack.length - 1];
            return {
                localMembers: next.local,
                stagingMembers: next.staging,
                deletedMembers: next.deleted,
                selectedIds: new Set(next.selectedIds),
                isMultiSelectMode: next.isMultiSelectMode,
                contextMenu: next.contextMenu ? { ...next.contextMenu } : { ...initialState.contextMenu },
                history: [...state.history, { local: state.localMembers, staging: state.stagingMembers, deleted: state.deletedMembers, selectedIds: new Set(state.selectedIds), isMultiSelectMode: state.isMultiSelectMode, contextMenu: { ...state.contextMenu } }],
                redoStack: state.redoStack.slice(0, -1),
            };
        });
    },

    batchUpdateColor: (color) => {
        set((state) => ({
            localMembers: updateMembersBySelection(state.localMembers, state.selectedIds, m => ({ ...m, color, updatedAt: Date.now() })),
            stagingMembers: updateMembersBySelection(state.stagingMembers, state.selectedIds, m => ({ ...m, color, updatedAt: Date.now() })),
            ...saveHistory(state),
        }));
    },

    batchDelete: () => {
        set((state) => {
            const membersToDelete = [...state.localMembers, ...state.stagingMembers].filter(m => state.selectedIds.has(m.id!));
            return {
                localMembers: state.localMembers.filter((m) => !state.selectedIds.has(m.id!)),
                stagingMembers: state.stagingMembers.filter((m) => !state.selectedIds.has(m.id!)),
                deletedMembers: [...state.deletedMembers, ...membersToDelete],
                ...saveHistory(state),
            };
        });
    },

    batchDuplicate: () => {
        set((state) => {
            const duplicatesLocal = state.localMembers
                .filter((m) => state.selectedIds.has(m.id!))
                .map((m) => ({ ...m, id: uuidv4(), updatedAt: Date.now(), parentId: m.id }));

            const duplicatesStaging = state.stagingMembers
                .filter((m) => state.selectedIds.has(m.id!))
                .map((m) => ({ ...m, id: uuidv4(), updatedAt: Date.now(), parentId: m.id }));

            const newInitialStates = { ...state.initialMemberStates };
            [...duplicatesLocal, ...duplicatesStaging].forEach(m => {
                newInitialStates[m.id!] = { guildId: m.guildId, note: m.note };
            });

            return {
                localMembers: [...state.localMembers, ...duplicatesLocal],
                stagingMembers: [...state.stagingMembers, ...duplicatesStaging],
                initialMemberStates: newInitialStates,
                ...saveHistory(state),
            };
        });
    },

    batchMoveToGuild: (guildId) => {
        set((state) => {
            const newLocalMembers = state.localMembers.map(m => {
                if (!state.selectedIds.has(m.id!)) return m;
                const { initial, originalGuild } = getInitialState(state, m) || {};
                return moveMemberToGuild(m, guildId, initial || null, originalGuild);
            });

            const stagingToMove = state.stagingMembers.filter(m => state.selectedIds.has(m.id!));
            const newStagingMembers = state.stagingMembers.filter(m => !state.selectedIds.has(m.id!));
            const movedFromStaging = stagingToMove.map(m => {
                const { initial, originalGuild } = getInitialState(state, m) || {};
                return moveMemberToGuild(m, guildId, initial || null, originalGuild);
            });

            return {
                localMembers: [...newLocalMembers, ...movedFromStaging],
                stagingMembers: newStagingMembers,
                ...saveHistory(state),
            };
        });
    },

    moveSelectedMembers: (targetGuildId) => {
        set((state) => {
            if (state.selectedIds.size === 0) return {};

            const newLocalMembers = updateMembersBySelection(state.localMembers, state.selectedIds, m => ({ ...m, guildId: targetGuildId, updatedAt: Date.now() }));

            const stagingToMove = state.stagingMembers.filter(m => state.selectedIds.has(m.id!));
            const newStagingMembers = state.stagingMembers.filter(m => !state.selectedIds.has(m.id!));

            return {
                localMembers: [...newLocalMembers, ...stagingToMove.map(m => ({ ...m, guildId: targetGuildId, updatedAt: Date.now() }))],
                stagingMembers: newStagingMembers,
                ...saveHistory(state),
            };
        });
    },

    batchUpdateRole: (role) => {
        set((state) => ({
            localMembers: updateMembersBySelection(state.localMembers, state.selectedIds, m => ({ ...m, role, updatedAt: Date.now() })),
            stagingMembers: updateMembersBySelection(state.stagingMembers, state.selectedIds, m => ({ ...m, role, updatedAt: Date.now() })),
            deletedMembers: updateMembersBySelection(state.deletedMembers, state.selectedIds, m => ({ ...m, role, updatedAt: Date.now() })),
            ...saveHistory(state),
        }));
    },

    batchMoveToStaging: () => {
        set((state) => {
            const membersToMove = [...state.localMembers, ...state.deletedMembers].filter(m => state.selectedIds.has(m.id!));
            const updatedMembers = membersToMove.map(m => ({ ...m, guildId: 'staging', updatedAt: Date.now() }));

            return {
                localMembers: state.localMembers.filter(m => !state.selectedIds.has(m.id!)),
                stagingMembers: [...state.stagingMembers, ...updatedMembers],
                deletedMembers: state.deletedMembers.filter(m => !state.selectedIds.has(m.id!)),
                ...saveHistory(state),
            };
        });
    },

    batchToggleReserved: () => {
        set((state) => {
            const anyReserved = [...state.localMembers, ...state.stagingMembers, ...state.deletedMembers]
                .some(m => state.selectedIds.has(m.id!) && m.isReserved);

            const newReservedValue = !anyReserved;

            return {
                localMembers: updateMembersBySelection(state.localMembers, state.selectedIds, m => ({ ...m, isReserved: newReservedValue, updatedAt: Date.now() })),
                stagingMembers: updateMembersBySelection(state.stagingMembers, state.selectedIds, m => ({ ...m, isReserved: newReservedValue, updatedAt: Date.now() })),
                deletedMembers: updateMembersBySelection(state.deletedMembers, state.selectedIds, m => ({ ...m, isReserved: newReservedValue, updatedAt: Date.now() })),
                ...saveHistory(state),
            };
        });
    },

    batchReturnToOriginalGuild: () => {
        set((state) => {
            const restoreToOriginal = (m: Member): Member | null => {
                const { initial } = getInitialState(state, m) || {};
                if (!initial) return null;
                return {
                    ...m,
                    guildId: initial.guildId,
                    note: initial.note || '',
                    updatedAt: Date.now()
                };
            };

            const restoredMembers = [...state.stagingMembers, ...state.deletedMembers]
                .filter(m => state.selectedIds.has(m.id!))
                .map(restoreToOriginal)
                .filter((m): m is Member => m !== null);

            const newLocalMembers = [
                ...state.localMembers.map(m => {
                    if (!state.selectedIds.has(m.id!)) return m;
                    const restored = restoreToOriginal(m);
                    return restored || m;
                }),
                ...restoredMembers
            ];

            return {
                localMembers: newLocalMembers,
                stagingMembers: state.stagingMembers.filter(m => !state.selectedIds.has(m.id!)),
                deletedMembers: state.deletedMembers.filter(m => !state.selectedIds.has(m.id!)),
                ...saveHistory(state),
            };
        });
    },

    toggleSelect: (id) => {
        set((state) => {
            const member = state.localMembers.find(m => m.id === id) || state.stagingMembers.find(m => m.id === id);
            if (member?.isReserved) return {};

            const newSet = new Set(state.selectedIds);
            newSet.has(id) ? newSet.delete(id) : newSet.add(id);
            return { selectedIds: newSet };
        });
    },

    setMultiSelectMode: (mode) => set({ isMultiSelectMode: mode }),

    openContextMenu: (memberId, x, y, isInDeletionArea) => set((state) => {
        const isMulti = state.isMultiSelectMode;
        const member = state.localMembers.find(m => m.id === memberId) || state.stagingMembers.find(m => m.id === memberId);
        const updatedSelectedIds = new Set(state.selectedIds);

        if (member && !member.isReserved) {
            if (isMulti) {
                updatedSelectedIds.add(memberId);
            } else {
                updatedSelectedIds.clear();
                updatedSelectedIds.add(memberId);
            }
        }

        return {
            contextMenu: { isOpen: true, memberId, x, y, isInDeletionArea },
            selectedIds: updatedSelectedIds,
        };
    }),

    closeContextMenu: () => set((state) => ({
        contextMenu: { ...state.contextMenu, isOpen: false, memberId: null },
        ...(state.isMultiSelectMode ? {} : { selectedIds: new Set() }),
    })),

    clearSelection: () => set({ selectedIds: new Set() }),

    setSelectedIds: (ids: Set<string>) => {
        set({ selectedIds: ids });
    },

    clearDeletedMembers: () => set({ deletedMembers: [] }),

    pasteMembers: (pasted) => {
        set((state) => {
            const newMembers = pasted.map(m => ({
                ...m,
                id: m.id || uuidv4(),
                updatedAt: Date.now(),
            }));

            const newInitialStates = { ...state.initialMemberStates };
            newMembers.forEach(m => {
                if (m.id) {
                    newInitialStates[m.id] = { guildId: m.guildId, note: m.note };
                }
            });

            return {
                localMembers: [...state.localMembers, ...newMembers],
                initialMemberStates: newInitialStates,
                ...saveHistory(state),
            };
        });
    },

    saveToDatabase: async () => {
        const state = get();
        const { localMembers, localGuilds, stagingMembers, deletedMembers, initialMemberStates } = state;

        if (stagingMembers.length > 0) {
            set({
                notification: {
                    isOpen: true,
                    title: '無法儲存',
                    message: `暫存區有 ${stagingMembers.length} 位成員未分配公會，請先將他們拖曳至公會中再儲存。`,
                    type: 'error',
                },
            });
            return;
        }

        try {
            const isChanged = (member: Member) => {
                const initial = initialMemberStates[member.id!];
                if (!initial) return true;
                return initial.guildId !== member.guildId ||
                    initial.note !== member.note ||
                    initial.role !== member.role ||
                    initial.color !== member.color;
            };

            const changedMembers = localMembers.filter(isChanged);

            if (changedMembers.length > 0) {
                const membersToSave = changedMembers.map(m => ({
                    id: m.id,
                    name: m.name,
                    guild_id: m.guildId,
                    role: m.role,
                    color: m.color,
                    updated_at: m.updatedAt,
                }));

                const { error: memberError } = await supabase
                    .from('members')
                    .upsert(membersToSave);

                if (memberError) {
                    console.error('儲存成員失敗', memberError);
                    set({
                        notification: {
                            isOpen: true,
                            title: '儲存失敗',
                            message: memberError.message,
                            type: 'error',
                        },
                    });
                    return;
                }
            }

            const notesChanged = (member: Member) => {
                const initial = initialMemberStates[member.id!];
                if (!initial) return true;
                return initial.note !== member.note;
            };

            const membersWithChangedNotes = localMembers.filter(m => notesChanged(m) || m.isReserved);

            if (membersWithChangedNotes.length > 0) {
                const memberIds = membersWithChangedNotes.map(m => m.id!);
                const { data: existingNotes } = await supabase
                    .from('member_notes')
                    .select('member_id, uid')
                    .in('member_id', memberIds);

                const existingMap = new Map<string, string>(existingNotes?.map(n => [n.member_id, n.uid]) || []);

                const notesToSave = membersWithChangedNotes.map(m => ({
                    member_id: m.id,
                    note: m.note,
                    is_reserved: m.isReserved || false,
                }));

                const toUpdate = notesToSave.filter(n => existingMap.has(n.member_id));
                const toInsert = notesToSave.filter(n => !existingMap.has(n.member_id));

                if (toUpdate.length > 0) {
                    await Promise.all(toUpdate.map(note =>
                        supabase
                            .from('member_notes')
                            .update({ note: note.note, is_reserved: note.is_reserved })
                            .eq('uid', existingMap.get(note.member_id))
                    ));
                }

                if (toInsert.length > 0) {
                    await supabase.from('member_notes').insert(toInsert);
                }
            }

            if (deletedMembers.length > 0) {
                const archiveModalMembers = deletedMembers
                    .filter(m => m.id)
                    .map(m => {
                        const initialState = initialMemberStates[m.id!];
                        const guildName = localGuilds.find(g => g.id === initialState?.guildId)?.name || '未知公會';
                        return {
                            id: m.id!,
                            name: m.name,
                            guildName
                        };
                    });

                set({
                    archiveModal: {
                        isOpen: true,
                        members: archiveModalMembers.map(m => ({ ...m, reason: '' }))
                    }
                });
                return;
            }

            const apiPayload = makeApiPayload(localMembers, deletedMembers, localGuilds, initialMemberStates);
            sendApiAndNotify(set, apiPayload, localMembers.length);
        } catch (err: unknown) {
            set({
                notification: {
                    isOpen: true,
                    title: '儲存失敗',
                    message: err instanceof Error ? `儲存發生錯誤：${err.message}` : '儲存發生錯誤',
                    type: 'error',
                },
            });
        }
    },
}));

// persist changes to localStorage
useMemberBoardStore.subscribe((state) => {
    persistDraft(state);
});
