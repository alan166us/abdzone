import React, { useState, useEffect } from 'react';
import { Candle } from '../types/trading';
import { 
  X, 
  ExternalLink, 
  CheckCircle2, 
  Key, 
  ArrowRight,
  ShieldCheck,
  Building2,
  RefreshCw,
  AlertCircle,
  Trash2,
  Save
} from 'lucide-react';

interface SchwabConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSchwabCandles: (candles: Candle[], symbolName: string, loadedFreq?: number) => void;
  currentFrequency?: number;
}

export const SchwabConnectModal: React.FC<SchwabConnectModalProps> = ({
  isOpen,
  onClose,
  onLoadSchwabCandles,
  currentFrequency = 60,
}) => {
  const [activeTab, setActiveTab] = useState<'stream' | 'api-keys' | 'thinkorswim'>('stream');
  const [schwabSymbol, setSchwabSymbol] = useState<string>('SPY');
  const [frequency, setFrequency] = useState<number>(currentFrequency); // default to active app frequency
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [schwabStatus, setSchwabStatus] = useState<any>(null);

  // Authentication Wizard State - Auto-retained via localStorage
  const [tokenInput, setTokenInput] = useState<string>(() => {
    try { return localStorage.getItem('schwab_access_token') || ''; } catch { return ''; }
  });
  const [appKeyInput, setAppKeyInput] = useState<string>(() => {
    try { return localStorage.getItem('schwab_app_key') || ''; } catch { return ''; }
  });
  const [appSecretInput, setAppSecretInput] = useState<string>(() => {
    try { return localStorage.getItem('schwab_app_secret') || ''; } catch { return ''; }
  });
  const [redirectUriInput, setRedirectUriInput] = useState<string>(() => {
    try { return localStorage.getItem('schwab_redirect_uri') || 'https://127.0.0.1'; } catch { return 'https://127.0.0.1'; }
  });
  const [authCodeInput, setAuthCodeInput] = useState<string>('');
  const [authMessage, setAuthMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  // Persistence Handlers
  const handleKeyChange = (val: string) => {
    setAppKeyInput(val);
    try { localStorage.setItem('schwab_app_key', val); } catch {}
  };

  const handleSecretChange = (val: string) => {
    setAppSecretInput(val);
    try { localStorage.setItem('schwab_app_secret', val); } catch {}
  };

  const handleRedirectChange = (val: string) => {
    setRedirectUriInput(val);
    try { localStorage.setItem('schwab_redirect_uri', val); } catch {}
  };

  const handleTokenChange = (val: string) => {
    setTokenInput(val);
  };

  const handleClearSavedCredentials = () => {
    try {
      localStorage.removeItem('schwab_app_key');
      localStorage.removeItem('schwab_app_secret');
      localStorage.removeItem('schwab_access_token');
      localStorage.removeItem('schwab_redirect_uri');
    } catch {}
    setAppKeyInput('');
    setAppSecretInput('');
    setTokenInput('');
    setRedirectUriInput('https://127.0.0.1');
    setAuthMessage({ type: 'success', text: 'Saved credentials removed from this device.' });
    fetch('/api/schwab/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '' }),
    }).then(() => fetchStatus());
  };

  const fetchStatus = () => {
    fetch('/api/schwab/status')
      .then((res) => res.json())
      .then((data) => setSchwabStatus(data))
      .catch((err) => console.error('Failed to get Schwab status', err));
  };

  const handleValidateConnection = async () => {
    setIsValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch('/api/schwab/validate', { method: 'POST' });
      const data = await res.json();
      setValidationResult(data);
      fetchStatus();
    } catch (err: any) {
      setValidationResult({
        valid: false,
        authenticated: false,
        message: `Failed to ping server: ${err?.message || err}`,
      });
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (currentFrequency) {
        setFrequency(currentFrequency);
      }
      fetchStatus();
      setAuthMessage(null);
      setValidationResult(null);

      // Auto-sync stored token to server session on open
      try {
        const savedToken = localStorage.getItem('schwab_access_token');
        if (savedToken && (!schwabStatus || !schwabStatus.authenticated)) {
          fetch('/api/schwab/set-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: savedToken }),
          })
            .then(() => fetchStatus())
            .catch(() => {});
        }
      } catch {}
    }
  }, [isOpen, currentFrequency]);

  if (!isOpen) return null;

  const handleFetchSchwabData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/schwab/price-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: schwabSymbol.toUpperCase(),
          frequency: frequency,
        }),
      });

      const json = await res.json();
      if (json.candles && json.candles.length > 0) {
        // Convert Schwab / Real Exchange format { datetime, open, high, low, close, volume } to StrataZone Candle
        const converted: Candle[] = json.candles.map((c: any) => ({
          time: c.datetime,
          dateStr: new Date(c.datetime).toISOString().replace('T', ' ').substring(0, 16),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume || 1000,
        }));

        const sourceLabel = json.source === 'schwab-live-api' ? 'SCHWAB' : 'EXCHANGE';
        onLoadSchwabCandles(converted, `${sourceLabel}:${schwabSymbol.toUpperCase()}`, frequency);
        onClose();
      }
    } catch (err) {
      console.error('Failed to fetch from Schwab API', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetBearerToken = async () => {
    if (!tokenInput.trim()) return;
    setIsAuthenticating(true);
    setAuthMessage(null);
    try {
      const res = await fetch('/api/schwab/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        try { localStorage.setItem('schwab_access_token', tokenInput.trim()); } catch {}
        setAuthMessage({ type: 'success', text: 'Schwab Bearer Token connected and saved to device! Live brokerage data active.' });
        fetchStatus();
      } else {
        setAuthMessage({ type: 'error', text: data.error || 'Failed to apply bearer token' });
      }
    } catch (err: any) {
      setAuthMessage({ type: 'error', text: err.message || 'Connection error' });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleExchangeOAuthCode = async () => {
    if (!authCodeInput.trim()) return;
    setIsAuthenticating(true);
    setAuthMessage(null);
    try {
      const res = await fetch('/api/schwab/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: authCodeInput.trim(),
          appKey: appKeyInput.trim() || undefined,
          secret: appSecretInput.trim() || undefined,
          redirectUri: redirectUriInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.authenticated) {
        if (data.access_token) {
          try {
            localStorage.setItem('schwab_access_token', data.access_token);
            setTokenInput(data.access_token);
          } catch {}
        }
        setAuthMessage({ type: 'success', text: 'OAuth code verified! Successfully connected and saved to device.' });
        fetchStatus();
        setAuthCodeInput('');
      } else {
        setAuthMessage({ type: 'error', text: data.error || 'Failed to exchange authorization code' });
      }
    } catch (err: any) {
      setAuthMessage({ type: 'error', text: err.message || 'OAuth exchange failed' });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const getAuthorizeUrl = () => {
    const key = appKeyInput.trim() || 'YOUR_APP_KEY';
    const redirect = encodeURIComponent(redirectUriInput.trim() || 'https://127.0.0.1');
    return `https://api.schwabapi.com/v1/oauth/authorize?client_id=${key}&redirect_uri=${redirect}`;
  };

  const hasSavedCredentials = Boolean(appKeyInput || tokenInput || appSecretInput);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#0B0F17] border border-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0F172A]/70">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/30">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-display">Charles Schwab Connection & Integration</h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Charles Schwab Trader API & thinkorswim Candlestick Engine
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-800 bg-slate-900/60 px-6 text-xs font-mono">
          <button
            onClick={() => setActiveTab('stream')}
            className={`py-2.5 px-3 border-b-2 font-medium transition-colors ${
              activeTab === 'stream'
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Fetch Schwab Candlesticks
          </button>
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`py-2.5 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'api-keys'
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>2. Connect Schwab Developer API</span>
            {hasSavedCredentials && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Credentials saved" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('thinkorswim')}
            className={`py-2.5 px-3 border-b-2 font-medium transition-colors ${
              activeTab === 'thinkorswim'
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            3. thinkorswim CSV Export
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 font-sans text-xs text-slate-300 space-y-4">
          {activeTab === 'stream' && (
            <div className="space-y-4">
              {/* Status Banner */}
              <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${schwabStatus?.authenticated ? 'bg-emerald-400' : 'bg-sky-400'} animate-pulse`} />
                  <div>
                    <div className="text-white font-mono font-bold text-xs flex items-center gap-2">
                      <span>Schwab Market Gateway: Operational</span>
                      {schwabStatus?.authenticated && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-sans">
                          Live Brokerage Key Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Endpoint: /marketdata/v1/pricehistory (Equities, ETFs, Options)
                    </div>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded bg-sky-950/80 border border-sky-800 text-sky-300 font-mono text-[10px]">
                  {schwabStatus?.authenticated ? 'Live Brokerage Active' : 'Gateway Feed Active'}
                </span>
              </div>

              {/* Symbol Input & Bar Frequency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-mono text-xs">Schwab Ticker Symbol</label>
                  <input
                    type="text"
                    value={schwabSymbol}
                    onChange={(e) => setSchwabSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. SPY, QQQ, NVDA, AAPL, TSLA"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-sky-500 font-bold"
                  />
                  <div className="flex items-center gap-1.5 pt-1 text-[11px] font-mono">
                    <span className="text-slate-500">Quick:</span>
                    {['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSchwabSymbol(s)}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-400 font-mono text-xs">Candle Bar Frequency</label>
                    <span className="text-[10px] font-mono font-semibold text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800">
                      {frequency === 1 ? '1m Intraday' : frequency === 5 ? '5m Intraday' : frequency === 15 ? '15m Intraday' : frequency === 30 ? '30m Tactical' : frequency === 60 ? '1H Standard' : frequency === 240 ? '4H Structural' : 'Daily 1D'}
                    </span>
                  </div>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(parseInt(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    <option value="1">1-Minute Intraday Scalp ⚡</option>
                    <option value="5">5-Minute Momentum / Scalp 🔥</option>
                    <option value="15">15-Minute Intraday</option>
                    <option value="30">30-Minute Tactical</option>
                    <option value="60">1-Hour Standard</option>
                    <option value="240">4-Hour Structural</option>
                    <option value="1440">Daily (1D)</option>
                  </select>
                  <div className="flex items-center gap-1.5 pt-1 text-[11px] font-mono flex-wrap">
                    <span className="text-slate-500">Quick:</span>
                    {[
                      { val: 1, label: '1m ⚡' },
                      { val: 5, label: '5m 🔥' },
                      { val: 15, label: '15m' },
                      { val: 30, label: '30m' },
                      { val: 60, label: '1H' },
                      { val: 240, label: '4H' },
                      { val: 1440, label: '1D' },
                    ].map((f) => (
                      <button
                        key={f.val}
                        type="button"
                        onClick={() => setFrequency(f.val)}
                        className={`px-1.5 py-0.5 rounded transition-colors text-[11px] ${
                          frequency === f.val
                            ? 'bg-sky-600 text-white font-bold ring-1 ring-sky-400'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono pt-0.5">
                    Direct from Charles Schwab &amp; Real-Time Market Gateway (1m &amp; 5m supported)
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 leading-relaxed">
                Clicking <strong className="text-sky-300">Fetch Schwab Candlesticks</strong> pulls the latest 180 bars directly through the Schwab Gateway and maps institutional Demand and Supply zones automatically.
              </div>
            </div>
          )}

          {activeTab === 'api-keys' && (
            <div className="space-y-4 text-xs leading-relaxed">
              {/* Status Header */}
              <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Key className="w-4 h-4 text-sky-400" />
                  <div>
                    <span className="font-bold text-white">Schwab API Authentication Status: </span>
                    <span className={schwabStatus?.authenticated ? 'text-emerald-400 font-bold' : 'text-amber-400 font-semibold'}>
                      {schwabStatus?.authenticated ? 'Authenticated (Live Brokerage Active)' : 'Not Connected (Simulation Active)'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleValidateConnection}
                    disabled={isValidating}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-mono text-[11px] font-semibold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isValidating ? 'animate-spin' : ''}`} />
                    <span>{isValidating ? 'Pinging Schwab...' : 'Ping Test Connection'}</span>
                  </button>

                  <a
                    href="https://developer.schwab.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 hover:underline flex items-center gap-1 font-mono text-[11px]"
                  >
                    <span>developer.schwab.com</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Saved Credentials Retention Banner */}
              {hasSavedCredentials && (
                <div className="px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between font-mono text-[11px]">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Save className="w-3.5 h-3.5" />
                    <span>Credentials automatically retained on this device</span>
                  </div>

                  <button
                    onClick={handleClearSavedCredentials}
                    className="text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1 text-[10px]"
                    title="Remove saved credentials from local storage"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear Saved Credentials</span>
                  </button>
                </div>
              )}

              {/* Validation Ping Results Diagnostic Card */}
              {validationResult && (
                <div className={`p-3.5 rounded-xl border space-y-2 animate-in fade-in font-mono text-xs ${
                  validationResult.valid 
                    ? 'bg-emerald-950/70 border-emerald-700/80 text-emerald-200' 
                    : (validationResult.mode === 'token-expired' || validationResult.mode === 'forbidden'
                        ? 'bg-amber-950/70 border-amber-700/80 text-amber-200'
                        : 'bg-slate-900 border-slate-800 text-slate-300')
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <div className="flex items-center gap-2">
                      {validationResult.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      <span>
                        {validationResult.valid 
                          ? 'SUCCESS: Charles Schwab Live API Verified!' 
                          : (validationResult.mode === 'gateway-simulation' 
                              ? 'Gateway Simulation Active' 
                              : 'Connection Diagnostic Alert')}
                      </span>
                    </div>

                    {validationResult.latencyMs !== undefined && (
                      <span className="px-2 py-0.5 rounded bg-slate-950/80 text-sky-300 text-[10px] border border-slate-800">
                        {validationResult.latencyMs} ms latency
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] leading-relaxed font-sans text-slate-200">
                    {validationResult.message}
                  </p>

                  {validationResult.details && (
                    <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                      {validationResult.details}
                    </div>
                  )}
                </div>
              )}

              {authMessage && (
                <div className={`p-3 rounded-lg flex items-center gap-2 text-xs ${
                  authMessage.type === 'success' 
                    ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' 
                    : 'bg-red-950/80 border border-red-800 text-red-300'
                }`}>
                  {authMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{authMessage.text}</span>
                </div>
              )}

              {/* SCHWAB SANDBOX & DEVELOPER PORTAL SETUP GUIDE */}
              <div className="p-4 rounded-lg bg-sky-950/30 border border-sky-800/50 space-y-2.5">
                <div className="font-bold text-sky-300 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-mono">
                    <ShieldCheck className="w-4 h-4 text-sky-400" />
                    <span>How to Connect with Charles Schwab Developer Sandbox</span>
                  </div>
                  <a
                    href="https://developer.schwab.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-sky-400 hover:text-white underline flex items-center gap-1"
                  >
                    developer.schwab.com
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300 leading-relaxed font-sans pl-1">
                  <li>
                    Log in to <strong className="text-white">developer.schwab.com</strong> with your Charles Schwab brokerage credentials.
                  </li>
                  <li>
                    Go to <strong className="text-white">Dashboard &rarr; Apps</strong> and click <strong className="text-sky-300 font-semibold">+ Create New App</strong>.
                  </li>
                  <li>
                    In the app creation form, enable <strong className="text-emerald-300">Trader API - Market Data</strong> (and <em className="text-slate-300">Trader API - Accounts &amp; Trading</em> for order simulation).
                  </li>
                  <li>
                    In the <strong className="text-white">Callback URL</strong> field, enter: <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300 font-mono">https://127.0.0.1</code>
                  </li>
                  <li>
                    Once approved (new apps status will show <em className="text-emerald-400">Ready For Use</em>), copy your <strong className="text-white">App Key</strong> and <strong className="text-white">Secret</strong> into Method B below.
                  </li>
                  <li>
                    Click <strong className="text-sky-300">1. Authorize on Schwab Portal</strong>, approve access, then copy the redirected browser URL (<code className="text-slate-400 text-[10px]">https://127.0.0.1/?code=...</code>) into step 2 below and click <strong className="text-emerald-400">Authenticate</strong>!
                  </li>
                </ol>
              </div>

              {/* METHOD 1: Quick Paste Bearer Token */}
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2.5">
                <div className="font-bold text-white flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-mono text-[10px]">Method A</span>
                  <span>Connect with Access Token (Fastest)</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  If you already generated an OAuth Bearer Token (via Python, Postman, or your script):
                </p>

                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => handleTokenChange(e.target.value)}
                    placeholder="Paste Schwab Bearer Access Token..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                  />
                  <button
                    onClick={handleSetBearerToken}
                    disabled={isAuthenticating || !tokenInput.trim()}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors font-mono font-medium disabled:opacity-40"
                  >
                    {isAuthenticating ? 'Connecting...' : 'Connect Token'}
                  </button>
                </div>
              </div>

              {/* METHOD 2: OAuth 2.0 Authorization Code Flow */}
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="font-bold text-white flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono text-[10px]">Method B</span>
                  <span>Interactive OAuth 2.0 Flow (Schwab Portal App)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <label className="text-slate-400 font-mono block mb-1">Schwab App Key (Client ID)</label>
                    <input
                      type="text"
                      value={appKeyInput}
                      onChange={(e) => handleKeyChange(e.target.value)}
                      placeholder="e.g. your_app_key@AMER.OAUTHAP"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-mono block mb-1">Schwab App Secret</label>
                    <input
                      type="password"
                      value={appSecretInput}
                      onChange={(e) => handleSecretChange(e.target.value)}
                      placeholder="e.g. your_app_secret"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="text-[11px]">
                  <label className="text-slate-400 font-mono block mb-1">Callback URL (as registered in Schwab portal)</label>
                  <input
                    type="text"
                    value={redirectUriInput}
                    onChange={(e) => handleRedirectChange(e.target.value)}
                    placeholder="https://127.0.0.1"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="pt-1 flex flex-col sm:flex-row gap-2">
                  <a
                    href={getAuthorizeUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 font-mono text-xs flex items-center justify-center gap-1.5 text-center transition-colors"
                  >
                    <span>1. Authorize on Schwab Portal</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-slate-400 font-mono block text-[11px]">
                    2. Paste the Redirected URL or Authorization Code:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={authCodeInput}
                      onChange={(e) => setAuthCodeInput(e.target.value)}
                      placeholder="Paste redirected URL (e.g. https://127.0.0.1/?code=...)"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                    />
                    <button
                      onClick={handleExchangeOAuthCode}
                      disabled={isAuthenticating || !authCodeInput.trim()}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-mono font-medium disabled:opacity-40"
                    >
                      {isAuthenticating ? 'Exchanging...' : 'Authenticate'}
                    </button>
                  </div>
                </div>
              </div>

              {/* METHOD 3: Environment Variables */}
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1.5">
                <div className="text-slate-300 font-bold">Method C: Persistent Environment Variables</div>
                <div>You can also set these in your server environment:</div>
                <div className="text-sky-300 select-all">
                  SCHWAB_APP_KEY="your_key"<br />
                  SCHWAB_SECRET="your_secret"<br />
                  SCHWAB_ACCESS_TOKEN="your_token"
                </div>
              </div>
            </div>
          )}

          {activeTab === 'thinkorswim' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-300 leading-relaxed">
                If you use **thinkorswim** (desktop, web, or mobile) through Charles Schwab, you can export raw candlestick data directly in seconds without needing a developer key:
              </div>

              <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2.5 text-xs font-sans">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  <span>How to Export from thinkorswim Desktop (TOS):</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 leading-relaxed pl-1">
                  <li>Open any stock, ETF, or future chart in thinkorswim.</li>
                  <li>Set your desired timeframe (e.g. 15m, 1h, or Daily).</li>
                  <li>Click the <strong className="text-white">Style / Chart Settings</strong> icon or right-click directly on the chart background.</li>
                  <li>Select <strong className="text-sky-300 font-semibold">Data Export &rarr; Export to CSV...</strong></li>
                  <li>Save the file to your computer.</li>
                  <li>Close this modal and click <strong className="text-emerald-400 font-semibold">Import CSV</strong> on the top bar to drop it in!</li>
                </ol>
              </div>

              <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2.5 text-xs font-sans">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>How to Export from Schwab.com Web Trader:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 leading-relaxed pl-1">
                  <li>Log in to <strong className="text-white">schwab.com</strong> and navigate to Research &rarr; Stocks &rarr; Charts.</li>
                  <li>Select the ticker and timeframe.</li>
                  <li>Click <strong className="text-white">Download Historical Prices</strong> (available on the price history table).</li>
                  <li>StrataZone automatically recognizes Schwab's date, price, and volume formatting!</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-mono">
            Provider: Charles Schwab & Co., Inc.
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Close
            </button>

            {activeTab === 'stream' && (
              <button
                onClick={handleFetchSchwabData}
                disabled={isLoading}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors font-medium text-xs font-mono flex items-center gap-1.5 shadow-sm"
              >
                {isLoading ? (
                  <span>Connecting to Schwab...</span>
                ) : (
                  <>
                    <span>Fetch Schwab Candlesticks</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
