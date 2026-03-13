import React from 'react';

interface GuildSelectionProps {
  guildsByTier: Record<number, any[]>;
  selectedGuildIds: string[];
  handleGuildToggle: (guildId: string) => void;
  isComparisonMode: boolean;
}

const getTierColorActive = (tier: number) => {
  switch (tier) {
    case 1: return 'bg-orange-500 text-white border-orange-600 shadow-md';
    case 2: return 'bg-blue-500 text-white border-blue-600 shadow-md';
    case 3: return 'bg-stone-500 text-white border-stone-600 shadow-md';
    case 4: return 'bg-green-500 text-white border-green-600 shadow-md';
    default: return 'bg-stone-500 text-white border-stone-600 shadow-md';
  }
};

const GuildSelection: React.FC<GuildSelectionProps> = ({
  guildsByTier,
  selectedGuildIds,
  handleGuildToggle,
  isComparisonMode,
}) => {
  return (
    <div className="mb-4">
      <div className="space-y-1">
        {Object.entries(guildsByTier)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([tierStr, guilds]) => {
            const tier = Number(tierStr);
            return (
              <div key={tier} className="flex items-center gap-2">
                <div className="w-6 flex-shrink-0 text-[10px] font-bold text-stone-400 dark:text-stone-500">
                  T{tier}
                </div>
                <div className="flex flex-wrap gap-1 flex-1">
                  {guilds.map(guild => {
                    const isSelected = selectedGuildIds.includes(guild.id!);
                    return (
                      <button
                        key={guild.id}
                        onClick={() => handleGuildToggle(guild.id!)}
                        className={`px-2.5 py-1 rounded text-[12px] font-medium transition-all border ${
                          isSelected
                            ? getTierColorActive(tier)
                            : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                        }`}
                      >
                        {isComparisonMode && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="mr-1.5 w-3.5 h-3.5"
                          />
                        )}
                        {guild.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default GuildSelection;
