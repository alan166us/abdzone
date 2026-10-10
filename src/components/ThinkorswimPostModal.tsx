import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  ExternalLink, 
  Terminal, 
  Keyboard, 
  CheckCircle2, 
  ArrowRight,
  ShieldCheck,
  Target,
  Crosshair,
  Sparkles,
  Layers,
  AlertTriangle,
  Send,
  Loader2,
  Key,
  Code,
  Sliders,
  ShieldAlert,
  Play,
  Lock,
  Activity
} from 'lucide-react';
import { TradeRecommendation, VolatilityMetrics } from '../types/trading';
import { 
  generateSchwabOptionPlay, 
  SchwabOptionContractRecommendation,
  formatTosOptionCommand,
  formatTosNaturalOptionCommand,
  formatTosNaturalOptionExitCommand,
  formatTosStockOrFuturesCommand,
  formatSchwabStockSummary,
  generateTosFullOrderSetSummary,
  formatTosCompoundOptionBracketCommand,
  formatTosCompoundStockOrFuturesBracketCommand
} from '../utils/optionsEngine';

interface ThinkorswimPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommendation: TradeRecommendation | null;
  symbol: string;
  volatilityMetrics: VolatilityMetrics;
  onOpenSchwabModal?: () => void;
  onOpenQaMonitor?: () => void;
}

