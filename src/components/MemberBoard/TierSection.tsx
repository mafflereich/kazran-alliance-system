import GuildSection from './GuildSection';
import type { Guild, Member } from './types';

type GuildWithMembers = Guild & { members: Member[] };

type Props = {
    tier: number;
    guilds: GuildWithMembers[];
};

export default function TierSection({ tier, guilds }: Props) {
  const cardFixedWidth = 180;

  return (
    <section className="space-y-2">
      <h2 className="text-xl font-bold text-gray-200 border-b border-gray-700 pb-1">
        Tier {tier}
      </h2>

      <div className="inline-flex flex-wrap gap-2 items-start">
        {guilds.map((guild) => (
          <GuildSection
            key={guild.id}
            guild={guild}
            cardWidth={cardFixedWidth}
          />
        ))}
      </div>
    </section>
  );
}