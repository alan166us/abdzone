import React, { useState } from 'react';
import { TradeRecommendation, VolatilityMetrics } from '../types/trading';
import { 
  generateSchwabOptionPlay, 
  SchwabOptionContractRecommendation,
  formatTosOptionCommand,
  formatTosNaturalOptionCommand,
  formatTosStockOrFuturesCommand,
  formatSchwabStockSummary,
  getContractPointValue,
  formatTosCompoundOptionBracketCommand,
  formatTosCompoundStockOrFuturesBracketCommand
} from '../utils/optionsEngine';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  ShieldCheck, 
  Target, 
  Crosshair, 
  Copy, 
  Check, 
  Building2,
  ExternalLink,
  Terminal,
  BookOpen,
  Calculator,
  RotateCcw,
  Scale,
  Percent,
  Sliders,
  Flame,
  ChevronDown,
  ChevronUp,
  DollarSign,
  AlertTriangle,
  Sparkles
} from 'lucide-react';

export interface CustomTradeParams {
  entry: number;
  stopLoss: number;
  target: number;
  targetMode: 'tp1' | 'tp2' | 'tp3' | 'custom';
  riskBudget: number;
}

interface TradeRecommendationPanelProps {
  recommendations: TradeRecommendation[];
  volatilityMetrics: VolatilityMetrics;
  selectedRecommendation: TradeRecommendation | null;
  onSelectRecommendation: (rec: TradeRecommendation) => void;
  onSimulateOrder: (rec: TradeRecommendation) => void;
  ticker?: string;
  onOpenOptionsTab?: () => void;
  onOpenTosModal?: (rec: TradeRecommendation) => void;
  onLogToJournal?: (rec: TradeRecommendation) => void;
  onOpenAiChat?: (initialMessage?: string, role?: 'daily_coach' | 'quant' | 'risk_architect' | 'fast_scalp') => void;
}

