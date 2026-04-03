export interface RaidSeason {
  id: string;
  season_number: number;
  period_text: string;
  description: string;
  even_rounds: boolean;
  is_archived?: boolean;
}

export interface MemberRaidRecord {
  id?: string;
  season_id: string;
  member_id: string;
  score: number;
  note: string;
  season_note?: string;
  season_guild?: string;
}

export interface GuildRaidRecord {
  season_id: string;
  guild_id: string;
  member_score_median: number;
  note?: string;
}
