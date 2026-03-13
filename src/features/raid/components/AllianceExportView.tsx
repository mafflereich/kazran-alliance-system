import React from 'react';
import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AllianceExportViewProps {
  exportRef: React.RefObject<HTMLDivElement>;
  sortedGuilds: any[];
  selectedSeasonsForExport: any[];
  getRecord: (guild_id: string, season_id: string) => any;
  includeScore: boolean;
}

const AllianceExportView: React.FC<AllianceExportViewProps> = ({
  exportRef,
  sortedGuilds,
  selectedSeasonsForExport,
  getRecord,
  includeScore,
}) => {
  const { t } = useTranslation(['raid', 'translation']);

  return (
    <div className="absolute -left-[9999px] top-0">
      <div
        ref={exportRef}
        className="bg-stone-900 p-12 text-stone-100"
        style={{ width: '1200px' }}
      >
        <div className="flex justify-between items-center mb-12 border-b border-stone-800 pb-8">
          <div className="flex items-center gap-4">
            <Trophy className="w-12 h-12 text-amber-500" />
            <div>
              <h1 className="text-4xl font-black tracking-tighter uppercase italic">{t('alliance_raid.history_title')}</h1>
              <p className="text-stone-500 font-mono text-sm tracking-widest uppercase">
                {selectedSeasonsForExport.length === 1
                  ? `${t('alliance_raid.season_label')} ${selectedSeasonsForExport[0].season_number}`
                  : `${t('alliance_raid.seasons_label')} ${selectedSeasonsForExport[0]?.season_number} - ${selectedSeasonsForExport[selectedSeasonsForExport.length - 1]?.season_number}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-stone-400">KAZRAN</div>
            <div className="text-xs text-stone-600 uppercase tracking-widest">{t('alliance_raid.generated_at')} {new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-12">
          {/* Left Column */}
          <div className="space-y-8">
            {(() => {
              const uniqueTiers = Array.from(new Set(sortedGuilds.map(g => g.tier || 0))).sort((a, b) => a - b);
              const splitIndex = Math.ceil(uniqueTiers.length / 2);
              const leftTiers = uniqueTiers.slice(0, splitIndex);

              return leftTiers.map(tier => (
                <div key={tier} className="space-y-3">
                  <div className="flex items-center gap-2 border-l-4 border-amber-500 pl-3">
                    <h2 className="text-xl font-black uppercase italic text-amber-500">Tier {tier}</h2>
                  </div>
                  <div className="space-y-2">
                    {sortedGuilds.filter(g => g.tier === tier).map(guild => (
                      <div key={guild.id} className="bg-stone-800/50 py-2 px-4 rounded-xl border border-stone-700/50 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-stone-500 font-mono text-sm">{guild.serial ? `${guild.serial} 會` : ''}</span>
                          <div className="font-bold text-lg">{guild.name}</div>
                        </div>
                        <div className="flex gap-6">
                          {selectedSeasonsForExport.map(season => {
                            const record = getRecord(guild.id, season.id);
                            return (
                              <div key={season.id} className="text-right w-[100px] min-w-[100px] max-w-[100px]">
                                <div className="text-[10px] text-stone-500 uppercase font-bold">S{season.season_number}</div>
                                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                  <div className={`font-black text-lg leading-none ${record?.rank && !record.rank.includes('%')
                                    ? 'bg-gradient-to-r from-amber-400 to-orange-600 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(245,158,11,0.6)] scale-110 transform origin-right'
                                    : 'text-amber-500'
                                    }`}>{record?.rank || '-'}</div>
                                  {includeScore && record && record.score > 0 && <div className="text-[10px] text-stone-400 font-mono">({record.score.toLocaleString()})</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>

          {/* Right Column */}
          <div className="space-y-8">
            {(() => {
              const uniqueTiers = Array.from(new Set(sortedGuilds.map(g => g.tier || 0))).sort((a, b) => a - b);
              const splitIndex = Math.ceil(uniqueTiers.length / 2);
              const rightTiers = uniqueTiers.slice(splitIndex);

              return rightTiers.map(tier => (
                <div key={tier} className="space-y-3">
                  <div className="flex items-center gap-2 border-l-4 border-amber-500 pl-3">
                    <h2 className="text-xl font-black uppercase italic text-amber-500">Tier {tier}</h2>
                  </div>
                  <div className="space-y-2">
                    {sortedGuilds.filter(g => g.tier === tier).map(guild => (
                      <div key={guild.id} className="bg-stone-800/50 py-2 px-4 rounded-xl border border-stone-700/50 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-stone-500 font-mono text-sm">{guild.serial ? `${guild.serial} 會` : ''}</span>
                          <div className="font-bold text-lg">{guild.name}</div>
                        </div>
                        <div className="flex gap-6">
                          {selectedSeasonsForExport.map(season => {
                            const record = getRecord(guild.id, season.id);
                            return (
                              <div key={season.id} className="text-right w-[100px] min-w-[100px] max-w-[100px]">
                                <div className="text-[10px] text-stone-500 uppercase font-bold">S{season.season_number}</div>
                                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                  <div className={`font-black text-lg leading-none ${record?.rank && !record.rank.includes('%')
                                    ? 'bg-gradient-to-r from-amber-400 to-orange-600 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(245,158,11,0.6)] scale-110 transform origin-right'
                                    : 'text-amber-500'
                                    }`}>{record?.rank || '-'}</div>
                                  {includeScore && record && record.score > 0 && <div className="text-[10px] text-stone-400 font-mono">({record.score.toLocaleString()})</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-stone-800 text-center text-stone-600 text-xs uppercase tracking-[0.5em]">
          Kazran Alliance System • Raid Record
        </div>
      </div>
    </div>
  );
};

export default AllianceExportView;
