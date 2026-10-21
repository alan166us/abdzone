import React, { useState } from 'react';
import { TradeRecommendation, VolatilityMetrics } from '../types/trading';
import { calculatePositionSize } from '../utils/tradeEngine';
import { Shield, Target } from 'lucide-react';

interface RiskSizerProps {
  recommendation: TradeRecommendation | null;
  volatilityMetrics: VolatilityMetrics;
  symbol: string;
}

export const RiskSizer: React.FC<RiskSizerProps> = ({
  recommendation,
  volatilityMetrics,
  symbol,
}) => {
  const [accountEquity, setAccountEquity] = useState<number>(50000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [customEntry, setCustomEntry] = useState<number>(recommendation?.entry || 64000);
  const [customStopLoss, setCustomStopLoss] = useState<number>(recommendation?.stopLoss || 63200);

  // Sync with recommendation if selected
  React.useEffect(() => {
    if (recommendation) {
      setCustomEntry(recommendation.entry);
      setCustomStopLoss(recommendation.stopLoss);
    }
  }, [recommendation]);

  const entry = customEntry || 1;
  const stopLoss = customStopLoss || 1;
  const sizing = calculatePositionSize(accountEquity, riskPercent, entry, stopLoss, symbol);

  const tp1 = entry + (entry - stopLoss) * 2;
  const tp2 = entry + (entry - stopLoss) * 3;
  const tp3 = entry + (entry - stopLoss) * 4.5;

  const multiplier = sizing.isFutures ? (sizing.contracts * sizing.pointValue) : sizing.units;
  const dollarGainTp1 = multiplier * Math.abs(tp1 - entry);
  const dollarGainTp2 = multiplier * Math.abs(tp2 - entry);
  const dollarGainTp3 = multiplier * Math.abs(tp3 - entry);

  const riskPerUnit = Math.abs(entry - stopLoss);
  const riskPctOfPrice = (riskPerUnit / entry) * 100;

  return (
    <div className="flex flex-col h-full bg-[#0B0F17] rounded-lg border border-slate-800 overflow-hidden p-6 gap-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-white font-display">Institutional Risk & Position Sizer</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Calculates strict contract/lot allocation based on portfolio equity risk and historical price volatility buffers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Inputs */}
        <div className="lg:col-span-2 space-y-5">
          {/* Equity & Risk % */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Account Equity ($ USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 font-mono text-sm">$</span>
                <input
                  type="number"
                  value={accountEquity}
                  onChange={(e) => setAccountEquity(Math.max(1, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Risk Allocation Per Trade (%)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="10"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                />
                <div className="flex items-center gap-1">
                  {[0.5, 1.0, 2.0].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRiskPercent(preset)}
                      className={`px-2 py-2 text-xs font-mono rounded border transition-colors ${
                        riskPercent === preset
                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Entry & Stop Loss */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Entry Limit Price ($)</label>
              <input
                type="number"
                step="any"
                value={customEntry}
                onChange={(e) => setCustomEntry(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
              />
              <span className="text-[10px] text-slate-500">Based on zone edge boundary</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Stop-Loss Price ($)</label>
              <input
                type="number"
                step="any"
                value={customStopLoss}
                onChange={(e) => setCustomStopLoss(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-rose-500"
              />
              <span className="text-[10px] text-rose-400">
                Includes ATR buffer (${(volatilityMetrics.atr * volatilityMetrics.recommendedBufferMultiplier).toFixed(2)})
              </span>
            </div>
          </div>

          {/* Sizing Math Summary Box */}
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-3">
            <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider">Position Allocation Calculation</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div>
                <span className="text-slate-500 block text-[10px]">MAX RISK BUDGET</span>
                <span className="text-rose-400 font-bold text-sm">${sizing.riskAmount.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">
                  {sizing.isFutures ? 'POSITION SIZE (CONTRACTS)' : 'POSITION SIZE (SHARES/UNITS)'}
                </span>
                <span className="text-white font-bold text-sm">
                  {sizing.isFutures ? `${sizing.contracts} cts ($${sizing.pointValue}/pt)` : sizing.units.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">TOTAL NOTIONAL VALUE</span>
                <span className="text-sky-400 font-bold text-sm">${sizing.notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">STOP DISTANCE</span>
                <span className="text-slate-300 font-bold text-sm">${riskPerUnit.toFixed(2)} ({riskPctOfPrice.toFixed(2)}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Payoff Matrix Card */}
        <div className="p-5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              <span>Projected Payoff Matrix</span>
            </h3>

            <div className="space-y-3 text-xs font-mono">
              {/* SL */}
              <div className="flex items-center justify-between p-2.5 rounded bg-rose-950/30 border border-rose-900/50">
                <div>
                  <div className="text-rose-400 font-semibold">Stop Loss Hit</div>
                  <div className="text-[10px] text-slate-500">-$${riskPerUnit.toFixed(2)} / unit</div>
                </div>
                <div className="text-right">
                  <div className="text-rose-400 font-bold text-sm">-${sizing.riskAmount.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-500">-1.00R (-{riskPercent}%)</div>
                </div>
              </div>

              {/* TP1 */}
              <div className="flex items-center justify-between p-2.5 rounded bg-emerald-950/20 border border-emerald-900/40">
                <div>
                  <div className="text-emerald-400 font-semibold">Target 1 (1:2 R:R)</div>
                  <div className="text-[10px] text-slate-500">${tp1.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-emerald-400 font-bold text-sm">+${dollarGainTp1.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-500">+2.00R (+{(riskPercent * 2).toFixed(1)}%)</div>
                </div>
              </div>

              {/* TP2 */}
              <div className="flex items-center justify-between p-2.5 rounded bg-emerald-950/40 border border-emerald-800/60">
                <div>
                  <div className="text-emerald-400 font-bold">Target 2 (1:3 R:R)</div>
                  <div className="text-[10px] text-slate-500">${tp2.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-emerald-400 font-bold text-sm">+${dollarGainTp2.toFixed(2)}</div>
                  <div className="text-[10px] text-emerald-400/80">+3.00R (+{(riskPercent * 3).toFixed(1)}%)</div>
                </div>
              </div>

              {/* TP3 */}
              <div className="flex items-center justify-between p-2.5 rounded bg-purple-950/20 border border-purple-900/40">
                <div>
                  <div className="text-purple-300 font-semibold">Runner Target (1:4.5 R:R)</div>
                  <div className="text-[10px] text-slate-500">${tp3.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-purple-300 font-bold text-sm">+${dollarGainTp3.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-500">+4.50R (+{(riskPercent * 4.5).toFixed(1)}%)</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Volatility-adjusted sizing prevents ruin risk during expansion spikes.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
