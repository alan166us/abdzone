import React from 'react';
import { Candle, VolatilityMetrics } from '../types/trading';
import { Activity, ShieldAlert, BarChart3, TrendingUp, HelpCircle } from 'lucide-react';

interface VolatilityMatrixProps {
  volatilityMetrics: VolatilityMetrics;
  candles: Candle[];
  symbol: string;
  customBufferMultiplier: number;
  onChangeBufferMultiplier: (val: number) => void;
}

export const VolatilityMatrix: React.FC<VolatilityMatrixProps> = ({
  volatilityMetrics,
  candles,
  symbol,
  customBufferMultiplier,
  onChangeBufferMultiplier,
}) => {
  const currentPrice = candles[candles.length - 1]?.close || 1;
  const bufferDistanceDollars = volatilityMetrics.atr * customBufferMultiplier;
  const bufferDistancePercent = (bufferDistanceDollars / currentPrice) * 100;

  return (
    <div className="flex flex-col h-full bg-[#0B0F17] rounded-lg border border-slate-800 overflow-hidden p-6 gap-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-white font-display">Historical Price Volatility Matrix</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Quantitative volatility modeling determining optimal stop-loss buffers and expansion targets across {symbol}.
        </p>
      </div>

      {/* Volatility KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ATR (14) */}
        <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Average True Range (ATR 14)</span>
            <Activity className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">
            ${volatilityMetrics.atr.toFixed(2)}
          </div>
          <div className="text-xs text-sky-400 font-mono mt-1">
            {volatilityMetrics.atrPercent.toFixed(2)}% of asset spot price
          </div>
        </div>

        {/* Annualized Historical Volatility */}
        <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Historical Volatility (20D HV)</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">
            {(volatilityMetrics.annualizedHV * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 font-mono mt-1">
            Annualized standard deviation of log returns
          </div>
        </div>

        {/* Bollinger Bandwidth */}
        <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Bollinger BandWidth</span>
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">
            {volatilityMetrics.bbWidth.toFixed(2)}%
          </div>
          <div className="text-xs text-slate-500 font-mono mt-1">
            Upper: ${volatilityMetrics.bbUpper.toFixed(1)} · Lower: ${volatilityMetrics.bbLower.toFixed(1)}
          </div>
        </div>

        {/* Active Volatility Regime */}
        <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Current Volatility Regime</span>
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className={`text-lg font-bold font-mono tracking-tight mt-1 ${
            volatilityMetrics.regime.includes('Squeeze') ? 'text-amber-400' :
            volatilityMetrics.regime.includes('Expansion') ? 'text-rose-400' : 'text-emerald-400'
          }`}>
            {volatilityMetrics.regime}
          </div>
          <div className="text-xs text-slate-400 font-mono mt-1">
            Recommended Buffer: {volatilityMetrics.recommendedBufferMultiplier.toFixed(1)}x ATR
          </div>
        </div>
      </div>

      {/* Dynamic Stop-Loss Volatility Buffer Tuning Engine */}
      <div className="p-5 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white font-display">Dynamic Stop-Loss Volatility Buffer Engine</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Why use an ATR buffer? In institutional order flow, market makers frequently spike liquidity wicks 0.5x to 1.2x ATR beyond base extremes to trigger resting retail stops before reversing into profit.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded border border-slate-800 font-mono text-xs">
            <span className="text-slate-400">Current Buffer:</span>
            <span className="text-sky-400 font-bold">{customBufferMultiplier.toFixed(2)}x ATR</span>
            <span className="text-slate-500">(${bufferDistanceDollars.toFixed(2)} / {bufferDistancePercent.toFixed(2)}%)</span>
          </div>
        </div>

        {/* Slider */}
        <div className="flex items-center gap-4 py-2">
          <span className="text-xs font-mono text-slate-500">1.0x (Tight)</span>
          <input
            type="range"
            min="1.0"
            max="2.5"
            step="0.05"
            value={customBufferMultiplier}
            onChange={(e) => onChangeBufferMultiplier(parseFloat(e.target.value))}
            className="flex-1 accent-sky-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <span className="text-xs font-mono text-slate-500">2.5x (Safe/Expansion)</span>
        </div>

        {/* Volatility Regime Guidelines Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs font-mono">
          <div className="p-3 rounded bg-slate-950/60 border border-slate-800/80">
            <div className="text-amber-400 font-semibold mb-1">Compression (Squeeze)</div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Consolidation volatility is compressed. Stop buffer can be kept tighter (1.20x - 1.30x ATR). Prepare for explosive breakout targets.
            </p>
          </div>

          <div className="p-3 rounded bg-slate-950/60 border border-slate-800/80">
            <div className="text-emerald-400 font-semibold mb-1">Normal Mean-Reversion</div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Standard market rhythm. 1.35x ATR buffer provides optimal statistical immunity against liquidity probes while keeping R:R &ge; 1:3.
            </p>
          </div>

          <div className="p-3 rounded bg-slate-950/60 border border-slate-800/80">
            <div className="text-rose-400 font-semibold mb-1">High Volatility Expansion</div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Erratic wicks and wide range candles. Multiplier must expand to 1.6x - 1.85x ATR to prevent stop hunting before the actual reversal leg.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