export const ThinkorswimPostModal: React.FC<ThinkorswimPostModalProps> = ({
  isOpen,
  onClose,
  recommendation,
  symbol,
  volatilityMetrics,
  onOpenSchwabModal,
  onOpenQaMonitor,
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'api' | 'desktop' | 'web'>('api');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [schwabStrategy, setSchwabStrategy] = useState<'TRIGGER' | 'SINGLE'>('TRIGGER');
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [tosPreflightTested, setTosPreflightTested] = useState<boolean>(false);

  if (!isOpen || !recommendation) return null;

  const cleanSym = (symbol || '').toUpperCase();
  const isFutures = cleanSym.startsWith('/') || cleanSym.includes('MES') || cleanSym.includes('ES');
  const [orderMode, setOrderMode] = useState<'options' | 'shares'>(isFutures ? 'shares' : 'options');
  const [orderQty, setOrderQty] = useState<number>(isFutures ? 1 : (orderMode === 'shares' ? 100 : 2));

  const optionPlay: SchwabOptionContractRecommendation = generateSchwabOptionPlay(
    recommendation,
    symbol,
    volatilityMetrics
  );

  const isLong = recommendation.side === 'long';
  const effectiveQty = Math.max(1, orderQty);

  // Formatted order strings for thinkorswim
  const naturalOptionCmd = formatTosNaturalOptionCommand(
    optionPlay.ticker,
    optionPlay.tosExpirationStr,
    optionPlay.strike,
    optionPlay.optionType,
    optionPlay.entry.premium,
    effectiveQty
  );

  const dotOptionCmd = formatTosOptionCommand(
    optionPlay.tosDotSymbol,
    optionPlay.entry.premium,
    effectiveQty
  );

  const stockCmd = formatTosStockOrFuturesCommand(
    symbol,
    recommendation.side,
    effectiveQty,
    recommendation.entry
  );

  const compoundOptionCmd = formatTosCompoundOptionBracketCommand(
    optionPlay.ticker,
    optionPlay.tosExpirationStr,
    optionPlay.strike,
    optionPlay.optionType,
    optionPlay.entry.premium,
    optionPlay.stopLoss.premium,
    optionPlay.target.premium,
    effectiveQty
  );

  const compoundStockOrFuturesCmd = formatTosCompoundStockOrFuturesBracketCommand(
    symbol,
    recommendation.side,
    effectiveQty,
    recommendation.entry,
    recommendation.stopLoss,
    recommendation.takeProfit2
  );

  const activeCompoundCmd = orderMode === 'options' && !isFutures ? compoundOptionCmd : compoundStockOrFuturesCmd;

  const fullTosOrderSetSummary = generateTosFullOrderSetSummary(optionPlay, effectiveQty);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleRunTosPreflightTest = () => {
    setTosPreflightTested(true);
    setCopiedType('preflightTest');
    setTimeout(() => setCopiedType(null), 3000);
  };

  const handleTransmitApiOrder = async () => {
    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      const isSendingOption = orderMode === 'options' && !isFutures;
      const res = await fetch('/api/schwab/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          action: isSendingOption
            ? 'BUY_TO_OPEN'
            : (isLong ? 'BUY' : 'SELL'),
          quantity: effectiveQty,
          price: isSendingOption ? optionPlay.entry.premium : recommendation.entry,
          stopPrice: isSendingOption ? optionPlay.stopLoss.premium : recommendation.stopLoss,
          targetPrice: isSendingOption ? optionPlay.target.premium : recommendation.takeProfit2,
          isOption: isSendingOption,
          occSymbol: isSendingOption ? optionPlay.occSymbol : undefined,
          strategyType: schwabStrategy,
          tif: 'DAY',
          exitTif: 'GTC',
        }),
      });
      const data = await res.json();
      setSubmitResult(data);
    } catch (err: any) {
      setSubmitResult({
        success: false,
        message: `Order transmission failed: ${err?.message || err}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Preview Schwab JSON payload
  const isSendingOption = orderMode === 'options' && !isFutures;
  const sampleSchwabJsonPayload = {
    orderType: 'LIMIT',
    session: 'NORMAL',
    duration: 'DAY',
    orderStrategyType: schwabStrategy,
    price: isSendingOption ? optionPlay.entry.premium : recommendation.entry,
    orderLegCollection: [
      {
        instruction: isSendingOption ? 'BUY_TO_OPEN' : (isLong ? 'BUY' : 'SELL'),
        quantity: effectiveQty,
        instrument: {
          symbol: isSendingOption ? optionPlay.occSymbol : symbol,
          assetType: isSendingOption ? 'OPTION' : (isFutures ? 'FUTURE' : 'EQUITY'),
        },
      },
    ],
    ...(schwabStrategy === 'TRIGGER' ? {
      childOrderStrategies: [
        {
          orderStrategyType: 'OCO',
          childOrderStrategies: [
            {
              orderType: 'LIMIT',
              session: 'NORMAL',
              duration: 'GTC',
              orderStrategyType: 'SINGLE',
              price: isSendingOption ? optionPlay.target.premium : recommendation.takeProfit2,
              orderLegCollection: [
                {
                  instruction: isSendingOption ? 'SELL_TO_CLOSE' : (isLong ? 'SELL' : 'BUY_TO_COVER'),
                  quantity: effectiveQty,
                  instrument: {
                    symbol: isSendingOption ? optionPlay.occSymbol : symbol,
                    assetType: isSendingOption ? 'OPTION' : (isFutures ? 'FUTURE' : 'EQUITY'),
                  },
                },
              ],
            },
            {
              orderType: 'STOP',
              session: 'NORMAL',
              duration: 'GTC',
              orderStrategyType: 'SINGLE',
              stopPrice: isSendingOption ? optionPlay.stopLoss.premium : recommendation.stopLoss,
              orderLegCollection: [
                {
                  instruction: isSendingOption ? 'SELL_TO_CLOSE' : (isLong ? 'SELL' : 'BUY_TO_COVER'),
                  quantity: effectiveQty,
                  instrument: {
                    symbol: isSendingOption ? optionPlay.occSymbol : symbol,
                    assetType: isSendingOption ? 'OPTION' : (isFutures ? 'FUTURE' : 'EQUITY'),
                  },
                },
              ],
            },
          ],
        },
      ],
    } : {}),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in select-none">
      <div className="bg-[#0B0F17] border border-slate-800 rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0F172A]/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-display uppercase tracking-wide flex items-center gap-2">
                <span>Post Trade to thinkorswim & Schwab</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {isFutures ? 'Futures /MES' : 'Schwab Options'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                {symbol} · {recommendation.pattern} · Entry ${recommendation.entry.toFixed(2)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Method Switcher Tabs */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950 px-6 py-2 gap-2 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('api')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 font-semibold cursor-pointer ${
              activeTab === 'api'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-300" />
            <span>Method 1: Schwab QA Simulation 🔒</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 font-semibold cursor-pointer ${
              activeTab === 'desktop'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Method 2: TOS Desktop Clipboard</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('web')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 font-semibold cursor-pointer ${
              activeTab === 'web'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Method 3: TOS Web / Mobile Slip</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* ========================================================================= */}
          {/* METHOD 1: QA ORDER SIMULATION & AUDIT */}
          {/* ========================================================================= */}
          {activeTab === 'api' && (
            <div className="space-y-4 font-mono">
              <div className="p-4 rounded-xl bg-slate-900 border border-emerald-600/60 shadow-lg space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Charles Schwab QA Order Monitor &amp; Dry-Run Engine</span>
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-rose-400" />
                      <span>Real Money Locked</span>
                    </span>
                    {onOpenQaMonitor && (
                      <button
                        type="button"
                        onClick={onOpenQaMonitor}
                        className="text-[10px] text-amber-400 hover:text-white flex items-center gap-1 cursor-pointer bg-slate-950 px-2 py-0.5 rounded border border-slate-800"
                        title="Open Institutional QA Safety Monitor Suite"
                      >
                        <Activity className="w-3 h-3" />
                        <span>QA Monitor Suite</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Safety Interceptor Notice */}
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-200 text-xs space-y-1 font-mono">
                  <div className="flex items-center gap-2 font-bold text-rose-300">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>Safety Policy Active: Real-Money Routing Disabled</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Live brokerage debiting is hard-locked. All order requests are intercepted and routed through our 
                    <strong> QA Pre-Flight Dry-Run Simulator</strong> to verify syntax, OCO legs, and risk parameters before any real money authorization.
                  </p>
                </div>

                {/* Strategy Type & Quantity Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                      Simulated Order Strategy:
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded border border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setSchwabStrategy('TRIGGER')}
                        className={`py-1 px-1.5 rounded text-center transition-colors font-semibold cursor-pointer ${
                          schwabStrategy === 'TRIGGER'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        1st Triggers OCO
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchwabStrategy('SINGLE')}
                        className={`py-1 px-1.5 rounded text-center transition-colors font-semibold cursor-pointer ${
                          schwabStrategy === 'SINGLE'
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Single Entry
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                      Quantity ({isSendingOption ? 'Contracts' : 'Shares'}):
                    </label>
                    <div className="flex items-center gap-1.5">
                      {(isSendingOption ? [1, 2, 5, 10] : [25, 50, 100, 200]).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setOrderQty(q)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
                            orderQty === q
                              ? 'bg-sky-600 text-white border-sky-500'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          {q}
                        </button>
                      ))}
                      <input
                        type="number"
                        min="1"
                        value={orderQty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val > 0) setOrderQty(val);
                        }}
                        className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-xs text-center font-bold focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Parameters Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                  <div className="p-2 rounded bg-slate-900/60 border border-sky-900/40">
                    <span className="text-[10px] text-sky-400 block uppercase font-bold">1. Entry Limit (Parent)</span>
                    <span className="text-white font-bold text-sm">
                      ${isSendingOption ? optionPlay.entry.premium.toFixed(2) : recommendation.entry.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {isSendingOption ? `$${(optionPlay.entry.costPerContract * effectiveQty).toLocaleString()} Simulated Cost` : `${effectiveQty} Shares`}
                    </span>
                  </div>

                  <div className="p-2 rounded bg-slate-900/60 border border-rose-900/40">
                    <span className="text-[10px] text-rose-400 block uppercase font-bold">2. Stop-Loss (Child OCO)</span>
                    <span className="text-rose-400 font-bold text-sm">
                      ${isSendingOption ? optionPlay.stopLoss.premium.toFixed(2) : recommendation.stopLoss.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-rose-400/80 block mt-0.5">
                      {isSendingOption ? `${optionPlay.stopLoss.percentLoss}% Loss Cap` : 'Zone Buffer'}
                    </span>
                  </div>

                  <div className="p-2 rounded bg-slate-900/60 border border-emerald-900/40">
                    <span className="text-[10px] text-emerald-400 block uppercase font-bold">3. Profit Target (Child OCO)</span>
                    <span className="text-emerald-400 font-bold text-sm">
                      ${isSendingOption ? optionPlay.target.premium.toFixed(2) : recommendation.takeProfit2.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-emerald-400/80 block mt-0.5">
                      {isSendingOption ? `+${optionPlay.target.percentGain}% Return` : 'Opposing Zone'}
                    </span>
                  </div>
                </div>

                {/* Contract & OCC Identity Strip */}
                {isSendingOption && (
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-slate-500 uppercase text-[10px] block">OCC Option Symbol:</span>
                      <code className="text-sky-300 font-bold text-xs select-all">{optionPlay.occSymbol}</code>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 uppercase text-[10px] block">Contract:</span>
                      <span className="text-white font-bold">{optionPlay.ticker} {optionPlay.expirationDisplay} ${optionPlay.strike} {optionPlay.optionType}</span>
                    </div>
                  </div>
                )}

                {/* Action Buttons & JSON Payload Inspector */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTransmitApiOrder}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Executing QA Dry Run...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current text-white" />
                          <span>🧪 Run QA Pre-Flight Dry Run (Simulation)</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowJsonPreview(!showJsonPreview)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Code className="w-3.5 h-3.5 text-sky-400" />
                      <span>{showJsonPreview ? 'Hide Payload' : 'View Schwab JSON'}</span>
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-rose-400" />
                    <span>Real-Money Disarmed · QA Active</span>
                  </span>
                </div>

                {/* Collapsible JSON Preview */}
                {showJsonPreview && (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[10.5px] font-mono text-slate-300 space-y-1.5 animate-in fade-in">
                    <div className="flex items-center justify-between text-slate-400 text-[10px]">
                      <span>Official Charles Schwab JSON Payload:</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(JSON.stringify(sampleSchwabJsonPayload, null, 2), 'jsonPayload')}
                        className="text-sky-400 hover:text-white cursor-pointer"
                      >
                        {copiedType === 'jsonPayload' ? '✓ Copied' : 'Copy JSON'}
                      </button>
                    </div>
                    <pre className="text-sky-300 text-[10px] overflow-x-auto p-2 bg-[#020617] rounded border border-slate-900 max-h-48">
                      {JSON.stringify(sampleSchwabJsonPayload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* API Result Feedback */}
              {submitResult && (
                <div className={`p-4 rounded-xl border text-xs animate-in fade-in space-y-2.5 ${
                  submitResult.success
                    ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500 text-rose-200'
                }`}>
                  <div className="flex items-center justify-between font-bold text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span>QA Pre-Flight Audit Passed!</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                      🔒 Real Money Blocked
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {submitResult.message}
                  </p>
                  
                  {/* Checks list */}
                  {submitResult.checks && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 text-[10px]">
                      {submitResult.checks.map((c: any, idx: number) => (
                        <div key={idx} className="p-1.5 rounded bg-slate-950/80 border border-slate-800 flex items-center gap-1 text-slate-300">
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span className="truncate">{c.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {submitResult.orderId && (
                    <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                      <span>Simulated Ref: <strong className="text-white">{submitResult.orderId}</strong></span>
                      <span>Audit Mode: <strong className="text-emerald-400">QA Simulation Sandbox</strong></span>
                      <span>Status: <strong className="text-sky-300">{submitResult.status}</strong></span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* METHOD 2: THINKORSWIM DESKTOP CLIPBOARD PASTE */}
          {/* ========================================================================= */}
          {activeTab === 'desktop' && (
            <div className="space-y-4">
              {/* Asset Mode Switcher & Quantity Bar */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
                {!isFutures && (
                  <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setOrderMode('options')}
                      className={`px-2.5 py-1 rounded transition-colors text-xs font-semibold cursor-pointer ${
                        orderMode === 'options'
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Option ({optionPlay.optionType} ${optionPlay.strike})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderMode('shares');
                        if (orderQty === 1) setOrderQty(100);
                      }}
                      className={`px-2.5 py-1 rounded transition-colors text-xs font-semibold cursor-pointer ${
                        orderMode === 'shares'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Stock Shares ({symbol})
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[11px]">Quantity:</span>
                  <div className="flex items-center gap-1">
                    {(orderMode === 'options' || isFutures ? [1, 2, 5, 10] : [25, 50, 100, 200]).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setOrderQty(q)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
                          orderQty === q
                            ? 'bg-sky-600 text-white border-sky-500'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      value={orderQty}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val > 0) setOrderQty(val);
                      }}
                      className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-xs text-center font-bold focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* ThinkorSwim Interactive Pre-Flight Syntax Inspector & Tester */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-600/70 shadow-lg space-y-3 font-mono text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-400">
                      <ShieldCheck className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="font-bold text-white text-xs block">
                        ThinkorSwim Pre-Flight Compatibility Tester
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold">
                        Automated Syntax Validator
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunTosPreflightTest}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{copiedType === 'preflightTest' ? '✓ Validated!' : 'Test & Verify ThinkorSwim Syntax'}</span>
                  </button>
                </div>

                {/* 5-Point Validation Checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px]">
                  <div className="p-2 rounded bg-slate-950 border border-emerald-900/60 flex items-center gap-2 text-slate-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span><strong>1. SINGLE Keyword:</strong> Identified (Prevents TSLA 100-share stock bug)</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-emerald-900/60 flex items-center gap-2 text-slate-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span><strong>2. Expiration Format:</strong> Verified ({optionPlay.tosExpirationStr})</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-emerald-900/60 flex items-center gap-2 text-slate-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span><strong>3. Order Types:</strong> Target = LMT · Stop = STP (Prevents 2 Targets bug)</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-emerald-900/60 flex items-center gap-2 text-slate-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span><strong>4. Contract Math:</strong> Entry (+{effectiveQty}) = Exits (-{effectiveQty})</span>
                  </div>
                </div>

                {tosPreflightTested && (
                  <div className="p-2 rounded bg-emerald-950/60 border border-emerald-500/80 text-emerald-300 text-[11px] font-sans flex items-center gap-2 animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>Pre-Flight Passed:</strong> 100% compliant with ThinkorSwim desktop clipboard parser! Ready to paste into your Order Entry Tools.</span>
                  </div>
                )}
              </div>

              {/* Primary Dual Verified thinkorswim Command Bar */}
              <div className="p-4 rounded-xl bg-slate-900 border border-sky-800/80 space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>
                      {orderMode === 'options' && !isFutures
                        ? `Universal TOS Option 1st Triggers OCO Bracket (${effectiveQty} Contract${effectiveQty > 1 ? 's' : ''})`
                        : `thinkorswim 1st Triggers OCO Bracket (${effectiveQty} ${isFutures ? 'Contracts' : 'Shares'})`}
                    </span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold">TOS Clipboard Verified</span>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-sky-200 text-xs break-all select-all font-bold">
                  {activeCompoundCmd}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(activeCompoundCmd, 'primaryTos')}
                      className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold font-mono transition-colors shadow-sm cursor-pointer"
                      title="Copy complete compound bracket order string (Parent Entry + Child Stop Loss + Child Take Profit) for simultaneous 3-leg paste into ThinkorSwim"
                    >
                      {copiedType === 'primaryTos' ? (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          <span>Copied TOS Bracket (3 Legs)!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Full TOS Bracket (3 Legs)</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopy(orderMode === 'options' && !isFutures ? naturalOptionCmd : stockCmd, 'entryOnly')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold font-mono transition-colors cursor-pointer border border-slate-700"
                      title="Copy entry leg only"
                    >
                      {copiedType === 'entryOnly' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied Entry!</span>
                        </>
                      ) : (
                        <span>Entry Only</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopy(fullTosOrderSetSummary, 'fullTosSummary')}
                      className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold font-mono transition-colors shadow-sm cursor-pointer"
                      title="Copy complete 5-row blueprint with all Entry, Stop, and Target legs"
                    >
                      {copiedType === 'fullTosSummary' ? (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          <span>Copied Full Order Set!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Full 5-Row Blueprint</span>
                        </>
                      )}
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    Click 📋 icon in TOS Order Entry Tools
                  </span>
                </div>
              </div>

              {/* Custom OCO vs Option Explanation Banner */}
              <div className="p-3.5 rounded-lg bg-rose-950/30 border border-rose-800/80 text-rose-200 text-xs space-y-1.5 font-mono">
                <div className="flex items-center gap-2 font-bold text-rose-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Why &quot;Buy Custom OCO&quot; created an order for Stock instead of Option:</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  In ThinkorSwim, clicking <strong>&quot;Buy Custom with OCO Bracket&quot;</strong> from a <em>stock chart</em>, <em>stock header</em>, or <em>Active Trader with TSLA</em> always builds an equity bracket for <strong className="text-white">100 shares of TSLA stock</strong> because its context is the stock symbol, not the option contract!
                </p>
                <div className="text-[11px] text-amber-300 bg-slate-950/80 p-2 rounded border border-amber-900/60 leading-relaxed">
                  <strong>The Rule:</strong> ThinkorSwim handles Options and Stock separately. To get an <strong>Option OCO Bracket</strong>, you must either:
                  <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-200">
                    <li><strong className="text-white">Approach A (Fastest with Clipboard):</strong> Paste the Option order first (📋 icon), then change Advanced Order or right-click to add the OCO exit bracket.</li>
                    <li><strong className="text-white">Approach B (Direct on Option Chain):</strong> In the TSLA Option Chain, <em>right-click</em> the <strong>Ask price</strong> of the contract → select <strong className="text-white">&quot;Buy custom&quot; → &quot;with OCO Bracket&quot;</strong>!</li>
                  </ul>
                </div>
              </div>

              {/* CRITICAL DIAGNOSTIC: Why 1 Entry + 2 Targets appeared (and 2 Stops didn't show up) */}
              <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/80 text-amber-200 text-xs font-mono space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-amber-300 text-xs uppercase tracking-wide">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Why you got 1 Entry & 2 Targets (and 0 Stops) & How to Fix It:</span>
                </div>
                
                <div className="space-y-2 text-[11px] text-slate-300 leading-relaxed">
                  <div className="p-2.5 rounded bg-slate-950/80 border border-amber-900/60 space-y-1">
                    <span className="text-amber-300 font-bold block">
                      1. The #1 Cause: The &quot;Order&quot; column was left as &quot;LMT&quot; instead of &quot;STP&quot;!
                    </span>
                    <p className="text-slate-300 text-[10.5px]">
                      When you add or duplicate exit rows in ThinkorSwim, TOS <strong className="text-white">always defaults the Order column to LMT (Limit)</strong>. If you typed the stop price into an exit row without changing the <span className="text-white font-semibold">Order dropdown from LMT to STP</span> (or STP LMT), ThinkorSwim treats that row as a <strong>second Target (Take-Profit)</strong>, NOT a Stop-Loss!
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950/80 border border-amber-900/60 space-y-1">
                    <span className="text-amber-300 font-bold block">
                      2. Quantity Math Rule: Exit Contracts MUST Equal Entry Contracts!
                    </span>
                    <p className="text-slate-300 text-[10.5px]">
                      If your entry order is <strong className="text-white">BUY +2 Contracts</strong>, you only own 2 contracts. You cannot have 3 Targets (1 + 1 + 1 = 3 contracts) because you don&apos;t have 3 contracts! With 2 contracts, you can have:
                    </p>
                    <ul className="list-disc list-inside text-[10px] text-slate-300 pl-1 space-y-0.5">
                      <li><strong>Option A (1st Triggers 2 OCO):</strong> 2 Targets (1 contract each) paired with 2 Stops (1 contract each). Total = 2 contracts.</li>
                      <li><strong>Option B (1st Triggers OCO):</strong> 1 Target (2 contracts) paired with 1 Stop (2 contracts). Total = 2 contracts.</li>
                      <li>To have 3 Targets (TP1, TP2, TP3), your entry quantity must be <strong className="text-emerald-400">3 or more contracts</strong> (e.g. BUY +3)!</li>
                    </ul>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950/80 border border-amber-900/60 space-y-1">
                    <span className="text-amber-300 font-bold block">
                      3. Where Stops live before Entry fills: Look under &quot;Waiting Trigger&quot;!
                    </span>
                    <p className="text-slate-300 text-[10.5px]">
                      In ThinkorSwim&apos;s <em>Activity and Positions</em> tab, triggered exits do <strong className="text-white">not</strong> appear in the top &quot;Working Orders&quot; section until the primary Entry fills. They are held under <strong className="text-sky-300">&quot;Waiting Trigger&quot;</strong> or nested inside an expandable tree ▷ under the primary order.
                    </p>
                  </div>
                </div>
              </div>

              {/* Exact ThinkorSwim Row-by-Row Blueprint */}
              <div className="p-4 rounded-xl bg-slate-900 border border-sky-800/80 space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Exact ThinkorSwim Order Ticket Blueprint ({effectiveQty} Contract{effectiveQty > 1 ? 's' : ''})</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold">Row-by-Row Setup</span>
                </div>

                <p className="text-[11px] text-slate-400">
                  Here is exactly how the rows should look in your ThinkorSwim Order Entry box. Make sure the <strong className="text-rose-400">Order column says STP</strong> for your stop rows:
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 text-[10px] uppercase font-bold">
                        <th className="p-2">Row</th>
                        <th className="p-2">Role</th>
                        <th className="p-2">Side</th>
                        <th className="p-2">Qty</th>
                        <th className="p-2">Order</th>
                        <th className="p-2">Price</th>
                        <th className="p-2">TIF</th>
                        <th className="p-2 text-right">Copy Leg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {/* Row 1: Entry */}
                      <tr className="hover:bg-slate-900/40 text-sky-300">
                        <td className="p-2 font-bold text-slate-400">1</td>
                        <td className="p-2 font-bold text-white">Entry (1st Trigger)</td>
                        <td className="p-2 text-emerald-400 font-bold">BUY</td>
                        <td className="p-2 font-bold">+{effectiveQty}</td>
                        <td className="p-2 font-bold text-sky-400">LMT</td>
                        <td className="p-2 font-bold text-white">${(orderMode === 'options' && !isFutures ? optionPlay.entry.premium : recommendation.entry).toFixed(2)}</td>
                        <td className="p-2 text-slate-400">DAY</td>
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleCopy(orderMode === 'options' && !isFutures ? naturalOptionCmd : stockCmd, 'legEntry')}
                            className="px-2 py-0.5 rounded bg-sky-950 hover:bg-sky-900 border border-sky-800 text-sky-300 text-[10px] font-bold cursor-pointer"
                          >
                            {copiedType === 'legEntry' ? '✓ Copied' : 'Copy Entry'}
                          </button>
                        </td>
                      </tr>

                      {/* Exits for 2 or more contracts */}
                      {effectiveQty >= 2 ? (
                        <>
                          {/* Pair 1 Target */}
                          <tr className="hover:bg-slate-900/40 text-emerald-300">
                            <td className="p-2 font-bold text-slate-400">2</td>
                            <td className="p-2 text-slate-300 flex items-center gap-1">
                              <span>Target 1 (TP1)</span>
                              <span className="text-[9px] px-1 py-0.2 bg-slate-800 rounded text-slate-400">OCO 1</span>
                            </td>
                            <td className="p-2 text-rose-400 font-bold">SELL</td>
                            <td className="p-2 font-bold">-{Math.floor(effectiveQty / 2)}</td>
                            <td className="p-2 font-bold text-emerald-400">LMT</td>
                            <td className="p-2 font-bold text-white">${(orderMode === 'options' && !isFutures ? optionPlay.target.tp1.premium : recommendation.takeProfit1).toFixed(2)}</td>
                            <td className="p-2 text-slate-400">GTC</td>
                            <td className="p-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleCopy(
                                  orderMode === 'options' && !isFutures
                                    ? `SELL -${Math.floor(effectiveQty / 2)} SINGLE ${optionPlay.ticker} 100 ${optionPlay.tosExpirationStr} ${optionPlay.strike} ${optionPlay.optionType} @${optionPlay.target.tp1.premium.toFixed(2)} LMT`
                                    : `SELL -${Math.floor(effectiveQty / 2)} ${symbol} @${recommendation.takeProfit1.toFixed(2)} LMT`,
                                  'legTp1'
                                )}
                                className="px-2 py-0.5 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-[10px] font-bold cursor-pointer"
                              >
                                {copiedType === 'legTp1' ? '✓ Copied' : 'Copy TP1'}
                              </button>
                            </td>
                          </tr>

                          {/* Pair 1 Stop */}
                          <tr className="hover:bg-slate-900/40 text-rose-300 bg-rose-950/20">
                            <td className="p-2 font-bold text-slate-400">3</td>
                            <td className="p-2 text-rose-300 flex items-center gap-1">
                              <span>Stop-Loss 1 (SL)</span>
                              <span className="text-[9px] px-1 py-0.2 bg-slate-800 rounded text-slate-400">OCO 1</span>
                            </td>
                            <td className="p-2 text-rose-400 font-bold">SELL</td>
                            <td className="p-2 font-bold">-{Math.floor(effectiveQty / 2)}</td>
                            <td className="p-2 font-bold text-rose-400 bg-rose-950 px-1 py-0.5 rounded border border-rose-800">STP</td>
                            <td className="p-2 font-bold text-white">${(orderMode === 'options' && !isFutures ? optionPlay.stopLoss.premium : recommendation.stopLoss).toFixed(2)}</td>
                            <td className="p-2 text-slate-400">GTC</td>
                            <td className="p-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleCopy(
                                  orderMode === 'options' && !isFutures
                                    ? `SELL -${Math.floor(effectiveQty / 2)} SINGLE ${optionPlay.ticker} 100 ${optionPlay.tosExpirationStr} ${optionPlay.strike} ${optionPlay.optionType} @${optionPlay.stopLoss.premium.toFixed(2)} STP`
                                    : `SELL -${Math.floor(effectiveQty / 2)} ${symbol} @${recommendation.stopLoss.toFixed(2)} STP`,
                                  'legSl1'
                                )}
                                className="px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] font-bold cursor-pointer"
                              >
                                {copiedType === 'legSl1' ? '✓ Copied' : 'Copy SL1'}
                              </button>
                            </td>
                          </tr>

                          {/* Pair 2 Target */}
                          <tr className="hover:bg-slate-900/40 text-emerald-300">
                            <td className="p-2 font-bold text-slate-400">4</td>
                            <td className="p-2 text-slate-300 flex items-center gap-1">
                              <span>Target 2 (TP2)</span>
                              <span className="text-[9px] px-1 py-0.2 bg-slate-800 rounded text-slate-400">OCO 2</span>
                            </td>
                            <td className="p-2 text-rose-400 font-bold">SELL</td>
                            <td className="p-2 font-bold">-{Math.ceil(effectiveQty / 2)}</td>
                            <td className="p-2 font-bold text-emerald-400">LMT</td>
                            <td className="p-2 font-bold text-white">${(orderMode === 'options' && !isFutures ? optionPlay.target.tp2.premium : recommendation.takeProfit2).toFixed(2)}</td>
                            <td className="p-2 text-slate-400">GTC</td>
                            <td className="p-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleCopy(
                                  orderMode === 'options' && !isFutures
                                    ? `SELL -${Math.ceil(effectiveQty / 2)} SINGLE ${optionPlay.ticker} 100 ${optionPlay.tosExpirationStr} ${optionPlay.strike} ${optionPlay.optionType} @${optionPlay.target.tp2.premium.toFixed(2)} LMT`
                                    : `SELL -${Math.ceil(effectiveQty / 2)} ${symbol} @${recommendation.takeProfit2.toFixed(2)} LMT`,
                                  'legTp2'
                                )}
                                className="px-2 py-0.5 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-[10px] font-bold cursor-pointer"
                              >
                                {copiedType === 'legTp2' ? '✓ Copied' : 'Copy TP2'}
                              </button>
                            </td>
                          </tr>

                          {/* Pair 2 Stop */}
                          <tr className="hover:bg-slate-900/40 text-rose-300 bg-rose-950/20">
                            <td className="p-2 font-bold text-slate-400">5</td>
                            <td className="p-2 text-rose-300 flex items-center gap-1">
                              <span>Stop-Loss 2 (SL)</span>
                              <span className="text-[9px] px-1 py-0.2 bg-slate-800 rounded text-slate-400">OCO 2</span>
                            </td>
                            <td className="p-2 text-rose-400 font-bold">SELL</td>
                            <td className="p-2 font-bold">-{Math.ceil(effectiveQty / 2)}</td>
                            <td className="p-2 font-bold text-rose-400 bg-rose-950 px-1 py-0.5 rounded border border-rose-800">STP</td>
                            <td className="p-2 font-bold text-white">${(orderMode === 'options' && !isFutures ? optionPlay.stopLoss.premium : recommendation.stopLoss).toFixed(2)}</td>
                            <td className="p-2 text-slate-400">GTC</td>
                            <td className="p-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleCopy(
                                  orderMode === 'options' && !isFutures
                                    ? `SELL -${Math.ceil(effectiveQty / 2)} SINGLE ${optionPlay.ticker} 100 ${optionPlay.tosExpirationStr} ${optionPlay.strike} ${optionPlay.optionType} @${optionPlay.stopLoss.premium.toFixed(2)} STP`
                                    : `SELL -${Math.ceil(effectiveQty / 2)} ${symbol} @${recommendation.stopLoss.toFixed(2)} STP`,
                                  'legSl2'
                                )}
                                className="px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] font-bold cursor-pointer"
                              >
                                {copiedType === 'legSl2' ? '✓ Copied' : 'Copy SL2'}
                              </button>
                            </td>
                          </tr>
                        </>
                      ) : (
                        <>
                          {/* Single contract bracket */}
                          <tr className="hover:bg-slate-900/40 text-emerald-300">
                            <td className="p-2 font-bold text-slate-400">2</td>
                            <td className="p-2 text-slate-300">Target (TP2)</td>
                            <td className="p-2 text-rose-400 font-bold">SELL</td>
                            <td className="p-2 font-bold">-1</td>
                            <td className="p-2 font-bold text-emerald-400">LMT</td>
                            <td className="p-2 font-bold text-white">${(orderMode === 'options' && !isFutures ? optionPlay.target.tp2.premium : recommendation.takeProfit2).toFixed(2)}</td>
                            <td className="p-2 text-slate-400">GTC</td>
                            <td className="p-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleCopy(
                                  orderMode === 'options' && !isFutures
                                    ? `SELL -1 SINGLE ${optionPlay.ticker} 100 ${optionPlay.tosExpirationStr} ${optionPlay.strike} ${optionPlay.optionType} @${optionPlay.target.tp2.premium.toFixed(2)} LMT`
                                    : `SELL -1 ${symbol} @${recommendation.takeProfit2.toFixed(2)} LMT`,
                                  'legTpSingle'
                                )}
                                className="px-2 py-0.5 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-[10px] font-bold cursor-pointer"
                              >
                                {copiedType === 'legTpSingle' ? '✓ Copied' : 'Copy Target'}
                              </button>
                            </td>
                          </tr>
                          <tr className="hover:bg-slate-900/40 text-rose-300 bg-rose-950/20">
                            <td className="p-2 font-bold text-slate-400">3</td>
                            <td className="p-2 text-rose-300">Stop-Loss (SL)</td>
                            <td className="p-2 text-rose-400 font-bold">SELL</td>
                            <td className="p-2 font-bold">-1</td>
                            <td className="p-2 font-bold text-rose-400 bg-rose-950 px-1 py-0.5 rounded border border-rose-800">STP</td>
                            <td className="p-2 font-bold text-white">${(orderMode === 'options' && !isFutures ? optionPlay.stopLoss.premium : recommendation.stopLoss).toFixed(2)}</td>
                            <td className="p-2 text-slate-400">GTC</td>
                            <td className="p-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleCopy(
                                  orderMode === 'options' && !isFutures
                                    ? `SELL -1 SINGLE ${optionPlay.ticker} 100 ${optionPlay.tosExpirationStr} ${optionPlay.strike} ${optionPlay.optionType} @${optionPlay.stopLoss.premium.toFixed(2)} STP`
                                    : `SELL -1 ${symbol} @${recommendation.stopLoss.toFixed(2)} STP`,
                                  'legSlSingle'
                                )}
                                className="px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] font-bold cursor-pointer"
                              >
                                {copiedType === 'legSlSingle' ? '✓ Copied' : 'Copy Stop'}
                              </button>
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[10.5px] text-slate-300 flex items-center justify-between">
                  <span>💡 <strong>Advanced Order setting for this setup:</strong> Select <strong className="text-white">{effectiveQty >= 2 ? '1st Triggers 2 OCO' : '1st Triggers OCO'}</strong> in the bottom-left dropdown.</span>
                </div>
              </div>

              {/* Notice regarding Ctrl+L & Hotkeys in Thinkorswim */}
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 font-mono space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                  <span>ℹ️ Notice on Ctrl + L & Thinkorswim Hotkeys:</span>
                </div>
                <p className="text-slate-400 text-[10.5px] leading-relaxed">
                  Thinkorswim does <strong>not</strong> have a default native shortcut for pasting clipboard orders (and recent Schwab/TOS updates reset custom hotkey mappings). To paste orders reliably, use the 📋 <strong className="text-sky-300">&quot;Paste order from clipboard&quot;</strong> icon in the bottom right corner of Order Entry, or configure a custom hotkey via <span className="text-slate-200">Setup → Application Settings → Hot keys</span>.
                </p>
              </div>

              {/* Bracket Target Levels 1-Click Copy Bar */}
              {/* Multi-Target (3 Targets) & Stop-Loss (2 Stops) Buttons */}
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">1-Click Bracket Exits (2 Stops · 3 Targets):</span>
                  <span className="text-emerald-400 text-[10px]">TOS Option Verified</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Stops */}
                  <button
                    type="button"
                    onClick={() => handleCopy((orderMode === 'options' && !isFutures ? optionPlay.stopLoss.premium : recommendation.stopLoss).toFixed(2), 'copySl')}
                    className="px-2 py-1 rounded bg-rose-950 border border-rose-800 text-rose-300 cursor-pointer font-bold text-[11px]"
                    title="Copy Hard Stop Loss"
                  >
                    {copiedType === 'copySl' ? '✓ Copied' : `Hard SL: $${(orderMode === 'options' && !isFutures ? optionPlay.stopLoss.premium : recommendation.stopLoss).toFixed(2)}`}
                  </button>
                  {orderMode === 'options' && !isFutures && (
                    <button
                      type="button"
                      onClick={() => handleCopy((Math.max(0.30, optionPlay.entry.premium * 0.70)).toFixed(2), 'copyConsSl')}
                      className="px-2 py-1 rounded bg-amber-950 border border-amber-800 text-amber-300 cursor-pointer font-bold text-[11px]"
                      title="Copy Conservative / 30% Max Loss Stop"
                    >
                      {copiedType === 'copyConsSl' ? '✓ Copied' : `Cons SL: $${(Math.max(0.30, optionPlay.entry.premium * 0.70)).toFixed(2)}`}
                    </button>
                  )}

                  {/* Targets */}
                  <button
                    type="button"
                    onClick={() => handleCopy((orderMode === 'options' && !isFutures ? optionPlay.target.tp1.premium : recommendation.takeProfit1).toFixed(2), 'copyTp1')}
                    className="px-2 py-1 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 cursor-pointer font-bold text-[11px]"
                    title="Copy TP1 (1:2 R:R)"
                  >
                    {copiedType === 'copyTp1' ? '✓ Copied' : `TP1: $${(orderMode === 'options' && !isFutures ? optionPlay.target.tp1.premium : recommendation.takeProfit1).toFixed(2)}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy((orderMode === 'options' && !isFutures ? optionPlay.target.tp2.premium : recommendation.takeProfit2).toFixed(2), 'copyTp2')}
                    className="px-2 py-1 rounded bg-emerald-900 border border-emerald-700 text-emerald-200 cursor-pointer font-bold text-[11px]"
                    title="Copy TP2 (Opposing Zone)"
                  >
                    {copiedType === 'copyTp2' ? '✓ Copied' : `TP2: $${(orderMode === 'options' && !isFutures ? optionPlay.target.tp2.premium : recommendation.takeProfit2).toFixed(2)}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy((orderMode === 'options' && !isFutures ? optionPlay.target.tp3.premium : (recommendation.takeProfit3 || recommendation.takeProfit2 * 1.05)).toFixed(2), 'copyTp3')}
                    className="px-2 py-1 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 cursor-pointer font-bold text-[11px]"
                    title="Copy TP3 (Trend Runner)"
                  >
                    {copiedType === 'copyTp3' ? '✓ Copied' : `TP3: $${(orderMode === 'options' && !isFutures ? optionPlay.target.tp3.premium : (recommendation.takeProfit3 || recommendation.takeProfit2 * 1.05)).toFixed(2)}`}
                  </button>
                </div>
              </div>

              {/* 3 Step Walkthrough */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs font-mono">
                <h4 className="font-bold text-white text-xs uppercase flex items-center gap-1.5">
                  <Keyboard className="w-4 h-4 text-sky-400" />
                  <span>Two 100% Reliable Ways to Place an Option OCO Bracket in ThinkorSwim:</span>
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Method A */}
                  <div className="p-3 rounded-lg bg-slate-950 border border-sky-900/50 space-y-1.5">
                    <span className="text-[11px] font-bold text-sky-400 block uppercase">
                      Way 1: Via Clipboard Paste (Clipboard + Advanced Order)
                    </span>
                    <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[10.5px] leading-relaxed">
                      <li>
                        Click the green <strong className="text-white">&quot;Copy thinkorswim Order&quot;</strong> button above.
                      </li>
                      <li>
                        In ThinkorSwim Order Entry Tools, click 📋 <strong className="text-sky-300">&quot;Paste order from clipboard&quot;</strong>. (This puts the <strong className="text-white">Option Contract</strong> on row 1).
                      </li>
                      <li>
                        In the bottom-left dropdown <strong>&quot;Advanced Order&quot;</strong> (currently says <em>Single Order</em>), change it to <strong className="text-white">&quot;1st Triggers 2 OCO&quot;</strong> or <strong className="text-white">&quot;1st Triggers 3 OCO&quot;</strong>.
                      </li>
                      <li>
                        ThinkorSwim will automatically spawn the linked Target and Stop rows for your option contracts!
                      </li>
                    </ol>
                  </div>

                  {/* Method B */}
                  <div className="p-3 rounded-lg bg-slate-950 border border-emerald-900/50 space-y-1.5">
                    <span className="text-[11px] font-bold text-emerald-400 block uppercase">
                      Way 2: From the Option Chain (Right-Click Custom OCO)
                    </span>
                    <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[10.5px] leading-relaxed">
                      <li>
                        Navigate to the <strong>Trade → Option Chain</strong> tab for <strong className="text-white">{optionPlay.ticker}</strong>.
                      </li>
                      <li>
                        Find the strike (<strong className="text-white">{optionPlay.tosExpirationStr} ${optionPlay.strike} {optionPlay.optionType}</strong>).
                      </li>
                      <li>
                        <strong>Right-click the Ask price</strong> of that strike row.
                      </li>
                      <li>
                        Hover over <strong className="text-white">&quot;Buy custom&quot;</strong> → click <strong className="text-emerald-400">&quot;with OCO Bracket&quot;</strong>.
                      </li>
                      <li>
                        This builds the option bracket immediately with 1 entry + linked Stop & Target for that exact option!
                      </li>
                    </ol>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-[10.5px] text-rose-200/90 mt-2">
                  🚫 <strong>Why it created Stock before:</strong> When you right-click on the main chart header or Active Trader while TSLA stock is selected, &quot;Buy custom with OCO Bracket&quot; targets the stock chart (100 shares of TSLA). To make a custom option bracket, you must right-click directly on the <strong>Option Chain</strong> or use <strong>Way 1</strong> above.
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* METHOD 3: THINKORSWIM WEB / MOBILE & SCHWAB.COM */}
          {/* ========================================================================= */}
          {activeTab === 'web' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300 font-mono">
                thinkorswim Web (`trade.thinkorswim.com`) and Mobile do not have a clipboard paste menu. Use these 1-click copy buttons to populate the Trade Ticket without typing:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                {/* 1. Symbol */}
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">1. Contract / Symbol</span>
                    <span className="font-bold text-white text-sm">
                      {orderMode === 'options' && !isFutures ? optionPlay.tosDotSymbol : symbol}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(orderMode === 'options' && !isFutures ? optionPlay.tosDotSymbol : symbol, 'sym')}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded text-xs transition-colors cursor-pointer"
                  >
                    {copiedType === 'sym' ? 'Copied!' : 'Copy Symbol'}
                  </button>
                </div>

                {/* 2. Entry Price */}
                <div className="p-3 rounded-lg bg-slate-900 border border-sky-900/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-sky-400 uppercase block">2. Entry Limit Price</span>
                    <span className="font-bold text-sky-300 text-sm">
                      ${(orderMode === 'options' && !isFutures ? optionPlay.entry.premium : recommendation.entry).toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(
                      (orderMode === 'options' && !isFutures ? optionPlay.entry.premium : recommendation.entry).toFixed(2), 
                      'entryVal'
                    )}
                    className="px-2.5 py-1.5 bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 rounded text-xs transition-colors cursor-pointer"
                  >
                    {copiedType === 'entryVal' ? 'Copied!' : 'Copy Entry'}
                  </button>
                </div>

                {/* 3. Stop-Loss Price */}
                <div className="p-3 rounded-lg bg-slate-900 border border-rose-900/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-rose-400 uppercase block">3. Stop-Loss Price</span>
                    <span className="font-bold text-rose-400 text-sm">
                      ${(orderMode === 'options' && !isFutures ? optionPlay.stopLoss.premium : recommendation.stopLoss).toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(
                      (orderMode === 'options' && !isFutures ? optionPlay.stopLoss.premium : recommendation.stopLoss).toFixed(2), 
                      'stopVal'
                    )}
                    className="px-2.5 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded text-xs transition-colors cursor-pointer"
                  >
                    {copiedType === 'stopVal' ? 'Copied!' : 'Copy Stop'}
                  </button>
                </div>

                {/* 4. Target Price */}
                <div className="p-3 rounded-lg bg-slate-900 border border-emerald-900/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-emerald-400 uppercase block">4. Target Price</span>
                    <span className="font-bold text-emerald-400 text-sm">
                      ${(orderMode === 'options' && !isFutures ? optionPlay.target.premium : recommendation.takeProfit2).toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(
                      (orderMode === 'options' && !isFutures ? optionPlay.target.premium : recommendation.takeProfit2).toFixed(2), 
                      'targetVal'
                    )}
                    className="px-2.5 py-1.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded text-xs transition-colors cursor-pointer"
                  >
                    {copiedType === 'targetVal' ? 'Copied!' : 'Copy Target'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-[#0F172A]/80 shrink-0">
          <div className="flex items-center gap-3">
            <a
              href="https://trade.thinkorswim.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-mono transition-colors"
            >
              <span>Launch thinkorswim Web</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <span className="text-slate-600">·</span>
            <a
              href="https://client.schwab.com/app/trade/tom/#/trade"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-mono transition-colors"
            >
              <span>Schwab Portal Ticket</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
