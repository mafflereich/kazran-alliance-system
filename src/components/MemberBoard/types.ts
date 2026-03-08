export interface Guild {
    id?: string;
    name: string;
    tier?: number;
    orderNum?: number;
    isDisplay?: boolean;
}

export interface Member {
    totalScore?: number;
    id?: string;
    name: string;
    guildId: string;
    role: string;
    records: Record<string, any>;
    exclusiveWeapons?: Record<string, boolean>;
    note?: string;
    color?: string;
    updatedAt?: number;
}

export type GuildWithMembers = Guild & {
    members: Member[];
};

export type TieredData = {
    tier: number;
    guilds: GuildWithMembers[];
};