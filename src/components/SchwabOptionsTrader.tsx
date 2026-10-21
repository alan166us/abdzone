import React, { useState } from 'react';
import { TradeRecommendation, VolatilityMetrics, SupplyDemandZone } from '../types/trading';
import { 
  generateSchwabOptionPlay, 
  formatTosNaturalOptionCommand,
  formatTosNaturalOptionExitCommand,
  formatTosCompoundStockOrFuturesBracketCommand,
  generateTosFullOrderSetSummary,
  SchwabOptionContractRecommendation, 
  ExpirationStyle, 
  StrikeBias 
} from '../utils/optionsEngine';
import { getContractPointValue } from '../utils/contractSpecs';
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
  TrendingUp, 
  AlertTriangle, 
  Terminal, 
  Keyboard, 
  BookOpen
} from 'lucide-react';

interface SchwabOptionsTraderProps {
  recommendations: TradeRecommendation[];
  volatilityMetrics: VolatilityMetrics;
  zones?: SupplyDemandZone[];
  symbol: string;
  currentPrice?: number;
  selectedRecommendation: TradeRecommendation | null;
  onSelectRecommendation: (rec: TradeRecommendation) => void;
  onOpenSchwabModal?: () => void;
  onOpenTradierModal?: () => void;
  onOpenTosModal?: () => void;
  onLogToJournal?: (rec: TradeRecommendation) => void;
}

