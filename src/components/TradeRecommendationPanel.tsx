import React, { useState } from 'react';
import { TradeRecommendation, VolatilityMetrics } from '../types/trading';
import { generateSchwabOptionPlay, SchwabOptionContractRecommendation } from '../utils/optionsEngine';
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
  DollarSign
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
}) => {
  const [viewMode, setViewMode] = useState<'options' | 'shares'>('options');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Dynamic R:R Calculator State (custom adjustments per trade recommendation)
  const [customParamsMap, setCustomParamsMap] = useState<Record<string, CustomTradeParams>>({});
  const [expandedCalcMap, setExpandedCalcMap] = useState<Record<string, boolean>>({});

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
    const stopLoss = params.stopLoss;
    const target = params.target;

    const risk = isLong
      ? Math.max(0.01, entry - stopLoss)
      : Math.max(0.01, stopLoss - entry);

    const reward = isLong
      ? Math.max(0, target - entry)
      : Math.max(0, entry - target);

    const rrRatio = risk > 0 ? reward / risk : 0;
    const riskPercent = entry > 0 ? (risk / entry) * 100 : 0;
    const rewardPercent = entry > 0 ? (reward / entry) * 100 : 0;
    const beWinRate = rrRatio > 0 ? (1 / (1 + rrRatio)) * 100 : 50;

    const shares = Math.max(1, Math.floor(params.riskBudget / risk));
    const totalRiskDollars = shares * risk;
    const totalRewardDollars = shares * reward;
    const capitalRequired = shares * entry;

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

    const riskPerContract = Math.max(1, (entryPrem - stopPrem) * 100);
    const rewardPerContract = Math.max(0, (targetPrem - entryPrem) * 100);
    const optionRR = riskPerContract > 0 ? rewardPerContract / riskPerContract : 0;
    const contracts = Math.max(1, Math.floor(params.riskBudget / riskPerContract));
    const totalOptionRisk = contracts * riskPerContract;
    const totalOptionReward = contracts * rewardPerContract;
    const totalOptionCost = contracts * optionPlay.entry.costPerContract;

    return {
      targetPrem,
      riskPerContract,
      rewardPerContract,
      optionRR,
      contracts,
      totalOptionRisk,
      totalOptionReward,
      totalOptionCost,
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
          <span>Schwab Options Assist</span>
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
          <span>Stock Shares Plan</span>
        </button>
      </div>

      {recommendations.map((rec) => {
        const isLong = rec.side === 'long';
        const isSelected = selectedRecommendation?.id === rec.id;
        const params = getTradeParams(rec);
        const metrics = computeMetrics(rec, params);
        const isExpanded = !!expandedCalcMap[rec.id];
        const effectiveRec = getEffectiveRec(rec);

        const optionPlay: SchwabOptionContractRecommendation = generateSchwabOptionPlay(
          effectiveRec,
          ticker,
          volatilityMetrics
        );
        const optionMetrics = computeOptionMetrics(optionPlay, params);

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

            {viewMode === 'options' ? (
              /* SCHWAB OPTIONS ASSIST VIEW */
              <div className="space-y-2.5">
                {/* Contract Badge */}
                <div className="p-2.5 rounded bg-slate-950/80 border border-sky-900/60 flex items-center justify-between font-mono">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                      optionPlay.optionType === 'CALL'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}>
                      {optionPlay.ticker} ${optionPlay.strike} {optionPlay.optionType}
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
                    <div className="text-[10px] text-sky-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Crosshair className="w-3 h-3" />
                      <span>1. Entry</span>
                    </div>
                    <div className="font-bold text-sky-300 text-sm tabular-nums">
                      ${optionPlay.entry.premium.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      ${optionPlay.entry.costPerContract}/contract
                    </div>
                    <div className="text-[9px] text-slate-500 mt-1 pt-1 border-t border-slate-800">
                      Stock @ ${params.entry.toFixed(2)}
                    </div>
                  </div>

                  {/* 2. STOP-LOSS */}
                  <div className="p-2 rounded bg-slate-900/60 border border-rose-900/50">
                    <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>2. Stop-Loss</span>
                    </div>
                    <div className="font-bold text-rose-400 text-sm tabular-nums">
                      ${optionPlay.stopLoss.premium.toFixed(2)}
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
                    <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Target className="w-3 h-3" />
                      <span>3. Target (TP)</span>
                    </div>
                    <div className="font-bold text-emerald-400 text-sm tabular-nums">
                      ${optionMetrics.targetPrem.toFixed(2)}
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

                {/* 1-Click thinkorswim / Charles Schwab Order Template */}
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between font-mono text-[11px] gap-2">
                  <div className="truncate text-slate-300 select-all font-semibold">
                    {optionPlay.schwabOrderCommand}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleCopyOrder(optionPlay.schwabWebSummary, `summary-${optionPlay.id}`, e)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded text-[10px] flex items-center gap-1 transition-colors font-sans cursor-pointer"
                      title="Copy complete ticket for Charles Schwab portal"
                    >
                      {copiedId === `summary-${optionPlay.id}` ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Schwab Ticket</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleCopyOrder(optionPlay.schwabBracketCommand, `bracket-${optionPlay.id}`, e)}
                      className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[10px] flex items-center gap-1 transition-colors font-sans font-medium cursor-pointer"
                      title="Copy thinkorswim bracket order"
                    >
                      {copiedId === `bracket-${optionPlay.id}` ? (
                        <>
                          <Check className="w-3 h-3 text-white" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>OCO Bracket</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* STOCK SHARES VIEW */
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-950/60 rounded border border-slate-800/80 font-mono text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Entry (Limit)</div>
                    <div className="font-semibold text-sky-400 tabular-nums">
                      ${params.entry.toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-rose-400/80 uppercase tracking-wider mb-0.5">Stop-Loss (SL)</div>
                    <div className="font-semibold text-rose-400 tabular-nums">
                      ${params.stopLoss.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      -{rec.bufferAtrMultiplier.toFixed(1)}x ATR buff
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-emerald-400/80 uppercase tracking-wider mb-0.5">Target (TP)</div>
                    <div className="font-semibold text-emerald-400 tabular-nums">
                      ${params.target.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      +{((Math.abs(params.target - params.entry) / params.entry) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {rec.rationale}
                </p>
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
                        {viewMode === 'options' ? `${optionMetrics.contracts} Option Contracts` : `${metrics.shares} Shares`}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">
                        {viewMode === 'options' ? `Total Cost: $${optionMetrics.totalOptionCost.toLocaleString()}` : `Capital: $${metrics.capitalRequired.toLocaleString()}`}
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
                        {viewMode === 'options' ? `-$${optionMetrics.riskPerContract.toFixed(0)}/contract` : `-$${metrics.risk.toFixed(2)}/share`}
                      </div>
                    </div>

                    <div className="p-2 rounded bg-emerald-950/30 border border-emerald-900/40">
                      <div className="text-[10px] text-emerald-400 font-semibold">Total Potential Gain:</div>
                      <div className="text-emerald-300 font-bold text-xs mt-0.5">
                        +${viewMode === 'options' ? optionMetrics.totalOptionReward.toFixed(2) : metrics.totalRewardDollars.toFixed(2)}
                      </div>
                      <div className="text-[9px] text-emerald-400/70 mt-0.5">
                        {viewMode === 'options' ? `+$${optionMetrics.rewardPerContract.toFixed(0)}/contract` : `+$${metrics.reward.toFixed(2)}/share`}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-800/70">
              <span className="text-[10px] text-slate-500 font-mono">
                {viewMode === 'options' ? 'Targeting TP on underlying zone' : `Risk: $${metrics.risk.toFixed(2)}/sh`}
              </span>

              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {onOpenTosModal && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRecommendation(effectiveRec);
                      onOpenTosModal(effectiveRec);
                    }}
                    className="px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:text-white bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 rounded transition-colors flex items-center gap-1 cursor-pointer"
                    title="Post order into thinkorswim via clipboard"
                  >
                    <Terminal className="w-3 h-3 text-emerald-400" />
                    <span>Post to TOS</span>
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
                    className="px-2 py-1 text-[11px] font-semibold text-sky-300 hover:text-white bg-sky-950/80 hover:bg-sky-900 border border-sky-800/80 rounded transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Schwab Trader</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
                {onLogToJournal && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRecommendation(effectiveRec);
                      onLogToJournal(effectiveRec);
                    }}
                    className="px-2 py-1 text-[11px] font-semibold text-amber-300 hover:text-white bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 rounded transition-colors flex items-center gap-1 cursor-pointer"
                    title="Log trade setup to Trading Journal"
                  >
                    <BookOpen className="w-3 h-3 text-amber-400" />
                    <span>Journal</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRecommendation(effectiveRec);
                  }}
                  className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
                >
                  View Chart
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSimulateOrder(effectiveRec);
                  }}
                  className="px-2 py-1 text-[11px] font-medium text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 rounded transition-colors cursor-pointer"
                >
                  Stage Trade
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
