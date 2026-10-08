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
  Loader2
} from 'lucide-react';
import { TradeRecommendation, VolatilityMetrics } from '../types/trading';
import { generateSchwabOptionPlay, SchwabOptionContractRecommendation } from '../utils/optionsEngine';

interface ThinkorswimPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommendation: TradeRecommendation | null;
  symbol: string;
  volatilityMetrics: VolatilityMetrics;
}

export const ThinkorswimPostModal: React.FC<ThinkorswimPostModalProps> = ({
  isOpen,
  onClose,
  recommendation,
  symbol,
  volatilityMetrics,
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'api' | 'desktop' | 'web'>('api');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<any>(null);

  if (!isOpen || !recommendation) return null;

  const isFutures = symbol.startsWith('/');
  const optionPlay: SchwabOptionContractRecommendation = generateSchwabOptionPlay(
    recommendation,
    symbol,
    volatilityMetrics
  );

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleTransmitApiOrder = async () => {
    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch('/api/schwab/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          action: isFutures 
            ? (recommendation.side === 'long' ? 'BUY' : 'SELL')
            : (recommendation.side === 'long' ? 'BUY_TO_OPEN' : 'BUY_TO_OPEN'),
          quantity: 1,
          price: isFutures ? recommendation.entry : optionPlay.entry.premium,
          stopPrice: isFutures ? recommendation.stopLoss : optionPlay.stopLoss.premium,
          targetPrice: isFutures ? recommendation.takeProfit2 : optionPlay.target.premium,
          isOption: !isFutures,
          occSymbol: optionPlay.occSymbol,
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
            <Send className="w-3.5 h-3.5" />
            <span>Method 1: Direct API Submit (Recommended)</span>
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
          {/* METHOD 1: DIRECT ELECTRONIC API TRANSMISSION */}
          {/* ========================================================================= */}
          {activeTab === 'api' && (
            <div className="space-y-4 font-mono">
              <div className="p-4 rounded-xl bg-slate-900 border border-emerald-600/60 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" />
                    <span>Direct Electronic Order Routing</span>
                  </span>
                  <span className="text-[10px] text-slate-500">No Copy-Pasting Required</span>
                </div>

                <p className="text-slate-300 text-xs leading-relaxed mb-3">
                  Transmits this trade directly to the Charles Schwab Trader API gateway with your pre-configured Entry Limit, Stop-Loss, and Target prices.
                </p>

                {/* Parameters Preview */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                  <div>
                    <span className="text-[10px] text-sky-400 block uppercase">1. Entry Limit</span>
                    <span className="text-white font-bold text-sm">
                      ${isFutures ? recommendation.entry.toFixed(2) : optionPlay.entry.premium.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-rose-400 block uppercase">2. Stop-Loss</span>
                    <span className="text-rose-400 font-bold text-sm">
                      ${isFutures ? recommendation.stopLoss.toFixed(2) : optionPlay.stopLoss.premium.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-400 block uppercase">3. Target (TP2)</span>
                    <span className="text-emerald-400 font-bold text-sm">
                      ${isFutures ? recommendation.takeProfit2.toFixed(2) : optionPlay.target.premium.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Submission Action */}
                <div className="pt-3 mt-3 border-t border-slate-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleTransmitApiOrder}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Transmitting to Schwab...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Send Order to Charles Schwab</span>
                      </>
                    )}
                  </button>

                  <span className="text-[11px] text-slate-400">
                    Live Brokerage Gateway
                  </span>
                </div>
              </div>

              {/* API Result Feedback */}
              {submitResult && (
                <div className={`p-4 rounded-xl border text-xs animate-in fade-in ${
                  submitResult.success
                    ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500 text-rose-200'
                }`}>
                  <div className="flex items-center gap-2 font-bold mb-1">
                    {submitResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>{submitResult.success ? 'Order Transmitted Successfully' : 'Order Notification'}</span>
                  </div>
                  <p className="text-[11px] mt-1 text-slate-300">
                    {submitResult.message}
                  </p>
                  {submitResult.orderId && (
                    <div className="mt-2 text-[10px] text-slate-400 font-mono">
                      Order Reference: <strong className="text-white">{submitResult.orderId}</strong> · Status: <span className="text-emerald-400">{submitResult.status}</span>
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
              {/* Notice why compound semicolons fail in TOS */}
              <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-800/80 text-amber-200 text-xs">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Why thinkorswim "Paste order" fails with multi-order strings:</span>
                </div>
                <p className="text-[11px] text-amber-300/90 leading-relaxed">
                  thinkorswim desktop's clipboard parser rejects complex semicolon-chained strings (`BUY ...; SELL ... / @ ... STP`). thinkorswim desktop <strong>only accepts single verified commands</strong> without spaces after the `@` symbol (e.g. `BUY +1 .SPY251017C575 @3.45 LMT`).
                </p>
              </div>

              {/* Verified thinkorswim Single Limit Order */}
              <div className="p-4 rounded-xl bg-slate-900 border border-sky-800/80 space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
                    Verified thinkorswim Order String (Tested)
                  </span>
                  <span className="text-[10px] text-slate-500">TOS Desktop Compatible</span>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-200 text-xs break-all select-all font-semibold">
                  {optionPlay.tosVerifiedSingleCommand}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopy(optionPlay.tosVerifiedSingleCommand, 'singleTos')}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold font-mono transition-colors shadow-sm cursor-pointer"
                  >
                    {copiedType === 'singleTos' ? (
                      <>
                        <Check className="w-4 h-4 text-white" />
                        <span>Copied! Ready to Paste in thinkorswim</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy thinkorswim Order</span>
                      </>
                    )}
                  </button>

                  <span className="text-[11px] text-slate-400">
                    Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-bold border border-slate-700">Ctrl + V</kbd> in TOS
                  </span>
                </div>
              </div>

              {/* 3 Step Walkthrough */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs font-mono">
                <h4 className="font-bold text-white text-xs uppercase flex items-center gap-1.5">
                  <Keyboard className="w-4 h-4 text-sky-400" />
                  <span>How to attach Stop-Loss & Target in thinkorswim:</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 text-[11px] leading-relaxed">
                  <li>
                    In thinkorswim Desktop at the bottom Order Entry line, change the <strong>Order Template</strong> dropdown from <code className="text-sky-300 bg-slate-950 px-1 py-0.5 rounded">SINGLE</code> to <strong className="text-white">"1st Triggers OCO"</strong>.
                  </li>
                  <li>
                    Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-bold border border-slate-700">Ctrl + V</kbd> (or right-click &rarr; <em>"Paste order from clipboard"</em>). The entry limit loads instantly.
                  </li>
                  <li>
                    Set the Stop row to <strong className="text-rose-400">${isFutures ? recommendation.stopLoss.toFixed(2) : optionPlay.stopLoss.premium.toFixed(2)}</strong> and Limit row to <strong className="text-emerald-400">${isFutures ? recommendation.takeProfit2.toFixed(2) : optionPlay.target.premium.toFixed(2)}</strong>.
                  </li>
                  <li>
                    Click <strong className="text-emerald-300">"Confirm and Send"</strong>!
                  </li>
                </ol>
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
                    <span className="text-[10px] text-slate-500 uppercase block">1. Contract Symbol</span>
                    <span className="font-bold text-white text-sm">{optionPlay.tosDotSymbol}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(optionPlay.tosDotSymbol, 'sym')}
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
                      ${isFutures ? recommendation.entry.toFixed(2) : optionPlay.entry.premium.toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(
                      (isFutures ? recommendation.entry : optionPlay.entry.premium).toFixed(2), 
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
                      ${isFutures ? recommendation.stopLoss.toFixed(2) : optionPlay.stopLoss.premium.toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(
                      (isFutures ? recommendation.stopLoss : optionPlay.stopLoss.premium).toFixed(2), 
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
                      ${isFutures ? recommendation.takeProfit2.toFixed(2) : optionPlay.target.premium.toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(
                      (isFutures ? recommendation.takeProfit2 : optionPlay.target.premium).toFixed(2), 
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