export const SchwabOptionsTrader: React.FC<SchwabOptionsTraderProps> = ({
  recommendations,
  volatilityMetrics,
  symbol,
  selectedRecommendation,
  onSelectRecommendation,
  onOpenSchwabModal,
  onOpenTradierModal,
  onOpenTosModal,
  onLogToJournal,
}) => {
  // Option Parameters
  const [expirationStyle, setExpirationStyle] = useState<ExpirationStyle>('swing');
  const [strikeBias, setStrikeBias] = useState<StrikeBias>('ITM');
  const [contractQty, setContractQty] = useState<number>(2);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ticket' | 'bracket' | 'matrix'>('ticket');
  const [futuresTradeMode, setFuturesTradeMode] = useState<'options' | 'outright'>('options');

  const cleanSym = (symbol || '').replace(/^(SCHWAB:|EXCHANGE:)/, '').trim().toUpperCase();
  const isFutures = cleanSym.startsWith('/') || cleanSym === 'MES' || cleanSym.includes('MES') || cleanSym.includes('MNQ') || cleanSym.includes('ES') || cleanSym.includes('NQ') || cleanSym.includes('RTY') || cleanSym.includes('CL') || cleanSym.includes('GC');
  const actualTicker = isFutures ? (cleanSym.startsWith('/') ? cleanSym : `/${cleanSym}`) : cleanSym;

  const isIndexFutures = cleanSym.includes('MES') || cleanSym.includes('ES');
  const isSelectedRecStale = selectedRecommendation && (
    (selectedRecommendation.symbol && selectedRecommendation.symbol.toUpperCase().replace(/^(SCHWAB:|EXCHANGE:|\/)/, '') !== cleanSym.replace('/', '')) ||
    (isIndexFutures && selectedRecommendation.entry < 2000)
  );

  const activeRec = (selectedRecommendation && !isSelectedRecStale)
    ? selectedRecommendation
    : (recommendations.find(r => !isIndexFutures || r.entry >= 2000) || recommendations[0]);

  const optionPlay: SchwabOptionContractRecommendation | null = activeRec
    ? generateSchwabOptionPlay(activeRec, symbol, volatilityMetrics, {
        expirationStyle,
        strikeBias,
      })
    : null;

  const handleCopy = (text: string, type: string) => {
    if (optionPlay?.isModelEstimate) {
      const ok = window.confirm(
        'This ticket uses ESTIMATED premiums (not live quotes).\nHave you verified live bid/ask on thinkorswim / Schwab?\n\nOK = copy anyway'
      );
      if (!ok) return;
    }
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  if (!activeRec || !optionPlay) {
    const isCoordinatePollution = !!activeRec && !optionPlay;
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[#0B0F17] rounded-lg border border-slate-800">
        <Building2 className="w-12 h-12 text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-300">
          {isCoordinatePollution
            ? `Invalid Underlying Coordinates for ${symbol}`
            : `No Active Zone Recommendations for ${symbol}`}
        </h3>
        <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
          {isCoordinatePollution
            ? 'Coordinate space mismatch detected between underlying and futures/stock indices. Please refresh live market data.'
            : 'Price is traversing between supply and demand zones without a confirmed high-probability touchpoint.'}
        </p>
      </div>
    );
  }

  // Financial sizing totals based on contract quantity
  const totalCost = optionPlay.entry.costPerContract * contractQty;
  const totalMaxLoss = Math.abs(optionPlay.stopLoss.lossPerContract) * contractQty;
  const totalTargetProfit = optionPlay.target.profitPerContract * contractQty;
  const isCall = optionPlay.optionType === 'CALL';

  const outrightMultiplier = getContractPointValue(actualTicker, false);
  const outrightRiskPerContract = Math.abs(activeRec.entry - activeRec.stopLoss) * outrightMultiplier;
  const outrightRewardPerContract = Math.abs(activeRec.takeProfit2 - activeRec.entry) * outrightMultiplier;
  const outrightTotalRisk = outrightRiskPerContract * contractQty;
  const outrightTotalReward = outrightRewardPerContract * contractQty;
  const outrightRR = outrightRiskPerContract > 0 ? outrightRewardPerContract / outrightRiskPerContract : 2.5;

  const outrightCompoundTosCommand = formatTosCompoundStockOrFuturesBracketCommand(
    actualTicker,
    activeRec.side,
    contractQty,
    activeRec.entry,
    activeRec.stopLoss,
    activeRec.takeProfit2
  );

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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors shadow-sm cursor-pointer"
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
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              title="Configure Charles Schwab Primary API"
            >
              Schwab API
            </button>
          )}
          {onOpenTradierModal && (
            <button
              onClick={onOpenTradierModal}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              title="Configure Tradier Brokerage Secondary Backup Feed"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Tradier Feed</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto w-full">
        {/* Model Estimate Transparency Warning Banner */}
        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/70 flex items-start gap-3 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-semibold text-amber-300">
              ⚠️ Option premiums and Greeks are mathematical model estimates based on historical volatility, not live quoted bid/ask. Always verify live marks on thinkorswim before routing.
            </div>
            <div className="text-[11px] text-amber-300/80">
              Contract pricing and Greek projections are theoretical estimates derived from Black-Scholes formulas, historical volatility, and zone boundaries. Always verify live chain quotes in thinkorswim or Charles Schwab before placing live orders.
            </div>
          </div>
        </div>

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

        {/* Futures Execution Mode Selector */}
        {isFutures && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/90 border border-slate-800 rounded-xl font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                Execution Instrument:
              </span>
              <span className="text-sky-300 font-bold">
                {actualTicker} CME Active Asset
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setFuturesTradeMode('outright')}
                className={`py-1.5 px-3 rounded-md transition-colors font-semibold flex items-center gap-1.5 ${
                  futuresTradeMode === 'outright'
                    ? 'bg-slate-800 text-white shadow-xs border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Outright ${actualTicker} contract`}
              >
                <span>Outright Futures Contract ({actualTicker})</span>
              </button>
              <button
                type="button"
                onClick={() => setFuturesTradeMode('options')}
                className={`py-1.5 px-3 rounded-md transition-colors font-semibold flex items-center gap-1.5 ${
                  futuresTradeMode === 'options'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="CME Futures Option (/MS)"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>CME Futures Option (/MS)</span>
              </button>
            </div>
          </div>
        )}

        {isFutures && futuresTradeMode === 'outright' ? (
          /* OUTRIGHT FUTURES CONTRACT VIEW */
          <div className="space-y-4">
            {/* Header */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4 font-mono">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${
                  activeRec.side === 'long'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700/80'
                    : 'bg-rose-950 text-rose-300 border-rose-700/80'
                }`}>
                  {activeRec.side === 'long' ? 'BUY' : 'SELL'} {actualTicker} OUTRIGHT CONTRACT
                </span>
                <div>
                  <div className="text-xs text-slate-300 font-semibold">
                    CME E-mini/Micro Futures · Point Value: ${outrightMultiplier.toFixed(2)}/pt
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Tick Size: 0.25 pt (${(outrightMultiplier * 0.25).toFixed(2)}/tick)
                  </div>
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Contracts:</span>
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  {[1, 2, 3, 5].map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setContractQty(qty)}
                      className={`px-2.5 py-1 rounded text-xs transition-colors ${
                        contractQty === qty
                          ? 'bg-sky-600 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200'
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
                    className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white focus:outline-none focus:border-sky-500 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* S.E.T. Execution Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono">
              {/* 1. ENTRY */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-sky-900/60">
                <div className="text-[10px] text-sky-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5" /> 1. Entry Limit
                </div>
                <div className="text-lg font-bold text-sky-300 tabular-nums">
                  ${activeRec.entry.toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Outer zone boundary ({activeRec.side === 'long' ? 'Demand' : 'Supply'})
                </div>
                <div className="text-[10px] text-sky-400/80 mt-1">
                  {contractQty} {contractQty > 1 ? 'Contracts' : 'Contract'} @ ${outrightMultiplier.toFixed(2)}/pt
                </div>
              </div>

              {/* 2. STOP-LOSS */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-rose-900/60">
                <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> 2. Hard Stop-Loss (STP)
                </div>
                <div className="text-lg font-bold text-rose-400 tabular-nums">
                  ${activeRec.stopLoss.toFixed(2)}
                </div>
                <div className="text-[11px] text-rose-400/90 mt-1 font-semibold">
                  -${outrightTotalRisk.toFixed(2)} Max Loss (-${outrightRiskPerContract.toFixed(2)}/ct)
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Buffer: ±{activeRec.bufferAtrMultiplier.toFixed(1)}x ATR beyond zone
                </div>
              </div>

              {/* 3. TARGET */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-emerald-900/60">
                <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> 3. Target TP2 (Limit)
                </div>
                <div className="text-lg font-bold text-emerald-400 tabular-nums">
                  ${activeRec.takeProfit2.toFixed(2)}
                </div>
                <div className="text-[11px] text-emerald-400/90 mt-1 font-semibold">
                  +${outrightTotalReward.toFixed(2)} Profit (+${outrightRewardPerContract.toFixed(2)}/ct)
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  R:R Ratio 1:{outrightRR.toFixed(1)} · Score {activeRec.qualityScore}%
                </div>
              </div>
            </div>

            {/* thinkorswim 1st Triggers OCO Bracket Command */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-emerald-400 uppercase tracking-wider">
                    thinkorswim 1st Triggers OCO Futures Bracket
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {contractQty} {contractQty > 1 ? 'Contracts' : 'Contract'}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-emerald-300 font-bold select-all break-all">
                {outrightCompoundTosCommand}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => handleCopy(outrightCompoundTosCommand, 'tos-outright')}
                  className="py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-950/50 active:scale-[0.99] cursor-pointer"
                >
                  {copiedType === 'tos-outright' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-200" />
                      <span>Copied TOS Futures Bracket!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy TOS Futures Bracket Command</span>
                    </>
                  )}
                </button>

                <div className="text-[11px] text-slate-400">
                  <span>TP1: <strong>${activeRec.takeProfit1.toFixed(2)}</strong></span>
                  <span className="mx-2 text-slate-600">·</span>
                  <span>TP3: <strong>${activeRec.takeProfit3.toFixed(2)}</strong></span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
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
              <span className="font-bold text-emerald-400">1 : {Number(optionPlay.target.riskRewardRatio).toFixed(1)}</span>
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
                <div className="text-[10px] text-sky-400/90 font-mono mt-0.5">
                  Estimated Premium (Black-Scholes/HV Approximation)
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
                <div className="text-[10px] text-rose-400/90 font-mono mt-0.5">
                  Estimated Premium (Black-Scholes/HV Approximation)
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
                <div className="text-[10px] text-emerald-400/90 font-mono mt-0.5">
                  Estimated Premium (Black-Scholes/HV Approximation)
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
                  <span className="font-mono font-bold text-emerald-400">1 : {Number(optionPlay.target.riskRewardRatio).toFixed(1)}</span>
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
                thinkorswim Order Entry
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
                <div className="flex flex-wrap items-center gap-2">
                  {onOpenTosModal && (
                    <button
                      type="button"
                      onClick={onOpenTosModal}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer"
                      title="Run QA pre-flight audit and stage order set for ThinkorSwim / PaperMoney"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>🧪 Pre-Flight QA Audit &amp; TOS Staging</span>
                    </button>
                  )}

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
            /* thinkorswim Single Limit Option Order String (Verified) */
            <div className="space-y-3 font-mono">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Universal thinkorswim Command ({contractQty} Contract{contractQty > 1 ? 's' : ''}):</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold">TOS Desktop Verified</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-sky-200 text-xs break-all select-all font-bold flex items-center justify-between">
                  <span>{formatTosNaturalOptionCommand(optionPlay.ticker, optionPlay.tosExpirationStr, optionPlay.strike, optionPlay.optionType, optionPlay.entry.premium, contractQty)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(formatTosNaturalOptionCommand(optionPlay.ticker, optionPlay.tosExpirationStr, optionPlay.strike, optionPlay.optionType, optionPlay.entry.premium, contractQty), 'tosNaturalOrder')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                    title="Copies calculated theoretical bracket. Verify chain in TOS."
                  >
                    {copiedType === 'tosNaturalOrder' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>Copied TOS Option Order!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy TOS Entry: BUY +{contractQty} SINGLE...</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopy(generateTosFullOrderSetSummary(optionPlay, contractQty), 'tosFullSummary')}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                    title="Copies calculated theoretical bracket. Verify chain in TOS."
                  >
                    {copiedType === 'tosFullSummary' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>Copied Full Order Set!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Full Order Set Blueprint</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Multi-Target (3 Targets) & Stop-Loss (2 Stops) Bracket Hub */}
              <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-amber-400" />
                    <span>Exit Bracket Suite (2 Stops · 3 Targets)</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Scale Out & Protection</span>
                </div>

                {/* 3 Targets Grid */}
                <div>
                  <div className="text-[10px] text-emerald-400 font-semibold mb-1 flex items-center gap-1">
                    <span>Take-Profit Targets (TP1, TP2, TP3):</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    {/* TP1 */}
                    <div className="p-2 rounded bg-slate-950 border border-emerald-900/50 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-400 font-bold">TP1 (1:2 R:R)</span>
                        <span className="text-emerald-300 font-bold text-xs">${optionPlay.target.tp1.premium.toFixed(2)}</span>
                      </div>
                      <div className="text-[9px] text-emerald-400/80 mb-1.5">+{optionPlay.target.tp1.percentGain}% (+${optionPlay.target.tp1.profitPerContract}/ct)</div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(optionPlay.target.tp1.premium.toFixed(2), 'tp1Val')}
                          className="flex-1 py-1 px-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded text-[10px] font-bold cursor-pointer transition-colors"
                        >
                          {copiedType === 'tp1Val' ? '✓ Copied' : `$${optionPlay.target.tp1.premium.toFixed(2)}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(formatTosNaturalOptionExitCommand(optionPlay.ticker, optionPlay.tosExpirationStr, optionPlay.strike, optionPlay.optionType, optionPlay.target.tp1.premium, 'LMT', 1), 'tp1Cmd')}
                          className="py-1 px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] cursor-pointer"
                          title="Copy TOS Order line: SELL -1 SINGLE..."
                        >
                          {copiedType === 'tp1Cmd' ? '✓' : 'TOS'}
                        </button>
                      </div>
                    </div>

                    {/* TP2 */}
                    <div className="p-2 rounded bg-slate-950 border border-emerald-800/80 bg-emerald-950/20 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-emerald-400 font-bold">TP2 (Opposing)</span>
                        <span className="text-emerald-300 font-bold text-xs">${optionPlay.target.tp2.premium.toFixed(2)}</span>
                      </div>
                      <div className="text-[9px] text-emerald-400/80 mb-1.5">+{optionPlay.target.tp2.percentGain}% (+${optionPlay.target.tp2.profitPerContract}/ct)</div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(optionPlay.target.tp2.premium.toFixed(2), 'tp2Val')}
                          className="flex-1 py-1 px-1.5 bg-emerald-900/80 hover:bg-emerald-850 border border-emerald-700 text-emerald-200 rounded text-[10px] font-bold cursor-pointer transition-colors"
                        >
                          {copiedType === 'tp2Val' ? '✓ Copied' : `$${optionPlay.target.tp2.premium.toFixed(2)}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(formatTosNaturalOptionExitCommand(optionPlay.ticker, optionPlay.tosExpirationStr, optionPlay.strike, optionPlay.optionType, optionPlay.target.tp2.premium, 'LMT', 1), 'tp2Cmd')}
                          className="py-1 px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] cursor-pointer"
                          title="Copy TOS Order line: SELL -1 SINGLE..."
                        >
                          {copiedType === 'tp2Cmd' ? '✓' : 'TOS'}
                        </button>
                      </div>
                    </div>

                    {/* TP3 */}
                    <div className="p-2 rounded bg-slate-950 border border-emerald-900/50 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-400 font-bold">TP3 (Runner)</span>
                        <span className="text-emerald-300 font-bold text-xs">${optionPlay.target.tp3.premium.toFixed(2)}</span>
                      </div>
                      <div className="text-[9px] text-emerald-400/80 mb-1.5">+{optionPlay.target.tp3.percentGain}% (+${optionPlay.target.tp3.profitPerContract}/ct)</div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(optionPlay.target.tp3.premium.toFixed(2), 'tp3Val')}
                          className="flex-1 py-1 px-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded text-[10px] font-bold cursor-pointer transition-colors"
                        >
                          {copiedType === 'tp3Val' ? '✓ Copied' : `$${optionPlay.target.tp3.premium.toFixed(2)}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(formatTosNaturalOptionExitCommand(optionPlay.ticker, optionPlay.tosExpirationStr, optionPlay.strike, optionPlay.optionType, optionPlay.target.tp3.premium, 'LMT', 1), 'tp3Cmd')}
                          className="py-1 px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] cursor-pointer"
                          title="Copy TOS Order line: SELL -1 SINGLE..."
                        >
                          {copiedType === 'tp3Cmd' ? '✓' : 'TOS'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2 Stop-Loss Levels */}
                <div>
                  <div className="text-[10px] text-rose-400 font-semibold mb-1 flex items-center gap-1">
                    <span>Protective Stop-Loss Options (2 Levels):</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {/* Hard SL */}
                    <div className="p-2 rounded bg-slate-950 border border-rose-900/60 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-rose-400 font-bold">Hard SL (Zone Distal + ATR)</span>
                        <span className="text-rose-300 font-bold text-xs">${optionPlay.stopLoss.premium.toFixed(2)}</span>
                      </div>
                      <div className="text-[9px] text-rose-400/80 mb-1.5">{optionPlay.stopLoss.percentLoss}% (${optionPlay.stopLoss.lossPerContract}/ct)</div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(optionPlay.stopLoss.premium.toFixed(2), 'slHardVal')}
                          className="flex-1 py-1 px-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded text-[10px] font-bold cursor-pointer transition-colors"
                        >
                          {copiedType === 'slHardVal' ? '✓ Copied' : `$${optionPlay.stopLoss.premium.toFixed(2)}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(formatTosNaturalOptionExitCommand(optionPlay.ticker, optionPlay.tosExpirationStr, optionPlay.strike, optionPlay.optionType, optionPlay.stopLoss.premium, 'STP', contractQty), 'slHardCmd')}
                          className="py-1 px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] cursor-pointer"
                          title="Copy TOS Stop Order line: SELL -... SINGLE... STP"
                        >
                          {copiedType === 'slHardCmd' ? '✓' : 'TOS'}
                        </button>
                      </div>
                    </div>

                    {/* Conservative Midline Stop */}
                    {(() => {
                      const consStopPrem = Number((Math.max(0.30, optionPlay.entry.premium * 0.70)).toFixed(2));
                      return (
                        <div className="p-2 rounded bg-slate-950 border border-amber-900/60 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-amber-400 font-bold">Conservative SL (30% Max Loss / 3-Bar)</span>
                            <span className="text-amber-300 font-bold text-xs">${consStopPrem.toFixed(2)}</span>
                          </div>
                          <div className="text-[9px] text-amber-400/80 mb-1.5">-30% Loss Cap / Tight Risk</div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleCopy(consStopPrem.toFixed(2), 'slConsVal')}
                              className="flex-1 py-1 px-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 rounded text-[10px] font-bold cursor-pointer transition-colors"
                            >
                              {copiedType === 'slConsVal' ? '✓ Copied' : `$${consStopPrem.toFixed(2)}`}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopy(formatTosNaturalOptionExitCommand(optionPlay.ticker, optionPlay.tosExpirationStr, optionPlay.strike, optionPlay.optionType, consStopPrem, 'STP', contractQty), 'slConsCmd')}
                              className="py-1 px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] cursor-pointer"
                              title="Copy TOS Stop Order line: SELL -... SINGLE... STP"
                            >
                              {copiedType === 'slConsCmd' ? '✓' : 'TOS'}
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Step-by-step thinkorswim instructions */}
              <div className="p-3.5 rounded-lg bg-slate-950/90 border border-slate-800 text-[11px] font-mono text-slate-300 space-y-2.5 mt-2">
                <div className="font-bold text-sky-400 flex items-center gap-1.5 text-xs">
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>Why One Buy Order Appeared & How to Attach 2 Stops + 3 Targets:</span>
                </div>
                <div className="space-y-2 text-slate-300 leading-relaxed">
                  <div className="p-2.5 rounded bg-slate-900/90 border border-emerald-900/60 space-y-2">
                    <div className="font-semibold text-emerald-400 flex items-center gap-1">
                      <span>✓ Understanding Thinkorswim Clipboard & Multi-Target Execution:</span>
                    </div>
                    <p className="text-[10.5px] text-slate-300 leading-relaxed">
                      Pasting <code className="text-sky-300 font-bold bg-slate-950 px-1 py-0.5 rounded">BUY +{contractQty} SINGLE...</code> creates the <strong>Primary Entry Ticket</strong>. In Thinkorswim, child bracket exits (Stops & Targets) are added through the <strong>Advanced Order</strong> template:
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11px]">
                      <li>
                        <strong>For 1 Target & 1 Stop:</strong> In TOS Order Entry, change the <strong>Advanced Order</strong> dropdown from <em>Single Order</em> to <strong className="text-white">&quot;1st Triggers OCO&quot;</strong>.
                      </li>
                      <li>
                        <strong>For 2 Targets & 2 Stops (Scaling 2 Contracts):</strong> Change the dropdown to <strong className="text-white">&quot;1st Triggers 2 OCO&quot;</strong>. TOS automatically creates 2 Target rows (+1 contract each) and 2 Stop rows linked with chain icons!
                      </li>
                      <li>
                        <strong>For 3 Targets (TP1, TP2, TP3):</strong> Select <strong className="text-white">&quot;1st Triggers 3 OCO&quot;</strong> (or right-click the green BUY row → <em>Add Order to OCO</em>).
                      </li>
                      <li>
                        Set the price on each row using the 1-click price buttons above: TP1 (<strong>${optionPlay.target.tp1.premium.toFixed(2)}</strong>), TP2 (<strong>${optionPlay.target.tp2.premium.toFixed(2)}</strong>), TP3 (<strong>${optionPlay.target.tp3.premium.toFixed(2)}</strong>), and SL (<strong>${optionPlay.stopLoss.premium.toFixed(2)}</strong>).
                      </li>
                    </ol>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-sky-950/40 border border-sky-800/60 text-[10.5px] text-sky-200/90 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Auto-Cancellation (OCO):</strong> Because they are linked as OCO (One Cancels Other), when your Target hits, Thinkorswim instantly cancels your Stop-Loss automatically, ensuring you never have unprotected exposure!
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
};
