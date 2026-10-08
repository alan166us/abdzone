import React, { useState } from 'react';
import { TradeRecommendation, VolatilityMetrics, SupplyDemandZone } from '../types/trading';
import { 
  generateSchwabOptionPlay, 
  SchwabOptionContractRecommendation, 
  ExpirationStyle, 
  StrikeBias 
} from '../utils/optionsEngine';
import { 
  Building2, 
  Crosshair, 
  ShieldCheck, 
  Target, 
  Copy, 
  Check, 
  ExternalLink, 
  ArrowUpRight, 
  ArrowDownRight, 
  Layers, 
  Sparkles, 
  SlidersHorizontal,
  DollarSign,
  Calculator,
  Info,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Terminal,
  Keyboard,
  BookOpen
} from 'lucide-react';

interface SchwabOptionsTraderProps {
  recommendations: TradeRecommendation[];
  volatilityMetrics: VolatilityMetrics;
  zones: SupplyDemandZone[];
  symbol: string;
  currentPrice: number;
  selectedRecommendation: TradeRecommendation | null;
  onSelectRecommendation: (rec: TradeRecommendation) => void;
  onOpenSchwabModal?: () => void;
  onOpenTosModal?: () => void;
  onLogToJournal?: (rec: TradeRecommendation) => void;
}

