import type { Member, Guild, Role } from '@entities/member/types';

export type ArchiveMember = {
    id: string;
    name: string;
    guildName: string;
    reason: string;
};

export type MemberMoveAction = 'move' | 'kick';

export type MemberMovePayloadItem = {
    id?: string;
    name: string;
    sourceGuild?: string;
    targetGuild?: string;
    action: MemberMoveAction;
};

export type MemberMovePayload = {
    guildName: string;
    members: MemberMovePayloadItem[];
    archiveReason?: string;
};

export type MemberBoardState = {
    localMembers: Member[];
    localGuilds: Guild[];
    stagingMembers: Member[];
    deletedMembers: Member[];
    history: {
        contextMenu: any; local: Member[], staging: Member[], deleted: Member[], selectedIds: Set<string>, isMultiSelectMode: boolean
    }[];
    redoStack: {
        contextMenu: any; local: Member[], staging: Member[], deleted: Member[], selectedIds: Set<string>, isMultiSelectMode: boolean
    }[];
    selectedIds: Set<string>;
    isMultiSelectMode: boolean;
    contextMenu: {
        isOpen: boolean;
        x: number;
        y: number;
        memberId: string | null;
        isInDeletionArea: boolean;
    };
    initialMemberStates: Record<string, { guildId: string; note?: string; role?: Role; color?: string, isReserved?: boolean }>;
    isDraftInitialized: boolean;
    skipPersistUntilModified: boolean;
    notification: {
        isOpen: boolean;
        title: string;
        message: string;
        type: 'success' | 'error' | 'info';
        copyContent?: string;
        confirmLabel?: string;
        onConfirm?: () => void;
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
    openContextMenu: (memberId: string, x: number, y: number, isInDeletionArea: boolean) => void;
    closeContextMenu: () => void;
    clearSelection: () => void;
    setSelectedIds: (ids: Set<string>) => void;
    clearDeletedMembers: () => void;
    pasteMembers: (pasted: Member[]) => void;
    buildApiPayload: () => MemberMovePayload[];
    closeNotification: () => void;
    showNotification: (title: string, message: string, type?: 'success' | 'error' | 'info', copyContent?: string, confirmLabel?: string, onConfirm?: () => void) => void;
    openArchiveModal: (members: ArchiveMember[]) => void;
    closeArchiveModal: () => void;
    updateArchiveMemberReason: (id: string, reason: string) => void;
    confirmArchiveAndSave: () => Promise<void>;
    saveToDatabase: () => Promise<void>;
    discardDraft: () => void;
};

export type MemberBoardStore = MemberBoardState & MemberBoardActions;