export const TradeRecommendationPanel: React.FC<TradeRecommendationPanelProps> = ({
  recommendations,
  volatilityMetrics,
  selectedRecommendation,
  onSelectRecommendation,
  onSimulateOrder,
  ticker = 'SPY',
  onOpenOptionsTab,
  onOpenTosModal,
  onLogToJournal,
  onOpenAiChat,
}) => {
  const isFutures = Boolean(
    ticker.toUpperCase().includes('MES') ||
    ticker.toUpperCase().includes('ES') ||
    ticker.toUpperCase().includes('NQ') ||
    ticker.toUpperCase().includes('MNQ') ||
    ticker.toUpperCase().includes('RTY') ||
    ticker.toUpperCase().includes('CL') ||
    ticker.toUpperCase().includes('GC')
  );

  const [viewMode, setViewMode] = useState<'options' | 'shares'>(() => isFutures ? 'shares' : 'options');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  React.useEffect(() => {
    if (isFutures) {
      setViewMode('shares');
    }
  }, [isFutures, ticker]);

  // Dynamic R:R Calculator State (custom adjustments per trade recommendation)
  const [customParamsMap, setCustomParamsMap] = useState<Record<string, CustomTradeParams>>({});
  const [expandedCalcMap, setExpandedCalcMap] = useState<Record<string, boolean>>({});
  const [expandedStoryMap, setExpandedStoryMap] = useState<Record<string, boolean>>({});

  const toggleStory = (recId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedStoryMap((prev) => ({
      ...prev,
      [recId]: !prev[recId],
    }));
  };

  const handleCopyOrder = (text: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getTradeParams = (rec: TradeRecommendation): CustomTradeParams => {
    return (
      customParamsMap[rec.id] || {
        entry: rec.entry,
        stopLoss: rec.stopLoss,
        target: rec.takeProfit2,
        targetMode: 'tp2',
        riskBudget: 250,
      }
    );
  };

  const updateTradeParams = (
    recId: string,
    updates: Partial<CustomTradeParams>,
    defaultRec: TradeRecommendation
  ) => {
    setCustomParamsMap((prev) => {
      const current = prev[recId] || {
        entry: defaultRec.entry,
        stopLoss: defaultRec.stopLoss,
        target: defaultRec.takeProfit2,
        targetMode: 'tp2',
        riskBudget: 250,
      };
      return {
        ...prev,
        [recId]: { ...current, ...updates },
      };
    });
  };

  const resetTradeParams = (recId: string) => {
    setCustomParamsMap((prev) => {
      const next = { ...prev };
      delete next[recId];
      return next;
    });
  };

  const toggleCalc = (recId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCalcMap((prev) => ({
      ...prev,
      [recId]: !prev[recId],
    }));
  };

  // Automated Real-time Dynamic R:R Math Engine
  const computeMetrics = (rec: TradeRecommendation, params: CustomTradeParams) => {
    const isLong = rec.side === 'long';
    const entry = params.entry;
    const rawRisk = isLong ? (params.entry - params.stopLoss) : (params.stopLoss - params.entry);
    const risk = Math.max(0.25, rawRisk);
    const reward = isLong ? Math.max(0, params.target - params.entry) : Math.max(0, params.entry - params.target);

    const cleanSym = (ticker || '').toUpperCase();
    const isMesContract = cleanSym.includes('MES');
    const isEsContract = !isMesContract && (cleanSym.includes('/ES') || cleanSym === 'ES');
    const isMnqContract = cleanSym.includes('MNQ');
    const isNqContract = !isMnqContract && (cleanSym.includes('/NQ') || cleanSym === 'NQ');
    const isFuturesContract = isMesContract || isEsContract || isMnqContract || isNqContract || cleanSym.startsWith('/') || cleanSym.includes('RTY') || cleanSym.includes('CL') || cleanSym.includes('GC');

    const pointValue = isFuturesContract ? getContractPointValue(cleanSym) : 1.0;
    const commission = isFuturesContract ? 5.0 : 0.0; // round-turn commission
    const netRiskDollars = (risk * pointValue) + commission;
    const netRewardDollars = Math.max(0, (reward * pointValue) - commission);
    const netRR = netRiskDollars > 0 ? Number((netRewardDollars / netRiskDollars).toFixed(2)) : 0;

    const rrRatio = netRR > 0 ? netRR : (risk > 0 ? Number((reward / risk).toFixed(2)) : 0);
    const riskPercent = entry > 0 ? (risk / entry) * 100 : 0;
    const rewardPercent = entry > 0 ? (reward / entry) * 100 : 0;
    const beWinRate = rrRatio > 0 ? (1 / (1 + rrRatio)) * 100 : 50;

    const riskPerContractOrShare = isFuturesContract ? netRiskDollars : risk;
    const shares = Math.max(1, Math.floor(params.riskBudget / riskPerContractOrShare));
    const totalRiskDollars = isFuturesContract ? shares * netRiskDollars : shares * risk;
    const totalRewardDollars = isFuturesContract ? shares * netRewardDollars : shares * reward;
    const marginLookup: Record<string, number> = {
      MES: 1600,
      ES: 16000,
      MNQ: 2500,
      NQ: 25000,
      RTY: 2000,
      CL: 6500,
      GC: 9500
    };
    const rootKey = cleanSym.replace('/', '').slice(0, 3);
    const marginPerCt = marginLookup[rootKey] || 1600;
    const capitalRequired = isFuturesContract ? shares * marginPerCt : shares * entry;

    const totalSpan = risk + reward;
    const riskVisualPercent = totalSpan > 0 ? Math.min(80, Math.max(12, (risk / totalSpan) * 100)) : 25;
    const rewardVisualPercent = 100 - riskVisualPercent;

    const quality =
      rrRatio >= 3.0
        ? { label: 'Prime Setup', color: 'text-emerald-400', badge: 'bg-emerald-950/90 text-emerald-300 border-emerald-800' }
        : rrRatio >= 2.0
        ? { label: 'Favorable', color: 'text-sky-400', badge: 'bg-sky-950/90 text-sky-300 border-sky-800' }
        : rrRatio >= 1.5
        ? { label: 'Acceptable', color: 'text-indigo-400', badge: 'bg-indigo-950/90 text-indigo-300 border-indigo-800' }
        : { label: 'Low R:R', color: 'text-amber-400', badge: 'bg-amber-950/90 text-amber-300 border-amber-800' };

    return {
      risk,
      reward,
      rrRatio,
      riskPercent,
      rewardPercent,
      beWinRate,
      shares,
      totalRiskDollars,
      totalRewardDollars,
      capitalRequired,
      riskVisualPercent,
      rewardVisualPercent,
      quality,
    };
  };

  const computeOptionMetrics = (
    optionPlay: SchwabOptionContractRecommendation,
    params: CustomTradeParams
  ) => {
    const entryPrem = optionPlay.entry.premium;
    const stopPrem = optionPlay.stopLoss.premium;

    let targetPrem = optionPlay.target.tp2.premium;
    if (params.targetMode === 'tp1') {
      targetPrem = optionPlay.target.tp1.premium;
    } else if (params.targetMode === 'tp3') {
      targetPrem = optionPlay.target.tp3.premium;
    } else if (params.targetMode === 'custom') {
      const deltaMove = Math.abs(params.target - params.entry);
      const gain = deltaMove * Math.abs(optionPlay.delta);
      targetPrem = Number((entryPrem + gain).toFixed(2));
    }

    const cleanSym = (optionPlay.ticker || ticker || '').toUpperCase();
    const multiplier = getContractPointValue(cleanSym);
    const riskPerContract = Math.max(1, (entryPrem - stopPrem) * multiplier);
    const rewardPerContract = Math.max(0, (targetPrem - entryPrem) * multiplier);
    const optionRR = riskPerContract > 0 ? rewardPerContract / riskPerContract : 0;
    const contracts = Math.max(1, Math.floor(params.riskBudget / riskPerContract));
    const totalOptionRisk = contracts * riskPerContract;
    const totalOptionReward = contracts * rewardPerContract;
    // Calculate cost strictly via getContractPointValue: (Premium * Multiplier * Contracts)
    const totalOptionCost = Number((entryPrem * multiplier * contracts).toFixed(2));

    return {
      entryPrem,
      stopPrem,
      targetPrem,
      riskPerContract,
      rewardPerContract,
      optionRR,
      contracts,
      totalOptionRisk,
      totalOptionReward,
      totalOptionCost,
      multiplier,
    };
  };

  const getEffectiveRec = (rec: TradeRecommendation): TradeRecommendation => {
    const params = getTradeParams(rec);
    const metrics = computeMetrics(rec, params);
    return {
      ...rec,
      entry: params.entry,
      stopLoss: params.stopLoss,
      takeProfit2: params.target,
      riskPerUnit: metrics.risk,
      riskRewardRatio: metrics.rrRatio,
    };
  };

  if (recommendations.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-xs">
        No active zone setups within proximity of current spot price. Price is currently traversing intermediate range.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Mode Switcher */}
      <div className="flex items-center justify-between p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono">
        <button
          type="button"
          onClick={() => setViewMode('options')}
          className={`flex-1 py-1.5 px-2 rounded transition-colors flex items-center justify-center gap-1.5 font-semibold ${
            viewMode === 'options'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>{isFutures ? 'Futures Options Assist (/MES x5)' : 'Equity Options Assist (x100)'}</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('shares')}
          className={`flex-1 py-1.5 px-2 rounded transition-colors flex items-center justify-center gap-1.5 font-medium ${
            viewMode === 'shares'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>{isFutures ? 'Futures /MES Contract Plan' : 'Stock Shares Plan'}</span>
        </button>
      </div>

      {recommendations.map((rec) => {
        const isLong = rec.side === 'long';
        const isSelected = selectedRecommendation?.id === rec.id;
        const params = getTradeParams(rec);
        const metrics = computeMetrics(rec, params);
        const isExpanded = !!expandedCalcMap[rec.id];
        const effectiveRec = getEffectiveRec(rec);
        const isDormant = rec.proximityPhase?.includes('Dormant') || (rec.distanceInAtr !== undefined && rec.distanceInAtr > 1.5);

        const optionPlay: SchwabOptionContractRecommendation = generateSchwabOptionPlay(
          effectiveRec,
          ticker,
          volatilityMetrics
        );
        const optionMetrics = computeOptionMetrics(optionPlay, params);

        const cleanSym = (ticker || '').toUpperCase();
        const isMesContract = cleanSym.includes('MES');
        const isFuturesContract = isMesContract || cleanSym.startsWith('/') || cleanSym.includes('ES') || cleanSym.includes('NQ');

        // Dynamic Orders matching user's custom calculator sizing and price targets
        const dynamicContractQty = optionMetrics.contracts;

        // 1-leg single entry TOS option command
        const dynamicNaturalTosCommand = formatTosNaturalOptionCommand(
          optionPlay.ticker,
          optionPlay.tosExpirationStr,
          optionPlay.strike,
          optionPlay.optionType,
          optionMetrics.entryPrem,
          dynamicContractQty
        );

        // Full 3-leg compound 1st Triggers OCO bracket TOS option command (Entry / SL / TP)
        const dynamicCompoundTosOptionCommand = formatTosCompoundOptionBracketCommand(
          optionPlay.ticker,
          optionPlay.tosExpirationStr,
          optionPlay.strike,
          optionPlay.optionType,
          optionMetrics.entryPrem,
          optionMetrics.stopPrem,
          optionMetrics.targetPrem,
          dynamicContractQty
        );

        // 1-leg single entry Stock/Futures command
        const dynamicStockTosCommand = formatTosStockOrFuturesCommand(
          ticker,
          rec.side,
          metrics.shares,
          params.entry
        );

        // Full 3-leg compound 1st Triggers OCO bracket Stock/Futures command
        // For /MES: BUY +1 /MES LMT [entryPrice] DAY / SELL +1 /MES STP [stopPrice] GTC / SELL +1 /MES LMT [targetPrice] GTC
        const dynamicCompoundStockOrFuturesCommand = formatTosCompoundStockOrFuturesBracketCommand(
          ticker,
          rec.side,
          metrics.shares,
          params.entry,
          params.stopLoss,
          params.target
        );

        const dynamicStockSchwabSummary = formatSchwabStockSummary(
          ticker,
          rec.side,
          metrics.shares,
          params.entry,
          params.stopLoss,
          params.target,
          metrics.rrRatio
        );

        return (
          <div
            key={rec.id}
            onClick={() => onSelectRecommendation(effectiveRec)}
            className={`p-3.5 rounded-lg border transition-all cursor-pointer relative overflow-hidden ${
              isSelected
                ? 'bg-slate-900 border-sky-500/80 shadow-lg shadow-sky-950/20'
                : 'bg-[#0F172A]/70 border-slate-800 hover:border-slate-700'
            }`}
          >
            {/* Header: Side & Zone Pattern */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className={`flex items-center gap-1 font-display font-bold text-xs uppercase tracking-wide ${
                    isLong ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {viewMode === 'options' 
                    ? `BUY ${optionPlay.optionType}`
                    : (isLong ? 'BUY LIMIT' : 'SELL LIMIT')} · {rec.pattern}
                </span>
                <span className="text-[11px] text-slate-400">
                  {isLong ? 'Demand Reversal' : 'Supply Reversal'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span className={`px-2 py-0.5 rounded font-bold border ${metrics.quality.badge}`}>
                  R:R 1:{viewMode === 'options' ? optionMetrics.optionRR.toFixed(1) : metrics.rrRatio.toFixed(1)}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-emerald-400 font-semibold">{rec.qualityScore}% Score</span>
              </div>
            </div>

            {/* Proximity Phase & Execution Reaction Window Banner */}
            {rec.proximityPhase && (
              <div className={`mb-2.5 px-2.5 py-1.5 rounded text-[11px] font-mono flex items-center justify-between border ${
                rec.proximityPhase.includes('Phase B')
                  ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-300 shadow-sm shadow-emerald-950'
                  : rec.proximityPhase.includes('Phase A')
                  ? 'bg-amber-950/60 border-amber-500/80 text-amber-300'
                  : 'bg-slate-950/70 border-slate-800 text-slate-400'
              }`}>
                <div className="flex items-center gap-2 font-bold">
                  <span className={`w-2 h-2 rounded-full ${
                    rec.proximityPhase.includes('Phase B') ? 'bg-emerald-400 animate-ping' :
                    rec.proximityPhase.includes('Phase A') ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'
                  }`} />
                  <span>{rec.proximityPhase}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {rec.distanceInAtr !== undefined && (
                    <span className="font-semibold">{rec.distanceInAtr.toFixed(1)}x ATR away</span>
                  )}
                  {rec.proximityPhase.includes('Phase A') && (
                    <span className="text-amber-400 bg-amber-950/90 px-1 py-0.5 rounded border border-amber-800/80 font-bold">
                      Arm DOM / 5–15m
                    </span>
                  )}
                  {rec.proximityPhase.includes('Phase B') && (
                    <span className="text-emerald-300 bg-emerald-900/90 px-1 py-0.5 rounded border border-emerald-700/80 font-bold">
                      Active Touch / 1–2m
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Institutional VWAP Value Alignment Banner */}
            {rec.vwapConfluence && rec.vwapConfluence.scoreBonus > 0 && (
              <div className="mb-2.5 px-2.5 py-1.5 rounded text-[11px] font-mono flex items-center justify-between border bg-amber-950/40 border-amber-500/70 text-amber-300">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>⚡ Institutional VWAP: {rec.vwapConfluence.tag}</span>
                </div>
                <span className="text-[10px] font-semibold text-amber-300 bg-amber-900/60 px-1.5 py-0.5 rounded border border-amber-700/60">
                  +{rec.vwapConfluence.scoreBonus}% Value Edge
                </span>
              </div>
            )}

            {/* S.T.E.P. Execution Reality Check: Spot in No-Man's Land */}
            {isDormant && (
              <div className="mb-2.5 px-3 py-2 rounded bg-amber-950/40 border border-amber-600/70 text-xs font-mono space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>S.T.E.P. Reality Check: Spot in "No Man's Land" ({rec.distanceInAtr?.toFixed(1)}x ATR away)</span>
                </div>
                <p className="text-[11px] text-amber-200/90 font-sans leading-relaxed">
                  <strong>Do NOT enter now.</strong> Price is sitting far {isLong ? 'above Demand support' : 'below Supply resistance'}. Entering here chases price into potential intraday {isLong ? 'overhead resistance' : 'demand support'}.
                  <br />
                  <strong>Rule of S.T.E.P.:</strong> Keep this setup <strong>STAGED</strong> on radar. Only arm your OCO bracket if price {isLong ? 'pulls back to test the Demand proximal line' : 'rallies back up to test the Supply proximal line'} at <strong>${rec.entry.toFixed(2)}</strong>.
                </p>
              </div>
            )}

            {/* Plain Daily Language: Market Story & The "Why" Bar */}
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-1.5 p-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
              <button
                type="button"
                onClick={(e) => toggleStory(rec.id, e)}
                className={`px-2.5 py-1 rounded text-[11px] font-sans font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  expandedStoryMap[rec.id]
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500/80 shadow-sm'
                    : 'bg-slate-900/90 hover:bg-slate-850 text-emerald-400 hover:text-emerald-300 border-slate-700/80'
                }`}
                title="Explain this trade in everyday language with market background & the 'why'"
              >
                <span>🗣️ Explain in Plain Daily Language (Why & Market Story)</span>
                {expandedStoryMap[rec.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {onOpenAiChat && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAiChat(
                      `Explain this ${rec.side.toUpperCase()} setup on ${ticker} (${rec.pattern}) in plain daily language: what is the market movement story right now, and why are this entry ($${rec.entry.toFixed(2)}), stop-loss ($${rec.stopLoss.toFixed(2)}), and target ($${rec.takeProfit2.toFixed(2)}) chosen?`,
                      'daily_coach'
                    );
                  }}
                  className="px-2.5 py-1 rounded text-[10px] font-mono bg-sky-950/60 hover:bg-sky-900/80 border border-sky-800/80 text-sky-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  title="Ask Gemini Copilot in Chat"
                >
                  <Sparkles className="w-3 h-3 text-sky-400 animate-pulse" />
                  <span>Ask Gemini Copilot</span>
                </button>
              )}
            </div>

            {/* Plain Daily Language Breakdown Card (Expands when clicked) */}
            {expandedStoryMap[rec.id] && (
              <div className="mb-3 p-3.5 rounded-lg bg-gradient-to-br from-emerald-950/40 via-slate-950/70 to-slate-900/60 border border-emerald-600/70 text-slate-200 text-xs font-sans space-y-2.5 shadow-xl animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center justify-between font-bold text-emerald-300 text-xs border-b border-emerald-800/60 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span>🎙️ Plain Daily Talk: {ticker} {rec.side.toUpperCase()} Setup</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/80 text-emerald-300 border border-emerald-700/60">
                    Friendly Coach Mode
                  </span>
                </div>

                {/* 1. Market Movement Story */}
                <div>
                  <h5 className="font-semibold text-sky-300 text-[11px] flex items-center gap-1 mb-0.5">
                    <span>📖 The Market Story (Background):</span>
                  </h5>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {isLong 
                      ? `${ticker} recently pulled back into a high-volume demand zone between $${rec.stopLoss.toFixed(2)} and $${rec.entry.toFixed(2)}. Previously, aggressive institutional buyers stepped in here with huge explosive volume. Price is returning to this floor, giving us a "trampoline" where buyers are waiting to defend their turf.`
                      : `${ticker} recently pushed up into an overhead supply zone between $${rec.entry.toFixed(2)} and $${rec.stopLoss.toFixed(2)}. Sellers previously dumped heavy volume here. Price is returning to this ceiling, where sellers are expected to reject higher prices.`
                    }
                  </p>
                </div>

                {/* 2. The "Why" Behind Entry */}
                <div>
                  <h5 className="font-semibold text-emerald-300 text-[11px] flex items-center gap-1 mb-0.5">
                    <span>🎯 Why Enter at ${rec.entry.toFixed(2)}?</span>
                  </h5>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Rather than chasing the market midway ("no-man\'s land") and risking an immediate pullback, we wait for price to come to our wholesale discount price at <strong>${rec.entry.toFixed(2)}</strong>. This gives you maximum reward while keeping your risk minimal.
                  </p>
                </div>

                {/* 3. The "Why" Behind Stop-Loss */}
                <div>
                  <h5 className="font-semibold text-rose-300 text-[11px] flex items-center gap-1 mb-0.5">
                    <span>🛡️ Why is Stop-Loss at ${rec.stopLoss.toFixed(2)} (Breathing Room)?</span>
                  </h5>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    We gave the trade an extra <strong>{rec.bufferAtrMultiplier.toFixed(1)}x ATR cushion</strong> beyond the zone boundary. 
                    <em>Why?</em> Because market makers love to trigger quick "stop hunts" right past obvious lines. This buffer protects you from normal intraday wiggles and only cuts the trade if the idea is genuinely dead.
                  </p>
                </div>

                {/* 4. The "Why" Behind Targets */}
                <div>
                  <h5 className="font-semibold text-amber-300 text-[11px] flex items-center gap-1 mb-0.5">
                    <span>🏁 Why These Profit Targets ($${rec.takeProfit1.toFixed(2)} / $${rec.takeProfit2.toFixed(2)} / $${rec.takeProfit3.toFixed(2)})?</span>
                  </h5>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    <strong>Target 1 ($${rec.takeProfit1.toFixed(2)}):</strong> Locks in 1:2 risk/reward to make the trade risk-free once hit.
                    <br />
                    <strong>Target 2 ($${rec.takeProfit2.toFixed(2)}):</strong> Sits right before the opposing wall before sellers/buyers can push back.
                    <br />
                    <strong>Target 3 ($${rec.takeProfit3.toFixed(2)}):</strong> A trend runner to capture maximum upside if momentum explodes.
                  </p>
                </div>

                {/* 5. Coach & Partner Cashflow & Limited Risk Rule */}
                <div className="p-2.5 rounded bg-slate-900/90 border border-emerald-500/30">
                  <h5 className="font-semibold text-emerald-400 text-[11px] flex items-center gap-1 mb-1">
                    <span>🤝 Partner Cashflow Rule: Limited Downside, Steady Income</span>
                  </h5>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    <strong>Defined Downside Only:</strong> Whether using defined options contracts or credit spreads, our max loss is 100% mathematically capped before entry (no open-ended risk!).
                    <br />
                    <strong>Daily Cashflow:</strong> Time decay (Theta) pays us daily rent as price stays beyond our floor/ceiling.
                    <br />
                    <strong>The 50% Profit Rule:</strong> When Target 1 hits, take profit on 50% of contracts and slide your stop to breakeven. Bank your daily cashflow and make the rest of the trade completely risk-free!
                  </p>
                </div>

                {onOpenAiChat && (
                  <div className="pt-2 border-t border-emerald-800/40 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-emerald-400/80">Options Trading Coach &amp; Partner Ready</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenAiChat(
                          `Partner, how do we use this ${rec.side.toUpperCase()} setup on ${ticker} to generate daily cashflow with strictly limited downside risk? Walk me through the options strike, Theta decay, and our 50% profit exit rule.`,
                          'daily_coach'
                        );
                      }}
                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                    >
                      <Sparkles className="w-3 h-3 text-emerald-200" />
                      <span>Ask Coach: Plan Daily Cashflow for This Setup →</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {viewMode === 'options' ? (
              /* SCHWAB OPTIONS ASSIST VIEW */
              <div className="space-y-2.5">
                {/* Model Estimate Transparency Warning Banner */}
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-600/70 flex items-start gap-2.5 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-semibold text-amber-300">
                      ⚠️ Option premiums and Greeks are mathematical model estimates based on historical volatility, not live quoted bid/ask. Always verify live marks on thinkorswim before routing.
                    </div>
                  </div>
                </div>

                {/* Contract Badge */}
                <div className="p-2.5 rounded bg-slate-950/80 border border-sky-900/60 flex flex-wrap items-center justify-between gap-2 font-mono">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                      optionPlay.optionType === 'CALL'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}>
                      {optionPlay.ticker} ${optionPlay.strike} {optionPlay.optionType}
                    </span>
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] tracking-wide uppercase border ${
                      optionPlay.instrumentType === 'FUTURES_OPTION'
                        ? 'bg-amber-950/90 text-amber-300 border-amber-600/80 shadow-sm'
                        : 'bg-indigo-950/90 text-indigo-300 border-indigo-600/80 shadow-sm'
                    }`}>
                      {optionPlay.instrumentType === 'FUTURES_OPTION' ? 'Futures Option (x5)' : 'Equity Option (x100)'}
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      Exp: {optionPlay.expirationDisplay} ({optionPlay.daysToExpiration} DTE)
                    </span>
                  </div>

                  <span className="text-[11px] text-sky-400 font-bold">
                    Delta {optionPlay.delta > 0 ? `+${optionPlay.delta}` : optionPlay.delta}
                  </span>
                </div>

                {/* Option Pricing Grid: Entry, Stop-Loss, and Target */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-xs">
                  {/* 1. ENTRY */}
                  <div className="p-2 rounded bg-slate-900/60 border border-sky-900/50">
                    <div className="text-[10px] text-sky-400 font-bold uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1"><Crosshair className="w-3 h-3" /> 1. Entry</span>
                      <span className="text-[8px] text-amber-300/80 uppercase font-mono">Model Est.</span>
                    </div>
                    <div className="font-bold text-sky-300 text-sm tabular-nums">
                      ${optionPlay.entry.premium.toFixed(2)}
                    </div>
                    <div className="text-[8px] text-slate-400 mt-0.5 font-mono">
                      Estimated Premium (Black-Scholes/HV Approximation)
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      ${(optionPlay.entry.premium * optionMetrics.multiplier).toFixed(2)}/contract
                    </div>
                    <div className="text-[10px] text-amber-300 font-semibold mt-0.5">
                      Cost: ${(optionPlay.entry.premium * optionMetrics.multiplier * dynamicContractQty).toFixed(2)}
                      <span className="text-[9px] text-slate-400 font-mono font-normal ml-1">
                        ({dynamicContractQty} ct{dynamicContractQty > 1 ? 's' : ''})
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-500 mt-1 pt-1 border-t border-slate-800">
                      Underlying @ ${params.entry.toFixed(2)}
                    </div>
                  </div>

                  {/* 2. STOP-LOSS */}
                  <div className="p-2 rounded bg-slate-900/60 border border-rose-900/50">
                    <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> 2. Stop-Loss</span>
                      <span className="text-[8px] text-amber-300/80 uppercase font-mono">Model Est.</span>
                    </div>
                    <div className="font-bold text-rose-400 text-sm tabular-nums">
                      ${optionPlay.stopLoss.premium.toFixed(2)}
                    </div>
                    <div className="text-[8px] text-slate-400 mt-0.5 font-mono">
                      Estimated Premium (Black-Scholes/HV Approximation)
                    </div>
                    <div className="text-[10px] text-rose-400/90 mt-0.5 font-semibold">
                      {optionPlay.stopLoss.percentLoss}% Max Loss
                    </div>
                    <div className="text-[9px] text-slate-500 mt-1 pt-1 border-t border-slate-800">
                      Stock @ ${params.stopLoss.toFixed(2)}
                    </div>
                  </div>

                  {/* 3. TARGET */}
                  <div className="p-2 rounded bg-slate-900/60 border border-emerald-900/50">
                    <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1"><Target className="w-3 h-3" /> 3. Target (TP)</span>
                      <span className="text-[8px] text-amber-300/80 uppercase font-mono">Model Est.</span>
                    </div>
                    <div className="font-bold text-emerald-400 text-sm tabular-nums">
                      ${optionMetrics.targetPrem.toFixed(2)}
                    </div>
                    <div className="text-[8px] text-slate-400 mt-0.5 font-mono">
                      Estimated Premium (Black-Scholes/HV Approximation)
                    </div>
                    <div className="text-[10px] text-emerald-400/90 mt-0.5 font-semibold">
                      +{(Math.max(0, ((optionMetrics.targetPrem - optionPlay.entry.premium) / optionPlay.entry.premium) * 100)).toFixed(0)}% Return
                    </div>
                    <div className="text-[9px] text-slate-500 mt-1 pt-1 border-t border-slate-800">
                      Stock @ ${params.target.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Extended Multi-Targets Breakdown */}
                <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono text-slate-400 bg-slate-950/40 p-2 rounded border border-slate-800/60">
                  <div>
                    <span className="text-slate-500">TP1 (1:2 R:R):</span>{' '}
                    <span className="text-emerald-400 font-semibold">${optionPlay.target.tp1.premium.toFixed(2)} (+{optionPlay.target.tp1.percentGain}%)</span>
                  </div>
                  <div>
                    <span className="text-slate-500">TP2 (Zone):</span>{' '}
                    <span className="text-emerald-400 font-semibold">${optionPlay.target.tp2.premium.toFixed(2)} (+{optionPlay.target.tp2.percentGain}%)</span>
                  </div>
                  <div>
                    <span className="text-slate-500">TP3 (Runner):</span>{' '}
                    <span className="text-emerald-400 font-semibold">${optionPlay.target.tp3.premium.toFixed(2)} (+{optionPlay.target.tp3.percentGain}%)</span>
                  </div>
                </div>

                {/* Greeks & IV Regime Info */}
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
                  <span>Theta: ${optionPlay.theta}/day</span>
                  <span>Gamma: +{optionPlay.gamma}</span>
                  <span className="text-slate-300">Underlying Trigger: ${params.entry.toFixed(2)}</span>
                </div>

                {/* 1-Click thinkorswim & Charles Schwab Options Order Template */}
                <div className="space-y-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-semibold text-sky-400 uppercase tracking-wider flex items-center gap-1">
                      <Terminal className="w-3 h-3 text-sky-400" />
                      <span>thinkorswim 1st Triggers OCO Bracket ({dynamicContractQty} Contract{dynamicContractQty > 1 ? 's' : ''})</span>
                    </span>
                    <span className="text-emerald-400 font-medium">Auto-Sized from Risk Budget</span>
                  </div>

                  {/* Primary Universal Natural Language Compound Bracket Order */}
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700/80 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Contract:</span>
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono font-semibold">
                          {optionPlay.ticker} ${optionPlay.strike} {optionPlay.optionType}
                        </span>
                      </div>
                      <span className="text-slate-500 font-mono">1st Triggers OCO</span>
                    </div>

                    <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80 truncate text-sky-200 select-all font-mono font-bold text-xs" title="Complete thinkorswim 1st Triggers OCO Compound Bracket Order (Entry / SL / TP)">
                      {dynamicCompoundTosOptionCommand}
                    </div>

                    {/* Prominent Primary Action Button */}
                    <button
                      type="button"
                      onClick={(e) => handleCopyOrder(dynamicCompoundTosOptionCommand, `compound-${optionPlay.id}`, e)}
                      className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs flex items-center justify-center gap-2 transition-all font-semibold cursor-pointer shadow-md shadow-sky-950/50 hover:shadow-sky-900/60 active:scale-[0.99]"
                      title="Copies calculated theoretical bracket. Verify chain in TOS."
                    >
                      {copiedId === `compound-${optionPlay.id}` ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-300 stroke-[2.5]" />
                          <span className="font-bold tracking-wide">Copied TOS Bracket!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-sky-200" />
                          <span className="tracking-wide">Copy TOS Bracket</span>
                          <span className="text-[11px] text-sky-200/80 font-normal">({dynamicContractQty} Contract{dynamicContractQty > 1 ? 's' : ''})</span>
                        </>
                      )}
                    </button>

                    {/* Compact Auxiliary Links */}
                    <div className="flex items-center justify-end gap-3 pt-0.5 text-[10px] text-slate-400">
                      <button
                        type="button"
                        onClick={(e) => handleCopyOrder(dynamicNaturalTosCommand, `natural-${optionPlay.id}`, e)}
                        className="hover:text-sky-300 transition-colors cursor-pointer"
                        title="Copy entry leg only: BUY +N SINGLE..."
                      >
                        {copiedId === `natural-${optionPlay.id}` ? '✓ Copied Entry' : 'Entry Leg Only'}
                      </button>
                      <span className="text-slate-700">·</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyOrder(optionPlay.schwabWebSummary, `summary-${optionPlay.id}`, e)}
                        className="hover:text-emerald-300 transition-colors cursor-pointer"
                        title="Copy complete ticket for Charles Schwab portal"
                      >
                        {copiedId === `summary-${optionPlay.id}` ? '✓ Copied Ticket' : 'Schwab Portal Ticket'}
                      </button>
                    </div>
                  </div>

                  {/* Single Guaranteed Approach Explainer */}
                  <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-800/60 text-[10px] text-emerald-300/90 leading-relaxed space-y-1">
                    <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                      <span>Single Verified Approach for Thinkorswim:</span>
                    </div>
                    <div className="text-slate-300 pl-4 border-l border-emerald-800/80 space-y-1">
                      <div>
                        Click <strong className="text-white bg-sky-900/60 px-1 py-0.5 rounded">Copy TOS Order</strong> above. It copies the full 3-leg compound bracket:
                        <code className="block mt-0.5 text-sky-300 bg-slate-900 px-1.5 py-0.5 rounded font-mono font-bold select-all break-all">
                          {dynamicCompoundTosOptionCommand}
                        </code>
                      </div>
                      <div className="text-slate-400 text-[10px]">
                        {isFuturesContract ? (
                          <span>CME Futures Options format routes directly to <strong>{optionPlay.ticker}</strong> without 100 deliverable. In Thinkorswim, click the 📋 <strong className="text-white">&quot;Paste order from clipboard&quot;</strong> icon at the bottom-right of Order Entry Tools.</span>
                        ) : (
                          <span>The mandatory <strong className="text-white">SINGLE</strong> keyword instructs Thinkorswim to route this as an option contract (never defaulting to common stock shares). In Thinkorswim, click the 📋 <strong className="text-white">&quot;Paste order from clipboard&quot;</strong> icon at the bottom-right of Order Entry Tools.</span>
                        )}
                      </div>
                      <div className="text-sky-300 text-[10px] pt-1">
                        💡 <strong>Why &quot;Custom OCO&quot; created stock before:</strong> Right-clicking a stock chart/header selects 100 shares of TSLA. To get an option bracket, either:
                        <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-slate-300">
                          <li><strong>Way 1:</strong> Paste the option order above, then change the <strong className="text-white">Advanced Order</strong> dropdown to <strong className="text-white">&quot;1st Triggers 2 OCO&quot;</strong>.</li>
                          <li><strong>Way 2:</strong> In the <strong>Trade → Option Chain</strong> tab, right-click the Ask price for the strike → select <strong className="text-white">&quot;Buy custom&quot; → &quot;with OCO Bracket&quot;</strong>.</li>
                        </ul>
                      </div>
                      <div className="text-amber-300 text-[10px] pt-1 border-t border-emerald-800/60 mt-1">
                        ⚠️ <strong>Why 1 Entry & 2 Targets appeared (and 0 Stops):</strong>
                        <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-slate-300">
                          <li><strong className="text-amber-200">Order type was LMT:</strong> When you add exit rows in TOS, it defaults to <strong className="text-white">LMT</strong>. If not changed to <strong className="text-rose-400">STP</strong>, TOS treats the stop row as a 2nd Target!</li>
                          <li><strong className="text-amber-200">Contract Math:</strong> Buying 2 contracts allows exiting 2 contracts (e.g. 2 Targets of 1 contract each paired with 2 Stops in <em>1st Triggers 2 OCO</em>). 3 targets requires BUY +3 or more.</li>
                          <li><strong className="text-amber-200">Waiting Trigger:</strong> Stop orders only become active after the Entry fills; look in TOS under <em>Waiting Trigger</em>.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* STOCK SHARES VIEW (S.E.T. PROTOCOL) */
              <div className="space-y-2.5">
                {/* S.E.T. Entry & Stops Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-slate-950/70 rounded-lg border border-slate-800 font-mono text-xs">
                  {/* Aggressive Entry */}
                  <div className="p-1.5 rounded bg-slate-900/60 border border-sky-900/40">
                    <div className="text-[10px] text-sky-400 font-bold uppercase tracking-wider mb-0.5">
                      Entry (Proximal)
                    </div>
                    <div className="font-bold text-sky-300 text-sm tabular-nums">
                      ${rec.entry.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-slate-400">Outer zone boundary</div>
                  </div>

                  {/* Conservative 50% Midline */}
                  <div className="p-1.5 rounded bg-slate-900/60 border border-amber-900/40">
                    <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-0.5">
                      50% Midline (Cons)
                    </div>
                    <div className="font-bold text-amber-300 text-sm tabular-nums">
                      ${(rec.conservativeEntry || rec.entry).toFixed(2)}
                    </div>
                    <div className="text-[9px] text-slate-400">Compacted R:R edge</div>
                  </div>

                  {/* Hard Stop-Loss */}
                  <div className="p-1.5 rounded bg-slate-900/60 border border-rose-900/40">
                    <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mb-0.5">
                      Hard SL (Distal)
                    </div>
                    <div className="font-bold text-rose-400 text-sm tabular-nums">
                      ${rec.stopLoss.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-rose-400/80">
                      ±{rec.bufferAtrMultiplier.toFixed(2)}x ATR buff
                    </div>
                  </div>

                  {/* Target 2 (Opposing Zone) */}
                  <div className="p-1.5 rounded bg-slate-900/60 border border-emerald-900/40">
                    <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-0.5">
                      TP2 (Opposing)
                    </div>
                    <div className="font-bold text-emerald-300 text-sm tabular-nums">
                      ${rec.takeProfit2.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-emerald-400">
                      TP1: ${rec.takeProfit1.toFixed(2)} (1:2)
                    </div>
                  </div>
                </div>

                {/* 3-Bar Reaction Rule Execution Banner */}
                <div className="px-2.5 py-1.5 rounded bg-amber-950/30 border border-amber-800/40 text-[11px] font-mono text-amber-300/90 flex items-start gap-1.5">
                  <span className="font-bold text-amber-400 shrink-0">⚡ 3-Bar Rule:</span>
                  <span>If price consolidates inside base for &gt;3–5 bars without an explosive rejection wick, institutional dominance is absent; flatten trade at breakeven.</span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  {rec.rationale}
                </p>

                {/* 1-Click thinkorswim / Charles Schwab Stock & Futures Order Template */}
                <div className="space-y-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400">
                    <span className="font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                      <Terminal className="w-3 h-3 text-emerald-400" />
                      <span>thinkorswim 1st Triggers OCO Bracket ({metrics.shares} {isFuturesContract ? (metrics.shares === 1 ? 'Contract' : 'Contracts') : (metrics.shares === 1 ? 'Share' : 'Shares')})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {isFuturesContract && (
                        <span className="text-amber-400 font-bold bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/80">
                          Multiplier: ${isMesContract ? '5.00' : getContractPointValue(ticker).toFixed(2)}/pt ({isMesContract ? '$1.25/tick' : `$${(getContractPointValue(ticker) * 0.25).toFixed(2)}/tick`})
                        </span>
                      )}
                      <span className="text-slate-400 font-medium">Auto-Sized from ${params.riskBudget} Risk</span>
                    </div>
                  </div>

                  {/* Primary Order String */}
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700/80 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Symbol:</span>
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono font-semibold">
                          {isFuturesContract && !cleanSym.startsWith('/') ? `/${cleanSym}` : cleanSym}
                        </span>
                      </div>
                      <span className="text-slate-500 font-mono">1st Triggers OCO Bracket</span>
                    </div>

                    <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80 truncate text-emerald-300 select-all font-mono font-bold text-xs" title="Complete thinkorswim 1st Triggers OCO Compound Bracket Order (Entry / Stop / Target)">
                      {dynamicCompoundStockOrFuturesCommand}
                    </div>

                    {/* Prominent Primary Action Button */}
                    <button
                      type="button"
                      onClick={(e) => handleCopyOrder(dynamicCompoundStockOrFuturesCommand, `stock-cmd-${rec.id}`, e)}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs flex items-center justify-center gap-2 transition-all font-semibold cursor-pointer shadow-md shadow-emerald-950/50 hover:shadow-emerald-900/60 active:scale-[0.99]"
                      title="Copy complete 1st Triggers OCO compound bracket order (Parent Entry + Child Stop Loss + Child Take Profit) so ThinkorSwim pastes all 3 legs simultaneously"
                    >
                      {copiedId === `stock-cmd-${rec.id}` ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-200 stroke-[2.5]" />
                          <span className="font-bold tracking-wide">Copied TOS Bracket!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-emerald-100" />
                          <span className="tracking-wide">Copy TOS Bracket</span>
                          <span className="text-[11px] text-emerald-200/80 font-normal">({isFuturesContract ? `${metrics.shares} Contract${metrics.shares > 1 ? 's' : ''}` : `${metrics.shares} Shares`})</span>
                        </>
                      )}
                    </button>

                    {/* Compact Auxiliary Links */}
                    <div className="flex items-center justify-end gap-3 pt-0.5 text-[10px] text-slate-400">
                      <button
                        type="button"
                        onClick={(e) => handleCopyOrder(dynamicStockTosCommand, `stock-entry-${rec.id}`, e)}
                        className="hover:text-emerald-300 transition-colors cursor-pointer"
                        title="Copy entry leg only: BUY +N..."
                      >
                        {copiedId === `stock-entry-${rec.id}` ? '✓ Copied Entry' : 'Entry Leg Only'}
                      </button>
                      <span className="text-slate-700">·</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyOrder(dynamicStockSchwabSummary, `stock-schwab-${rec.id}`, e)}
                        className="hover:text-emerald-300 transition-colors cursor-pointer"
                        title="Copy complete ticket for Charles Schwab portal"
                      >
                        {copiedId === `stock-schwab-${rec.id}` ? '✓ Copied Ticket' : 'Schwab Portal Ticket'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AUTOMATED DYNAMIC RISK-TO-REWARD CALCULATOR STRIP */}
            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-xs space-y-2 mt-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded font-bold text-[11px] border ${metrics.quality.badge}`}>
                    1 : {viewMode === 'options' ? optionMetrics.optionRR.toFixed(2) : metrics.rrRatio.toFixed(2)} R:R
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    BE Win Rate: <span className="text-slate-200 font-bold">{metrics.beWinRate.toFixed(1)}%</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => toggleCalc(rec.id, e)}
                  className={`px-2 py-1 rounded text-[11px] font-sans font-medium transition-colors flex items-center gap-1 cursor-pointer border ${
                    isExpanded
                      ? 'bg-sky-600 text-white border-sky-500'
                      : 'text-sky-400 hover:text-white bg-slate-900 hover:bg-slate-800 border-slate-700/80'
                  }`}
                  title="Open automated Risk/Reward and Position Sizing Calculator"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  <span>{isExpanded ? 'Hide Calc' : 'R:R Calculator'}</span>
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Proportional Risk vs Reward Bar */}
              <div className="space-y-1">
                <div className="w-full h-2 rounded-full overflow-hidden flex bg-slate-900 border border-slate-800/80">
                  <div 
                    className="bg-rose-500/80 transition-all duration-300" 
                    style={{ width: `${metrics.riskVisualPercent}%` }}
                    title={`Risk: $${metrics.risk.toFixed(2)} (${metrics.riskPercent.toFixed(1)}%)`}
                  />
                  <div 
                    className="bg-emerald-500/90 transition-all duration-300" 
                    style={{ width: `${metrics.rewardVisualPercent}%` }}
                    title={`Reward: $${metrics.reward.toFixed(2)} (${metrics.rewardPercent.toFixed(1)}%)`}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="text-rose-400 font-medium">Risk: ${metrics.risk.toFixed(2)} ({metrics.riskPercent.toFixed(1)}%)</span>
                  <span className="text-emerald-400 font-medium">Reward: ${metrics.reward.toFixed(2)} ({metrics.rewardPercent.toFixed(1)}%)</span>
                </div>
              </div>

              {/* Interactive Calculator Drawer (when toggled open) */}
              {isExpanded && (
                <div className="pt-2.5 mt-2 border-t border-slate-800/80 space-y-3" onClick={(e) => e.stopPropagation()}>
                  {/* Drawer Title & Reset */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-white font-display uppercase tracking-wider">
                      <Scale className="w-3.5 h-3.5 text-sky-400" />
                      <span>Dynamic R:R & Sizing Calculator</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => resetTradeParams(rec.id)}
                      className="text-[10px] text-slate-400 hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Reset entry, stop-loss, and target to original zone defaults"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Defaults</span>
                    </button>
                  </div>

                  {/* Quick Target Presets */}
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-400 font-sans font-medium flex items-center justify-between">
                      <span>Target Level Preset:</span>
                      <span className="text-slate-500">Current: {params.targetMode.toUpperCase()}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => updateTradeParams(rec.id, { target: rec.takeProfit1, targetMode: 'tp1' }, rec)}
                        className={`py-1 px-1 rounded text-center transition-all cursor-pointer font-medium border ${
                          params.targetMode === 'tp1'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-700 shadow-sm'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        TP1 (1:2)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTradeParams(rec.id, { target: rec.takeProfit2, targetMode: 'tp2' }, rec)}
                        className={`py-1 px-1 rounded text-center transition-all cursor-pointer font-medium border ${
                          params.targetMode === 'tp2'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-700 shadow-sm'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        TP2 (Zone)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTradeParams(rec.id, { target: rec.takeProfit3, targetMode: 'tp3' }, rec)}
                        className={`py-1 px-1 rounded text-center transition-all cursor-pointer font-medium border ${
                          params.targetMode === 'tp3'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-700 shadow-sm'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        TP3 (Runner)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTradeParams(rec.id, { targetMode: 'custom' }, rec)}
                        className={`py-1 px-1 rounded text-center transition-all cursor-pointer font-medium border ${
                          params.targetMode === 'custom'
                            ? 'bg-sky-950 text-sky-300 border-sky-700 shadow-sm'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>

                  {/* Interactive Price Adjustment Inputs: Entry, Stop-Loss, Target */}
                  <div className="grid grid-cols-3 gap-2">
                    {/* Entry input */}
                    <div className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1">
                      <div className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">Entry</div>
                      <input
                        type="number"
                        step="0.05"
                        value={params.entry}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) updateTradeParams(rec.id, { entry: val }, rec);
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-100 text-xs font-bold text-center focus:outline-none focus:border-sky-500"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateTradeParams(rec.id, { entry: Number((params.entry - 0.25).toFixed(2)) }, rec)}
                          className="flex-1 py-0.5 text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        >
                          -0.25
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTradeParams(rec.id, { entry: Number((params.entry + 0.25).toFixed(2)) }, rec)}
                          className="flex-1 py-0.5 text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        >
                          +0.25
                        </button>
                      </div>
                    </div>

                    {/* Stop-Loss input */}
                    <div className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1">
                      <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Stop-Loss</div>
                      <input
                        type="number"
                        step="0.05"
                        value={params.stopLoss}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) updateTradeParams(rec.id, { stopLoss: val }, rec);
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-100 text-xs font-bold text-center focus:outline-none focus:border-rose-500"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateTradeParams(rec.id, { stopLoss: Number((params.stopLoss - 0.25).toFixed(2)) }, rec)}
                          className="flex-1 py-0.5 text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        >
                          -0.25
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTradeParams(rec.id, { stopLoss: Number((params.stopLoss + 0.25).toFixed(2)) }, rec)}
                          className="flex-1 py-0.5 text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        >
                          +0.25
                        </button>
                      </div>
                    </div>

                    {/* Target input */}
                    <div className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1">
                      <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Target</div>
                      <input
                        type="number"
                        step="0.05"
                        value={params.target}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) updateTradeParams(rec.id, { target: val, targetMode: 'custom' }, rec);
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-100 text-xs font-bold text-center focus:outline-none focus:border-emerald-500"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateTradeParams(rec.id, { target: Number((params.target - 0.50).toFixed(2)), targetMode: 'custom' }, rec)}
                          className="flex-1 py-0.5 text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        >
                          -0.50
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTradeParams(rec.id, { target: Number((params.target + 0.50).toFixed(2)), targetMode: 'custom' }, rec)}
                          className="flex-1 py-0.5 text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        >
                          +0.50
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Risk Budget / Account Allocation */}
                  <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 font-sans font-medium">Risk Budget (Max Risk $):</span>
                      <span className="text-sky-300 font-bold">${params.riskBudget}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[100, 250, 500, 1000].map((budget) => (
                        <button
                          key={budget}
                          type="button"
                          onClick={() => updateTradeParams(rec.id, { riskBudget: budget }, rec)}
                          className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                            params.riskBudget === budget
                              ? 'bg-sky-600 text-white border-sky-500'
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          ${budget}
                        </button>
                      ))}
                      <div className="relative w-20">
                        <input
                          type="number"
                          step="50"
                          value={params.riskBudget}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val > 0) updateTradeParams(rec.id, { riskBudget: val }, rec);
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-xs text-center font-bold focus:outline-none focus:border-sky-500"
                          placeholder="Custom"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Calculated Real-time Outputs Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800/90">
                      <div className="text-[10px] text-slate-400">Position Size:</div>
                      <div className="text-slate-100 font-bold text-xs mt-0.5">
                        {viewMode === 'options' ? `${optionMetrics.contracts} Option Contracts` : isFuturesContract ? `${metrics.shares} Contracts` : `${metrics.shares} Shares`}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">
                        {viewMode === 'options' ? `Total Cost: $${optionMetrics.totalOptionCost.toLocaleString()}` : isFuturesContract ? `Margin Req: ~$${metrics.capitalRequired.toLocaleString()}` : `Capital: $${metrics.capitalRequired.toLocaleString()}`}
                      </div>
                    </div>

                    <div className="p-2 rounded bg-slate-950 border border-slate-800/90">
                      <div className="text-[10px] text-slate-400">Required Win Rate:</div>
                      <div className="text-sky-300 font-bold text-xs mt-0.5">
                        {metrics.beWinRate.toFixed(1)}% to break even
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">
                        Edge: {metrics.rrRatio >= 2 ? 'Strong Statistical Advantage' : 'Moderate Edge'}
                      </div>
                    </div>

                    <div className="p-2 rounded bg-rose-950/30 border border-rose-900/40">
                      <div className="text-[10px] text-rose-400 font-semibold">Total Max Risk:</div>
                      <div className="text-rose-300 font-bold text-xs mt-0.5">
                        -${viewMode === 'options' ? optionMetrics.totalOptionRisk.toFixed(2) : metrics.totalRiskDollars.toFixed(2)}
                      </div>
                      <div className="text-[9px] text-rose-400/70 mt-0.5">
                        {viewMode === 'options' ? `-$${optionMetrics.riskPerContract.toFixed(0)}/contract` : isFuturesContract ? `-$${(metrics.totalRiskDollars / Math.max(1, metrics.shares)).toFixed(2)}/contract` : `-$${metrics.risk.toFixed(2)}/share`}
                      </div>
                    </div>

                    <div className="p-2 rounded bg-emerald-950/30 border border-emerald-900/40">
                      <div className="text-[10px] text-emerald-400 font-semibold">Total Potential Gain:</div>
                      <div className="text-emerald-300 font-bold text-xs mt-0.5">
                        +${viewMode === 'options' ? optionMetrics.totalOptionReward.toFixed(2) : metrics.totalRewardDollars.toFixed(2)}
                      </div>
                      <div className="text-[9px] text-emerald-400/70 mt-0.5">
                        {viewMode === 'options' ? `+$${optionMetrics.rewardPerContract.toFixed(0)}/contract` : isFuturesContract ? `+$${(metrics.totalRewardDollars / Math.max(1, metrics.shares)).toFixed(2)}/contract` : `+$${metrics.reward.toFixed(2)}/share`}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions: Lean Auxiliary Row */}
            <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-800/70 gap-2">
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono truncate">
                <span>
                  {viewMode === 'options'
                    ? 'Targeting TP on underlying zone'
                    : isFuturesContract
                    ? `Margin Req: ~$${metrics.capitalRequired.toLocaleString()}`
                    : `Risk: $${metrics.risk.toFixed(2)}/sh`}
                </span>
                {onOpenTosModal && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRecommendation(effectiveRec);
                      onOpenTosModal(effectiveRec);
                    }}
                    className="text-slate-400 hover:text-emerald-300 underline decoration-dotted transition-colors cursor-pointer"
                    title="Open thinkorswim modal"
                  >
                    TOS Dialog
                  </button>
                )}
                {onOpenOptionsTab && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRecommendation(effectiveRec);
                      onOpenOptionsTab();
                    }}
                    className="text-slate-400 hover:text-sky-300 underline decoration-dotted transition-colors cursor-pointer"
                    title="Open Schwab Trader"
                  >
                    Schwab Tab
                  </button>
                )}
              </div>

              {/* Auxiliary Actions Group */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRecommendation(effectiveRec);
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded transition-colors cursor-pointer"
                  title="Focus chart on this setup zone"
                >
                  View Chart
                </button>
                {onLogToJournal && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRecommendation(effectiveRec);
                      onLogToJournal(effectiveRec);
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:text-white bg-amber-950/70 hover:bg-amber-900 border border-amber-800/70 rounded transition-colors flex items-center gap-1 cursor-pointer"
                    title="Log trade setup to Trading Journal"
                  >
                    <BookOpen className="w-3 h-3 text-amber-400" />
                    <span>Log Journal</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSimulateOrder(effectiveRec);
                  }}
                  className={`px-3 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer flex items-center gap-1 ${
                    isDormant
                      ? 'text-amber-300 bg-amber-950/80 hover:bg-amber-900 border border-amber-700/80'
                      : rec.proximityPhase?.includes('Phase B')
                      ? 'text-emerald-200 bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 shadow-sm shadow-emerald-950 font-bold'
                      : 'text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80'
                  }`}
                  title={isDormant ? "Price is dormant in no-man's land (>1.5x ATR away). Kept staged until price retests the proximal line." : "Arm OCO bracket order"}
                >
                  {isDormant ? '⏸ Staged' : rec.proximityPhase?.includes('Phase B') ? '🔥 Arm Order' : 'Stage Trade'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
