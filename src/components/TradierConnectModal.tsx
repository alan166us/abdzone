import React, { useState, useEffect } from 'react';
import { 
  X, 
  ExternalLink, 
  CheckCircle2, 
  Key, 
  ShieldCheck, 
  RefreshCw, 
  AlertCircle, 
  Trash2, 
  Save,
  TrendingUp,
  Percent
} from 'lucide-react';

interface TradierConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTradierConnected?: () => void;
  currentSymbol?: string;
}

export const TradierConnectModal: React.FC<TradierConnectModalProps> = ({
  isOpen,
  onClose,
  onTradierConnected,
  currentSymbol = 'SPY',
}) => {
  const [tokenInput, setTokenInput] = useState<string>(() => {
    try { return localStorage.getItem('tradier_access_token') || ''; } catch { return ''; }
  });
  const [endpointInput, setEndpointInput] = useState<string>(() => {
    try { return localStorage.getItem('tradier_endpoint') || 'https://api.tradier.com/v1'; } catch { return 'https://api.tradier.com/v1'; }
  });

  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Options chain preview state
  const [isLoadingChains, setIsLoadingChains] = useState<boolean>(false);
  const [chainsResult, setChainsResult] = useState<any[] | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Sync status from backend
      fetch('/api/tradier/status')
        .then(r => r.json())
        .then(data => {
          if (data && data.authenticated) {
            setValidationResult({
              authenticated: true,
              valid: true,
              message: 'Tradier secondary backup feed is configured on server.',
            });
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveConfig = async () => {
    try {
      localStorage.setItem('tradier_access_token', tokenInput.trim());
      localStorage.setItem('tradier_endpoint', endpointInput.trim());

      const res = await fetch('/api/tradier/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim(), endpoint: endpointInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: 'Tradier backup configuration saved to terminal.' });
        if (onTradierConnected) onTradierConnected();
      } else {
        setStatusMessage({ type: 'error', text: data.message || 'Failed to save configuration.' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e?.message || 'Error saving Tradier config.' });
    }
  };

  const handleClearToken = async () => {
    try {
      localStorage.removeItem('tradier_access_token');
      setTokenInput('');
      setValidationResult(null);
      setChainsResult(null);

      await fetch('/api/tradier/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: '', endpoint: endpointInput }),
      });
      setStatusMessage({ type: 'success', text: 'Tradier token cleared. Terminal will use primary feed.' });
    } catch {}
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setStatusMessage(null);
    setValidationResult(null);

    // Save token first
    await handleSaveConfig();

    try {
      const res = await fetch('/api/tradier/validate', { method: 'POST' });
      const data = await res.json();
      setValidationResult(data);
      if (data.valid) {
        setStatusMessage({ type: 'success', text: `Connected! Response time: ${data.latencyMs}ms.` });
      } else {
        setStatusMessage({ type: 'error', text: data.message || 'Verification failed.' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e?.message || 'Network error verifying Tradier.' });
    } finally {
      setIsValidating(false);
    }
  };

  const handleTestOptionsChains = async () => {
    setIsLoadingChains(true);
    try {
      const clean = currentSymbol.replace(/^\//, '').toUpperCase();
      const res = await fetch(`/api/tradier/options/chains?symbol=${clean}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.options)) {
        setChainsResult(data.options.slice(0, 10)); // sample first 10
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to fetch options chain.' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e?.message || 'Failed to fetch options.' });
    } finally {
      setIsLoadingChains(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0B0F17] border border-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">Tradier Brokerage Backup Feed</h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Secondary Backup
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Institutional OPRA Options Chains &amp; Real-Time Candlestick Feed
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          
          {/* Explanation Banner */}
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Dedicated Options &amp; D-S Zone Backup</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              When Charles Schwab is set as your Primary feed, Tradier acts as your reliable secondary backup.
              Tradier provides full OPRA options chains (with Delta, Theta, and implied volatility) and real-time tick bars for precision Supply &amp; Demand zone alignment.
            </p>
          </div>

          {/* Configuration Form */}
          <div className="p-3.5 rounded-lg bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tradier Access Token (Bearer Token)</span>
              </label>
              <a
                href="https://developer.tradier.com/"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline flex items-center gap-1 text-[10px]"
              >
                <span>Get Free Tradier Token</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <input
              type="password"
              placeholder="Paste your Tradier Developer Token (e.g. tradier_live_...)"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none font-mono text-emerald-300 text-xs"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-slate-400 block mb-1 text-[10px]">Endpoint Environment</label>
                <select
                  value={endpointInput}
                  onChange={(e) => setEndpointInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="https://api.tradier.com/v1">Production (https://api.tradier.com/v1)</option>
                  <option value="https://sandbox.tradier.com/v1">Sandbox (https://sandbox.tradier.com/v1)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 text-[10px]">Priority Cascade</label>
                <div className="px-2.5 py-1.5 rounded bg-slate-950/70 border border-slate-800 text-slate-300 font-mono text-[11px] flex items-center justify-between">
                  <span>Schwab &rarr; Tradier &rarr; Model</span>
                </div>
              </div>
            </div>

            {/* Status Message */}
            {statusMessage && (
              <div className={`p-2 rounded text-[11px] flex items-center gap-2 ${
                statusMessage.type === 'success' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/80' : 'bg-rose-950/60 text-rose-300 border border-rose-800/80'
              }`}>
                {statusMessage.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={isValidating || !tokenInput}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
                  <span>{isValidating ? 'Pinging Tradier...' : 'Validate Connection'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>

              {tokenInput && (
                <button
                  type="button"
                  onClick={handleClearToken}
                  className="px-2.5 py-1.5 rounded text-rose-400 hover:bg-rose-950/50 hover:text-rose-300 transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Token</span>
                </button>
              )}
            </div>
          </div>

          {/* Validation Result Box */}
          {validationResult && (
            <div className={`p-3 rounded-lg border font-mono text-[11px] space-y-1.5 ${
              validationResult.valid ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
            }`}>
              <div className="font-bold flex items-center gap-1.5">
                {validationResult.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                <span>{validationResult.message}</span>
              </div>
              {validationResult.quote && (
                <div className="text-slate-300 text-[10px] pl-5 space-y-0.5">
                  <div>Live Ping: <strong>{validationResult.quote.symbol}</strong> Last: ${validationResult.quote.last} (Bid: ${validationResult.quote.bid} / Ask: ${validationResult.quote.ask})</div>
                  <div>Latency: {validationResult.latencyMs}ms to Tradier gateway.</div>
                </div>
              )}
            </div>
          )}

          {/* Options Chain Live Verification */}
          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-sky-400" />
                <span>Test OPRA Option Chains for {currentSymbol}</span>
              </span>
              <button
                type="button"
                onClick={handleTestOptionsChains}
                disabled={isLoadingChains || !tokenInput}
                className="px-2.5 py-1 rounded bg-sky-600/80 hover:bg-sky-500 disabled:opacity-40 text-white font-medium text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingChains ? 'animate-spin' : ''}`} />
                <span>{isLoadingChains ? 'Loading...' : 'Fetch Chain'}</span>
              </button>
            </div>

            {chainsResult && (
              <div className="overflow-x-auto max-h-40 font-mono text-[10px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500">
                      <th className="py-1 px-1.5">Contract</th>
                      <th className="py-1 px-1.5">Strike</th>
                      <th className="py-1 px-1.5">Bid</th>
                      <th className="py-1 px-1.5">Ask</th>
                      <th className="py-1 px-1.5">Delta</th>
                      <th className="py-1 px-1.5">Theta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chainsResult.map((opt: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-900 text-slate-300 hover:bg-slate-800/40">
                        <td className="py-1 px-1.5 text-sky-300">{opt.symbol}</td>
                        <td className="py-1 px-1.5 font-bold">${opt.strike}</td>
                        <td className="py-1 px-1.5">${opt.bid}</td>
                        <td className="py-1 px-1.5">${opt.ask}</td>
                        <td className="py-1 px-1.5 text-emerald-400">{opt.greeks?.delta?.toFixed(2) ?? 'N/A'}</td>
                        <td className="py-1 px-1.5 text-rose-400">{opt.greeks?.theta?.toFixed(3) ?? 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-400">
          <span>Primary: Charles Schwab &middot; Secondary Backup: Tradier</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-medium cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
