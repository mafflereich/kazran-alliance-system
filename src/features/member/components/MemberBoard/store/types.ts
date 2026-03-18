import type { Member, Guild, Role } from '@entities/member/types';

export type ArchiveMember = {
    id: string;
    name: string;
    guildName: string;
    reason: string;
};

export type MemberBoardState = {
    localMembers: Member[];
    localGuilds: Guild[];
    stagingMembers: Member[];
    deletedMembers: Member[];
    history: { local: Member[], staging: Member[], deleted: Member[] }[];
    redoStack: { local: Member[], staging: Member[], deleted: Member[] }[];
    selectedIds: Set<string>;
    isMultiSelectMode: boolean;
    initialMemberStates: Record<string, { guildId: string; note?: string; role?: Role; color?: string }>;
    isDraftInitialized: boolean;
    notification: {
        isOpen: boolean;
        title: string;
        message: string;
        type: 'success' | 'error' | 'info';
        copyContent?: string;
    };
    archiveModal: {
        isOpen: boolean;
        members: ArchiveMember[];
    };
};

export type MemberBoardActions = {
    init: (members: Member[], guilds: Guild[]) => void;
    addMember: (member: Member) => void;
    undo: () => void;
    redo: () => void;
    batchUpdateColor: (color: string) => void;
    batchDelete: () => void;
    batchDuplicate: () => void;
    batchMoveToGuild: (guildId: string) => void;
    batchUpdateRole: (role: Role) => void;
    batchMoveToStaging: () => void;
    batchToggleReserved: () => void;
    batchReturnToOriginalGuild: () => void;
    moveSelectedMembers: (targetGuildId: string) => void;
    toggleSelect: (id: string) => void;
    setMultiSelectMode: (mode: boolean) => void;
    clearSelection: () => void;
    setSelectedIds: (ids: Set<string>) => void;
    clearDeletedMembers: () => void;
    pasteMembers: (pasted: Member[]) => void;
    closeNotification: () => void;
    openArchiveModal: (members: ArchiveMember[]) => void;
    closeArchiveModal: () => void;
    updateArchiveMemberReason: (id: string, reason: string) => void;
    confirmArchiveAndSave: () => Promise<void>;
    saveToDatabase: () => Promise<void>;
    clearLocalStorage: () => void;
};

export type MemberBoardStore = MemberBoardState & MemberBoardActions;
