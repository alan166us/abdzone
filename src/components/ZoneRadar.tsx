import React, { useState } from 'react';
import { SupplyDemandZone, ZoneType } from '../types/trading';
import { ArrowUpRight, ArrowDownRight, ExternalLink, Filter } from 'lucide-react';

interface ZoneRadarProps {
  zones: SupplyDemandZone[];
  onSelectZone: (zone: SupplyDemandZone) => void;
  selectedZoneId?: string | null;
}

export const ZoneRadar: React.FC<ZoneRadarProps> = ({
  zones,
  onSelectZone,
  selectedZoneId,
}) => {
  const [filterType, setFilterType] = useState<'recent' | 'all' | 'demand' | 'supply' | 'fresh' | 'mitigated'>('recent');

  const filteredZones = zones.filter(z => {
    if (filterType === 'recent') return z.isRecentPrimary;
    if (filterType === 'demand') return z.type === 'demand';
    if (filterType === 'supply') return z.type === 'supply';
    if (filterType === 'fresh') return !z.isMitigated && z.testedCount === 0;
    if (filterType === 'mitigated') return z.isMitigated;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-[#0B0F17] rounded-lg border border-slate-800 overflow-hidden">
      {/* Table Header & Interactive Filter Bar */}
      <div className="flex flex-wrap items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0F172A]/50 gap-4">
        <div>
          <h2 className="text-base font-bold text-white font-display">Automatic Supply & Demand Radar</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Algorithmic zone detection identifying institutional accumulation bases, Fair Value imbalances, and liquidity sweeps.
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
          <button
            onClick={() => setFilterType('recent')}
            className={`px-3 py-1.5 font-medium rounded transition-colors ${
              filterType === 'recent' ? 'bg-sky-950/90 text-sky-300 border border-sky-800/80 font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚡ Recent Active (1 D / 1 S)
          </button>
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 font-medium rounded transition-colors ${
              filterType === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({zones.length})
          </button>
          <button
            onClick={() => setFilterType('fresh')}
            className={`px-3 py-1.5 font-medium rounded transition-colors ${
              filterType === 'fresh' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Fresh Untested ({zones.filter(z => !z.isMitigated && z.testedCount === 0).length})
          </button>
          <button
            onClick={() => setFilterType('demand')}
            className={`px-3 py-1.5 font-medium rounded transition-colors ${
              filterType === 'demand' ? 'bg-emerald-950/80 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Demand Only
          </button>
          <button
            onClick={() => setFilterType('supply')}
            className={`px-3 py-1.5 font-medium rounded transition-colors ${
              filterType === 'supply' ? 'bg-rose-950/80 text-rose-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Supply Only
          </button>
          <button
            onClick={() => setFilterType('mitigated')}
            className={`px-3 py-1.5 font-medium rounded transition-colors ${
              filterType === 'mitigated' ? 'bg-slate-800 text-slate-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mitigated / Broken
          </button>
        </div>
      </div>

      {/* High Density Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-mono text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
              <th className="py-3 px-4">Zone Type & Pattern</th>
              <th className="py-3 px-4">Price Boundary Range</th>
              <th className="py-3 px-4 text-right">Zone Width ($ / %)</th>
              <th className="py-3 px-4 text-right">Departure / Wholesaler Vol</th>
              <th className="py-3 px-4 text-right">Base Length</th>
              <th className="py-3 px-4 text-center">Freshness & Tests</th>
              <th className="py-3 px-4 text-center">Quality Score</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
            {filteredZones.map((zone) => {
              const isDemand = zone.type === 'demand';
              const isSelected = selectedZoneId === zone.id;
              const widthDollars = zone.high - zone.low;
              const widthPct = (widthDollars / zone.equilibrium) * 100;

              return (
                <tr
                  key={zone.id}
                  onClick={() => onSelectZone(zone)}
                  className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                    isSelected ? 'bg-slate-800/70 border-l-2 border-emerald-500' : ''
                  }`}
                >
                  {/* Pattern & Type */}
                  <td className="py-3.5 px-4 font-medium">
                    <div className="flex items-center gap-2">
                      <span className={isDemand ? 'text-emerald-400' : 'text-rose-400'}>
                        {isDemand ? <ArrowUpRight className="w-4 h-4 inline" /> : <ArrowDownRight className="w-4 h-4 inline" />}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-200">
                            {isDemand ? 'Demand' : 'Supply'} · {zone.pattern}
                          </span>
                          {zone.isRecentPrimary && (
                            <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-sky-950/90 text-sky-300 border border-sky-700/80 uppercase tracking-wider animate-pulse">
                              ★ Latest Active
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {zone.pattern === 'DBR' && 'Drop-Base-Rally (Reversal)'}
                          {zone.pattern === 'RBR' && 'Rally-Base-Rally (Continuation)'}
                          {zone.pattern === 'RBD' && 'Rally-Base-Drop (Reversal)'}
                          {zone.pattern === 'DBD' && 'Drop-Base-Drop (Continuation)'}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Boundary Range */}
                  <td className="py-3.5 px-4">
                    <div className="text-slate-200 font-semibold tabular-nums">
                      ${zone.low.toFixed(2)} — ${zone.high.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Mid (Eq): ${zone.equilibrium.toFixed(2)}
                    </div>
                  </td>

                  {/* Zone Width */}
                  <td className="py-3.5 px-4 text-right tabular-nums">
                    <div className="text-slate-200">${widthDollars.toFixed(2)}</div>
                    <div className="text-[10px] text-slate-500">{widthPct.toFixed(2)}%</div>
                  </td>

                  {/* Departure Velocity & Wholesaler Volume Imbalance */}
                  <td className="py-3.5 px-4 text-right tabular-nums">
                    <span className="text-sky-400 font-semibold">{zone.departureVelocity.toFixed(1)}x ATR</span>
                    <div className="text-[10px]">
                      {zone.volumeImbalanceRatio !== undefined ? (
                        <span className={
                          zone.volumeImbalanceRatio >= 1.5 
                            ? "text-emerald-400 font-medium" 
                            : zone.volumeImbalanceRatio < 0.8 
                            ? "text-amber-400" 
                            : "text-slate-400"
                        }>
                          Vol: {zone.volumeImbalanceRatio.toFixed(1)}x {zone.volumeImbalanceRatio >= 1.5 ? '⚡Wholesale' : ''}
                        </span>
                      ) : (
                        <span className="text-slate-500">+{zone.departurePercent.toFixed(1)}% impulse</span>
                      )}
                    </div>
                  </td>

                  {/* Base Length */}
                  <td className="py-3.5 px-4 text-right tabular-nums text-slate-300">
                    {zone.baseLength} candle{zone.baseLength > 1 ? 's' : ''}
                  </td>

                  {/* Freshness & Tests */}
                  <td className="py-3.5 px-4 text-center">
                    {zone.isMitigated ? (
                      <span className="text-slate-500">Mitigated / Broken</span>
                    ) : zone.testedCount === 0 ? (
                      <span className="text-emerald-400 font-semibold">Fresh (Untested)</span>
                    ) : (
                      <span className="text-amber-400">Tested {zone.testedCount}x</span>
                    )}
                  </td>

                  {/* Score */}
                  <td className="py-3.5 px-4 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      <div className="w-10 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${
                            zone.strengthScore >= 80 ? 'bg-emerald-400' :
                            zone.strengthScore >= 60 ? 'bg-sky-400' : 'bg-amber-400'
                          }`}
                          style={{ width: `${zone.strengthScore}%` }}
                        />
                      </div>
                      <span className="tabular-nums font-semibold text-slate-200">{zone.strengthScore}%</span>
                    </div>
                  </td>

                  {/* Action */}
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectZone(zone);
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors inline-flex items-center gap-1"
                    >
                      <span>Focus</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredZones.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            No zones matching the selected filter criteria.
          </div>
        )}
      </div>
    </div>
  );
};