export const SchwabOptionsTrader: React.FC<SchwabOptionsTraderProps> = ({
  recommendations,
  volatilityMetrics,
  zones,
  symbol,
  currentPrice,
  selectedRecommendation,
  onSelectRecommendation,
  onOpenSchwabModal,
  onOpenTosModal,
  onLogToJournal,
}) => {
  // Option Parameters
  const [expirationStyle, setExpirationStyle] = useState<ExpirationStyle>('swing');
  const [strikeBias, setStrikeBias] = useState<StrikeBias>('ITM');
  const [contractQty, setContractQty] = useState<number>(2);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ticket' | 'bracket' | 'matrix'>('ticket');

  const activeRec = selectedRecommendation || recommendations[0];

  const optionPlay: SchwabOptionContractRecommendation | null = activeRec
    ? generateSchwabOptionPlay(activeRec, symbol, volatilityMetrics, {
        expirationStyle,
        strikeBias,
      })
    : null;

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  if (!activeRec || !optionPlay) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[#0B0F17] rounded-lg border border-slate-800">
        <Building2 className="w-12 h-12 text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-300">No Active Zone Recommendations for {symbol}</h3>
        <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
          Price is traversing between supply and demand zones without a confirmed high-probability touchpoint.
        </p>
      </div>
    );
  }

  // Financial sizing totals based on contract quantity
  const totalCost = optionPlay.entry.costPerContract * contractQty;
  const totalMaxLoss = Math.abs(optionPlay.stopLoss.lossPerContract) * contractQty;
  const totalTargetProfit = optionPlay.target.profitPerContract * contractQty;
  const isCall = optionPlay.optionType === 'CALL';

  return (
    <div className="h-full flex flex-col min-h-0 bg-[#0B0F17] overflow-y-auto">
      {/* Top Banner: Charles Schwab Portal Integration Guide */}
      <div className="p-4 bg-gradient-to-r from-slate-900 via-[#0B1528] to-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-950/80 border border-sky-800 text-sky-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white font-display uppercase tracking-wide">
                Charles Schwab Option Trading Assist
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800/80">
                Portal & thinkorswim Ready
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Exact Entry, Stop-Loss, and Target parameters structured for error-free order entry on Schwab.com or thinkorswim.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {onOpenTosModal && (
            <button
              onClick={onOpenTosModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm cursor-pointer"
              title="Open step-by-step guide to paste into thinkorswim"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Post to thinkorswim</span>
            </button>
          )}
          <a
            href="https://client.schwab.com/app/trade/tom/#/trade"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors shadow-sm"
          >
            <span>Open Schwab Trade Ticket</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          {onOpenSchwabModal && (
            <button
              onClick={onOpenSchwabModal}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors"
            >
              API Settings
            </button>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto w-full">
        {/* Active Trade Selector (if multiple setups exist) */}
        {recommendations.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono">
            <span className="text-slate-500 text-[11px] uppercase tracking-wider shrink-0 mr-1">
              Active Setups:
            </span>
            {recommendations.map((rec, idx) => {
              const isSelected = activeRec.id === rec.id;
              const isLong = rec.side === 'long';
              return (
                <button
                  key={rec.id}
                  onClick={() => onSelectRecommendation(rec)}
                  className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-sky-950 border-sky-500 text-white font-semibold shadow-sm'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className={isLong ? 'text-emerald-400' : 'text-rose-400'}>
                    {isLong ? <ArrowUpRight className="w-3.5 h-3.5 inline" /> : <ArrowDownRight className="w-3.5 h-3.5 inline" />}
                  </span>
                  <span>#{idx + 1} {isLong ? 'BULL CALL' : 'BEAR PUT'} · {rec.pattern} (${rec.entry.toFixed(2)})</span>
                  <span className="text-[10px] text-emerald-400 ml-1">{rec.qualityScore}% Score</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Contract Configurator: Expiration, Strike Bias & Quantity */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Expiration Style */}
          <div>
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1.5">
              1. Expiration Cycle
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => setExpirationStyle('weekly')}
                className={`py-1.5 px-2 rounded text-center transition-colors ${
                  expirationStyle === 'weekly'
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Weekly (~5 DTE)
              </button>
              <button
                type="button"
                onClick={() => setExpirationStyle('swing')}
                className={`py-1.5 px-2 rounded text-center transition-colors ${
                  expirationStyle === 'swing'
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Swing (14 DTE)
              </button>
              <button
                type="button"
                onClick={() => setExpirationStyle('monthly')}
                className={`py-1.5 px-2 rounded text-center transition-colors ${
                  expirationStyle === 'monthly'
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Monthly (30 DTE)
              </button>
            </div>
          </div>

          {/* Strike Bias */}
          <div>
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1.5">
              2. Strike Moneyness (Delta)
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => setStrikeBias('ITM')}
                className={`py-1.5 px-2 rounded text-center transition-colors ${
                  strikeBias === 'ITM'
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="In The Money (~0.68 Delta): Higher win rate, lower theta decay"
              >
                ITM (~0.68 Δ)
              </button>
              <button
                type="button"
                onClick={() => setStrikeBias('ATM')}
                className={`py-1.5 px-2 rounded text-center transition-colors ${
                  strikeBias === 'ATM'
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="At The Money (~0.52 Delta): Balanced risk and reward"
              >
                ATM (~0.52 Δ)
              </button>
              <button
                type="button"
                onClick={() => setStrikeBias('OTM')}
                className={`py-1.5 px-2 rounded text-center transition-colors ${
                  strikeBias === 'OTM'
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Out of The Money (~0.38 Delta): Lower capital, high percentage leverage"
              >
                OTM (~0.38 Δ)
              </button>
            </div>
          </div>

          {/* Position Sizing / Contract Quantity */}
          <div>
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
              <span>3. Position Sizing</span>
              <span className="text-sky-400 font-semibold">{contractQty} Contract{contractQty > 1 ? 's' : ''} (${totalCost.toLocaleString()})</span>
            </label>
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              {[1, 2, 5, 10].map((qty) => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => setContractQty(qty)}
                  className={`flex-1 py-1.5 rounded transition-colors text-center font-semibold ${
                    contractQty === qty
                      ? 'bg-slate-800 text-sky-300 border border-sky-500/50'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {qty}
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="100"
                value={contractQty}
                onChange={(e) => setContractQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center text-white focus:outline-none focus:border-sky-500 text-xs"
                title="Custom quantity"
              />
            </div>
          </div>
        </div>

        {/* Selected Option Contract Identity Header */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1.5 rounded-lg text-sm font-bold font-mono border ${
                isCall
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700/80'
                  : 'bg-rose-950 text-rose-300 border-rose-700/80'
              }`}
            >
              {optionPlay.ticker} ${optionPlay.strike} {optionPlay.optionType}
            </span>

            <div>
              <div className="text-xs text-slate-300 font-semibold flex items-center gap-2">
                <span>Expiration: {optionPlay.expirationDisplay}</span>
                <span className="text-slate-500">·</span>
                <span className="text-sky-400 font-mono">{optionPlay.daysToExpiration} Days to Expiration</span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                OCC: {optionPlay.occSymbol}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-500 block text-[10px]">DELTA:</span>
              <span className="font-bold text-sky-400">{optionPlay.delta > 0 ? `+${optionPlay.delta}` : optionPlay.delta}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">THETA:</span>
              <span className="font-bold text-slate-300">${optionPlay.theta}/day</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">EST. IV:</span>
              <span className="font-bold text-slate-300">{optionPlay.impliedVolEstimate}%</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">RISK / REWARD:</span>
              <span className="font-bold text-emerald-400">1 : {optionPlay.target.riskRewardRatio}</span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CORE SECTION: 3 CARDS FOR 1. ENTRY, 2. STOP-LOSS, 3. TARGET (TP) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. ENTRY CARD */}
          <div className="p-4 rounded-xl bg-slate-900/90 border-2 border-sky-600/80 shadow-lg shadow-sky-950/20 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded bg-sky-950 border border-sky-700/80 text-sky-300 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-sky-400" />
                  <span>1. ENTRY (BUY LIMIT)</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">Action: Buy to Open</span>
              </div>

              {/* Price display */}
              <div className="my-2">
                <div className="text-3xl font-extrabold font-mono text-sky-300 tabular-nums">
                  ${optionPlay.entry.premium.toFixed(2)}
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1 flex items-center justify-between">
                  <span>${optionPlay.entry.costPerContract.toLocaleString()} / contract</span>
                  <span className="text-sky-400 font-semibold">{contractQty}x = ${totalCost.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Stock Entry Trigger:</span>
                  <span className="font-mono font-bold text-white">${activeRec.entry.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Order Execution:</span>
                  <span className="font-mono text-sky-400">Day Limit Order</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Zone Type:</span>
                  <span className="font-mono">{activeRec.zoneType === 'demand' ? 'Institutional Demand' : 'Institutional Supply'}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-4 pt-2.5 border-t border-slate-800/80 leading-relaxed">
              Place limit order on Schwab when {optionPlay.ticker} enters the zone near ${activeRec.entry.toFixed(2)}.
            </p>
          </div>

          {/* 2. STOP-LOSS CARD */}
          <div className="p-4 rounded-xl bg-slate-900/90 border-2 border-rose-600/80 shadow-lg shadow-rose-950/20 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded bg-rose-950 border border-rose-700/80 text-rose-300 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                  <span>2. STOP-LOSS (SL)</span>
                </span>
                <span className="text-[11px] font-mono text-rose-400 font-semibold">
                  {optionPlay.stopLoss.percentLoss}% Max Loss
                </span>
              </div>

              {/* Price display */}
              <div className="my-2">
                <div className="text-3xl font-extrabold font-mono text-rose-400 tabular-nums">
                  ${optionPlay.stopLoss.premium.toFixed(2)}
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1 flex items-center justify-between">
                  <span className="text-rose-400/90">-${Math.abs(optionPlay.stopLoss.lossPerContract)} / contract</span>
                  <span className="text-rose-400 font-semibold">{contractQty}x = -${totalMaxLoss.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Stock Stop Trigger:</span>
                  <span className="font-mono font-bold text-rose-300">${activeRec.stopLoss.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">ATR Volatility Buffer:</span>
                  <span className="font-mono text-slate-400">{activeRec.bufferAtrMultiplier.toFixed(2)}x ATR</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Order Exit Type:</span>
                  <span className="font-mono text-rose-300">Stop Market / Limit</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-4 pt-2.5 border-t border-slate-800/80 leading-relaxed">
              Cut trade if contract reaches ${optionPlay.stopLoss.premium.toFixed(2)} or underlying breaches ${activeRec.stopLoss.toFixed(2)}.
            </p>
          </div>

          {/* 3. TARGET (TAKE PROFIT) CARD */}
          <div className="p-4 rounded-xl bg-slate-900/90 border-2 border-emerald-600/80 shadow-lg shadow-emerald-950/20 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-700/80 text-emerald-300 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  <span>3. TARGET (TP)</span>
                </span>
                <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                  +{optionPlay.target.percentGain}% Return
                </span>
              </div>

              {/* Price display */}
              <div className="my-2">
                <div className="text-3xl font-extrabold font-mono text-emerald-400 tabular-nums">
                  ${optionPlay.target.premium.toFixed(2)}
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1 flex items-center justify-between">
                  <span className="text-emerald-400/90">+${optionPlay.target.profitPerContract} / contract</span>
                  <span className="text-emerald-400 font-semibold">{contractQty}x = +${totalTargetProfit.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Stock Target (TP2):</span>
                  <span className="font-mono font-bold text-emerald-300">${activeRec.takeProfit2.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Risk-to-Reward Ratio:</span>
                  <span className="font-mono font-bold text-emerald-400">1 : {optionPlay.target.riskRewardRatio}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Order Exit Type:</span>
                  <span className="font-mono text-emerald-400">Sell to Close (Limit)</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-4 pt-2.5 border-t border-slate-800/80 leading-relaxed">
              Take full profit at ${optionPlay.target.premium.toFixed(2)} when stock reaches the opposing zone at ${activeRec.takeProfit2.toFixed(2)}.
            </p>
          </div>
        </div>

        {/* Multi-Target Staging Breakdown (TP1, TP2, TP3) */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Multi-Stage Take Profit Roadmap</span>
            </h4>
            <span className="text-[11px] text-slate-400 font-mono">Scale out contracts systematically</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
            {/* TP1 */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="font-bold text-emerald-400">Target 1 (Conservative)</span>
                <span className="text-emerald-400 font-semibold">+{optionPlay.target.tp1.percentGain}%</span>
              </div>
              <div className="text-lg font-bold text-white tabular-nums">
                ${optionPlay.target.tp1.premium.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                +${optionPlay.target.tp1.profitPerContract}/contract · Stock @ ${optionPlay.target.tp1.underlyingTrigger.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-800/80">
                Action: Sell 50% of contracts, move stop to Breakeven
              </div>
            </div>

            {/* TP2 */}
            <div className="p-3 rounded-lg bg-slate-950 border border-emerald-900/60 bg-emerald-950/10">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="font-bold text-emerald-400">Target 2 (Major Zone)</span>
                <span className="text-emerald-400 font-semibold">+{optionPlay.target.tp2.percentGain}%</span>
              </div>
              <div className="text-lg font-bold text-emerald-300 tabular-nums">
                ${optionPlay.target.tp2.premium.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                +${optionPlay.target.tp2.profitPerContract}/contract · Stock @ ${optionPlay.target.tp2.underlyingTrigger.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-800/80">
                Action: Primary exit objective for standard positions
              </div>
            </div>

            {/* TP3 */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="font-bold text-sky-400">Target 3 (Runner)</span>
                <span className="text-sky-400 font-semibold">+{optionPlay.target.tp3.percentGain}%</span>
              </div>
              <div className="text-lg font-bold text-white tabular-nums">
                ${optionPlay.target.tp3.premium.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                +${optionPlay.target.tp3.profitPerContract}/contract · Stock @ ${optionPlay.target.tp3.underlyingTrigger.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-800/80">
                Action: Final runner tranche for explosive momentum expansions
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CHARLES SCHWAB ORDER ENTRY TICKET GENERATOR */}
        {/* ========================================================================= */}
        <div className="p-5 rounded-xl bg-slate-900 border border-sky-800/50 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                <Building2 className="w-4 h-4 text-sky-400" />
                <span>Charles Schwab Trade Ticket & Copy Tools</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Copy and paste these exact inputs directly into the Charles Schwab web order form or thinkorswim.
              </p>
            </div>

            {/* Tab switch between Schwab Web Ticket and thinkorswim format */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => setActiveTab('ticket')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeTab === 'ticket' ? 'bg-sky-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Schwab Web Ticket
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('bracket')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeTab === 'bracket' ? 'bg-sky-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                thinkorswim OCO String
              </button>
            </div>
          </div>

          {activeTab === 'ticket' ? (
            /* Schwab Web Order Ticket Layout */
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 font-mono text-xs">
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">1. Symbol</span>
                  <span className="font-bold text-white text-sm">{optionPlay.ticker}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">2. Action</span>
                  <span className="font-bold text-sky-300 text-sm">Buy to Open</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">3. Quantity</span>
                  <span className="font-bold text-white text-sm">{contractQty}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">4. Expiration</span>
                  <span className="font-bold text-white text-sm">{optionPlay.expirationDisplay}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">5. Strike</span>
                  <span className="font-bold text-white text-sm">${optionPlay.strike}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">6. Call / Put</span>
                  <span className={`font-bold text-sm ${isCall ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {optionPlay.optionType}
                  </span>
                </div>
              </div>

              {/* Order Type & Execution Bracket */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-3 rounded-lg bg-sky-950/30 border border-sky-800/80">
                  <span className="text-[11px] text-sky-400 font-bold block uppercase">Order Type</span>
                  <span className="text-white font-bold text-sm">Limit Order</span>
                  <div className="mt-1 flex items-center justify-between text-slate-300">
                    <span>Limit Price:</span>
                    <span className="font-bold text-sky-300 text-sm">${optionPlay.entry.premium.toFixed(2)}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/80">
                  <span className="text-[11px] text-rose-400 font-bold block uppercase">Bracket Exit: Stop Loss</span>
                  <span className="text-white font-bold text-sm">Stop Market</span>
                  <div className="mt-1 flex items-center justify-between text-slate-300">
                    <span>Stop Price:</span>
                    <span className="font-bold text-rose-400 text-sm">${optionPlay.stopLoss.premium.toFixed(2)}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/80">
                  <span className="text-[11px] text-emerald-400 font-bold block uppercase">Bracket Exit: Profit Target</span>
                  <span className="text-white font-bold text-sm">Limit Order</span>
                  <div className="mt-1 flex items-center justify-between text-slate-300">
                    <span>Target Price:</span>
                    <span className="font-bold text-emerald-400 text-sm">${optionPlay.target.premium.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(optionPlay.schwabWebSummary, 'summary')}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                  >
                    {copiedType === 'summary' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>Copied Schwab Order!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Complete Schwab Ticket</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopy(optionPlay.occSymbol, 'occ')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-mono transition-colors"
                  >
                    {copiedType === 'occ' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied OCC!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy OCC Symbol</span>
                      </>
                    )}
                  </button>

                  {onLogToJournal && activeRec && (
                    <button
                      type="button"
                      onClick={() => onLogToJournal(activeRec)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                      title="Log this options trade setup to your Trading Journal"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                      <span>Log to Trading Journal</span>
                    </button>
                  )}
                </div>

                <span className="text-[11px] text-slate-400 font-mono">
                  Valid for: Schwab Web Portal, Mobile App, and thinkorswim
                </span>
              </div>
            </div>
          ) : (
            /* thinkorswim Bracket Order String */
            <div className="space-y-3 font-mono">
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">
                  1st Triggers OCO Bracket Order (Entry $\rightarrow$ Stop & Target):
                </span>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-200 text-xs break-all select-all font-semibold">
                  {optionPlay.schwabBracketCommand}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => handleCopy(optionPlay.schwabBracketCommand, 'tosBracket')}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                >
                  {copiedType === 'tosBracket' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>Copied Bracket String!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy 1st Triggers OCO Bracket</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleCopy(optionPlay.schwabOrderCommand, 'tosSingle')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-mono transition-colors"
                >
                  {copiedType === 'tosSingle' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied Single Limit!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Single Limit Order</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick thinkorswim instructions */}
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1.5 mt-2">
                <div className="font-bold text-sky-400 flex items-center gap-1.5">
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>How to Paste into thinkorswim in 3 Seconds:</span>
                </div>
                <div className="text-slate-400">
                  1. Click <strong className="text-slate-200">"Copy 1st Triggers OCO Bracket"</strong> above.
                </div>
                <div className="text-slate-400">
                  2. Open thinkorswim and press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-bold border border-slate-700">Ctrl + V</kbd> (or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-bold border border-slate-700">⌘ + V</kbd>), or right-click the Order Entry bar &rarr; <span className="text-sky-300 italic">"Paste order from clipboard"</span>.
                </div>
                <div className="text-slate-400">
                  3. The order ticket loads automatically with Entry, Stop-Loss, and Target. Click <strong className="text-emerald-300">"Confirm and Send"</strong>!
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
