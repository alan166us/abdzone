import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  StepForward, 
  Upload, 
  Sparkles, 
  SlidersHorizontal, 
  Building2, 
  ShieldCheck, 
  Bot,
  Search,
  BookOpen,
  Radio,
  Settings,
  ChevronDown,
  CheckCircle2,
  LineChart,
  LayoutGrid,
  Calculator,
  Flame,
  Zap,
  Lock,
  Activity
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export type ActiveTab = 'chart' | 'options' | 'monitor' | 'radar' | 'journal' | 'volatility' | 'backtest' | 'sizer';

interface TopNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isSimulating: boolean;
  onToggleSimulate: () => void;
  onStepCandle: () => void;
  onOpenImport: () => void;
  onOpenSchwab?: () => void;
  onOpenDiagnostics?: () => void;
  onOpenAiAnalyst: () => void;
  onOpenAiChat?: () => void;
  onOpenQaMonitor?: () => void;
  selectedAsset: string;
  onSelectAsset: (symbol: string) => void;
  alertCount?: number;
  frequency?: number;
  onFrequencyChange?: (freq: number) => void;
  lastSyncTime?: string;
  isLiveSyncing?: boolean;
  serverStatus?: 'connected' | 'stale' | 'disconnected';
  onRetryConnection?: () => void;
  isSynthetic?: boolean;
  anchorPrice?: number;
}

// Institutional Schwab Stocks & ETFs with Active Option Chains
const POPULAR_EQUITIES = [
  { symbol: 'SPY', name: 'SPY (S&P 500 ETF · High Liquid Options)' },
  { symbol: 'PLTR', name: 'PLTR (Palantir Technologies · AI Momentum)' },
  { symbol: 'TSLA', name: 'TSLA (Tesla · High Option Gamma)' },
  { symbol: 'IREN', name: 'IREN (Iris Energy Ltd · High Beta Options)' },
  { symbol: 'SPCX', name: 'SPCX (The SPAC & Pre-Merger ETF)' },
  { symbol: 'QQQ', name: 'QQQ (Nasdaq 100 ETF · High Beta)' },
  { symbol: 'NVDA', name: 'NVDA (NVIDIA · Mega Tech Volatility)' },
  { symbol: 'AAPL', name: 'AAPL (Apple Inc.)' },
  { symbol: 'MSFT', name: 'MSFT (Microsoft Corp.)' },
  { symbol: 'AMD', name: 'AMD (Advanced Micro Devices)' },
  { symbol: 'AMZN', name: 'AMZN (Amazon.com)' },
  { symbol: 'META', name: 'META (Meta Platforms)' },
  { symbol: 'IWM', name: 'IWM (Russell 2000 Small Cap ETF)' },
];

// Charles Schwab & thinkorswim Futures Contracts
const POPULAR_FUTURES = [
  { symbol: '/MES', name: '/MES (Micro E-mini S&P 500 Futures)' },
  { symbol: '/ES', name: '/ES (E-mini S&P 500 Futures)' },
  { symbol: '/MNQ', name: '/MNQ (Micro E-mini Nasdaq 100 Futures)' },
  { symbol: '/NQ', name: '/NQ (E-mini Nasdaq 100 Futures)' },
  { symbol: '/RTY', name: '/RTY (Russell 2000 E-mini Futures)' },
  { symbol: '/CL', name: '/CL (Crude Oil Futures)' },
  { symbol: '/GC', name: '/GC (Gold Futures)' },
];

// Secondary Research & Analysis Tools Metadata for Dropdown
const SECONDARY_TOOLS: { id: ActiveTab; label: string; shortLabel: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'journal', label: 'Trading Journal', shortLabel: 'Journal', desc: 'Trade log, win/loss stats & edge analysis', icon: BookOpen },
  { id: 'radar', label: 'Zone Radar Grid', shortLabel: 'Radar', desc: 'Multi-zone detection & freshness scanner', icon: LayoutGrid },
  { id: 'volatility', label: 'Volatility Matrix', shortLabel: 'Volatility', desc: 'IV rank, ATR buffers & historical distributions', icon: SlidersHorizontal },
  { id: 'backtest', label: 'Strategy Backtest', shortLabel: 'Backtest', desc: 'Historical supply & demand win-rate testing', icon: Play },
  { id: 'sizer', label: 'Risk Sizer', shortLabel: 'Risk Sizer', desc: 'Position sizing & capital preservation control', icon: Calculator },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onTabChange,
  isSimulating,
  onToggleSimulate,
  onStepCandle,
  onOpenImport,
  onOpenSchwab,
  onOpenDiagnostics,
  onOpenAiAnalyst,
  onOpenAiChat,
  onOpenQaMonitor,
  selectedAsset,
  onSelectAsset,
  alertCount = 0,
  frequency = 60,
  onFrequencyChange,
  lastSyncTime = '5s',
  isLiveSyncing = true,
  serverStatus = 'connected',
  onRetryConnection,
  isSynthetic = false,
  anchorPrice,
}) => {
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(event.target as Node)) {
        setIsToolsOpen(false);
      }
      if (configRef.current && !configRef.current.contains(event.target as Node)) {
        setIsConfigOpen(false);
      }
    };
    if (isToolsOpen || isConfigOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isToolsOpen, isConfigOpen]);

  const [customTickers, setCustomTickers] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('strata_custom_tickers');
      return saved ? JSON.parse(saved) : ['/MES', '/ES', '/NQ'];
    } catch {
      return ['/MES', '/ES', '/NQ'];
    }
  });

  // Ensure selectedAsset is in customTickers if non-standard
  useEffect(() => {
    if (!selectedAsset) return;
    const clean = selectedAsset.toUpperCase().trim();
    const isStandard = 
      POPULAR_EQUITIES.some((e) => e.symbol === clean) || 
      POPULAR_FUTURES.some((f) => f.symbol === clean);

    if (!isStandard) {
      setCustomTickers((prev) => {
        if (!prev.includes(clean)) {
          const updated = [clean, ...prev].slice(0, 15);
          try {
            localStorage.setItem('strata_custom_tickers', JSON.stringify(updated));
          } catch {}
          return updated;
        }
        return prev;
      });
    }
  }, [selectedAsset]);

  const isCurrentInStandard = 
    POPULAR_EQUITIES.some((e) => e.symbol === selectedAsset) || 
    POPULAR_FUTURES.some((f) => f.symbol === selectedAsset);

  // Check if a secondary tool is currently active
  const activeSecondaryTool = SECONDARY_TOOLS.find((t) => t.id === activeTab);
  const isSecondaryActive = Boolean(activeSecondaryTool);

  return (
    <header className="flex items-center justify-between px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 border-b border-slate-800 bg-[#0B0F17] select-none shrink-0 z-40 relative min-w-0 max-w-full">
      {/* Zone 1 (Left): Wordmark, Active Ticker & Real-Time Timeframe */}
      <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 shrink-0 min-w-0">
        <a 
          href="#" 
          onClick={(e) => { e.preventDefault(); onTabChange('chart'); }}
          className="text-base sm:text-lg font-bold tracking-tight text-white font-display hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
        >
          <span>StrataZone</span>
        </a>

        {/* Tri-State Feed Status Pill */}
        <div 
          onClick={serverStatus !== 'connected' ? onRetryConnection : undefined}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono shrink-0 transition-all ${
            serverStatus === 'disconnected'
              ? 'bg-rose-950/90 border border-rose-500 text-rose-300 animate-pulse cursor-pointer shadow-sm shadow-rose-950'
              : serverStatus === 'stale'
              ? 'bg-amber-950/80 border border-amber-500/80 text-amber-300 cursor-pointer'
              : 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-400'
          }`}
          title={
            serverStatus === 'disconnected'
              ? '✖ SERVER LOST · RECONNECTING... (Click to retry immediately)'
              : serverStatus === 'stale'
              ? '▲ FEED: STALE (>20s without heartbeat · Click to refresh)'
              : `● FEED: LIVE (Synced every ${lastSyncTime})`
          }
        >
          {serverStatus === 'disconnected' ? (
            <>
              <span className="text-rose-400 font-bold">✖</span>
              <span className="font-semibold hidden xs:inline">SERVER LOST · RECONNECTING...</span>
              <span className="font-semibold xs:hidden">SERVER LOST</span>
            </>
          ) : serverStatus === 'stale' ? (
            <>
              <span className="text-amber-400 font-bold">▲</span>
              <span className="font-semibold">FEED: STALE</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold">{isSimulating ? 'REPLAY' : '● FEED: LIVE'}</span>
            </>
          )}
        </div>

        {/* Demo Simulation Badge when in synthetic mode */}
        {isSynthetic && (
          <div 
            className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/40 text-amber-300 text-[10px] font-mono shrink-0"
            title="Synthetic price walk clamped within ±2.5% of live reference anchor"
          >
            <span>⚠ DEMO SIMULATION</span>
            {anchorPrice !== undefined && (
              <span className="text-amber-200 font-bold">(Anchor: ${anchorPrice.toFixed(2)})</span>
            )}
          </div>
        )}

        {/* Quick Schwab Stock, Option & Futures Selector */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded px-2 py-1 gap-1.5 text-xs shrink min-w-0">
          <span className="text-sky-400 font-mono font-bold flex items-center gap-1 shrink-0">
            <Building2 className="w-3 h-3" />
            <span className="hidden md:inline">TICKER:</span>
          </span>
          <select 
            value={selectedAsset}
            onChange={(e) => onSelectAsset(e.target.value)}
            className="bg-transparent text-white font-mono font-bold focus:outline-none cursor-pointer max-w-[100px] sm:max-w-[130px] md:max-w-[170px] truncate"
          >
            {!isCurrentInStandard && (
              <optgroup label="Active Selected Ticker">
                <option value={selectedAsset} className="bg-slate-900 font-bold text-sky-400">
                  ★ {selectedAsset} (Active)
                </option>
              </optgroup>
            )}

            <optgroup label="Schwab / thinkorswim Futures (/MES, /ES, /NQ)">
              {POPULAR_FUTURES.map((item) => (
                <option key={item.symbol} value={item.symbol} className="bg-slate-900 text-sky-300">
                  {item.name}
                </option>
              ))}
            </optgroup>

            <optgroup label="Popular Equities & ETFs">
              {POPULAR_EQUITIES.map((item) => (
                <option key={item.symbol} value={item.symbol} className="bg-slate-900 text-slate-200">
                  {item.name}
                </option>
              ))}
            </optgroup>

            {customTickers.filter(
              (t) => !POPULAR_EQUITIES.some((e) => e.symbol === t) && !POPULAR_FUTURES.some((f) => f.symbol === t)
            ).length > 0 && (
              <optgroup label="Custom Searched Tickers">
                {customTickers
                  .filter(
                    (t) => !POPULAR_EQUITIES.some((e) => e.symbol === t) && !POPULAR_FUTURES.some((f) => f.symbol === t)
                  )
                  .map((ticker) => (
                    <option key={ticker} value={ticker} className="bg-slate-900 text-emerald-300">
                      {ticker} {ticker === selectedAsset ? '(Active)' : ''}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* Global Candle Bar Frequency Selector (1m, 5m, 15m, 30m, 1H, 4H, 1D) */}
        {onFrequencyChange && (
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded px-2 py-1 gap-1 text-xs font-mono shrink-0">
            <span className="text-slate-400 text-[11px]">TF:</span>
            <select
              value={frequency}
              onChange={(e) => onFrequencyChange(parseInt(e.target.value))}
              className="bg-transparent text-white font-mono font-bold focus:outline-none cursor-pointer"
              title="Global Candle Bar Frequency"
            >
              <option value="1" className="bg-slate-900 text-sky-400 font-bold">⚡ 1m (Scalp)</option>
              <option value="5" className="bg-slate-900 text-amber-400 font-bold">🔥 5m (Intraday)</option>
              <option value="15" className="bg-slate-900 text-slate-200">15m (Day)</option>
              <option value="30" className="bg-slate-900 text-slate-200">30m (Tactical)</option>
              <option value="60" className="bg-slate-900 text-slate-200">1H (Swing)</option>
              <option value="240" className="bg-slate-900 text-slate-200">4H (Trend)</option>
              <option value="1440" className="bg-slate-900 text-slate-200">1D (Daily)</option>
            </select>
          </div>
        )}
      </div>

      {/* Zone 2 (Center): Optimized, Streamlined Core Navigation */}
      {/* Exactly 3 Core Action Tabs + 1 Compact Tools Dropdown = NEVER COLLIDES */}
      <nav className="flex items-center gap-1 sm:gap-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-lg text-xs font-medium shrink min-w-0">
        {/* TAB 1: Main Chart Terminal */}
        <button
          onClick={() => onTabChange('chart')}
          className={`px-2.5 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'chart'
              ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40 shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
          title="Live Candlestick Terminal & Zone Imbalances"
        >
          <LineChart className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Terminal</span>
        </button>

        {/* TAB 2: Opportunity Monitor (Proximity Scanner) */}
        <button
          onClick={() => onTabChange('monitor')}
          className={`px-2.5 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'monitor'
              ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
          title="Real-Time Zone Proximity Scanner & Trade Alerts"
        >
          <Radio className={`w-3.5 h-3.5 shrink-0 ${alertCount && alertCount > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
          <span>Scanner</span>
          {alertCount && alertCount > 0 ? (
            <span className="px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-amber-500 text-slate-950 animate-pulse leading-none">
              {alertCount}
            </span>
          ) : null}
        </button>

        {/* TAB 3: Schwab Options Trader */}
        <button
          onClick={() => onTabChange('options')}
          className={`px-2.5 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'options'
              ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/40 shadow-sm'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}
          title="Schwab & thinkorswim Options Chains and Order Tickets"
        >
          <Building2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>Options</span>
        </button>

        {/* TAB 4: Secondary Tools Dropdown (Journal, Radar, Volatility, Backtest, Risk Sizer) */}
        <div className="relative shrink-0" ref={toolsRef}>
          <button
            onClick={() => setIsToolsOpen((prev) => !prev)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
              isSecondaryActive
                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Additional Research & Analysis Tools"
          >
            <span>{isSecondaryActive ? `Tools · ${activeSecondaryTool?.shortLabel}` : 'Tools'}</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isToolsOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Tools Popover Menu */}
          {isToolsOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-60 rounded-xl bg-[#0D131F] border border-slate-800 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800/80 mb-1 flex items-center justify-between">
                <span>Research &amp; Analysis</span>
                <span className="text-slate-400">5 Tools</span>
              </div>
              {SECONDARY_TOOLS.map((tool) => {
                const Icon = tool.icon;
                const isSelected = activeTab === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => {
                      onTabChange(tool.id);
                      setIsToolsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer group ${
                      isSelected
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'hover:bg-slate-800/80 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400 group-hover:text-white'
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className={`text-xs font-medium truncate ${isSelected ? 'text-amber-200 font-semibold' : 'text-white'}`}>
                          {tool.label}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {tool.desc}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Zone 3 (Right): AI Analyst & Setup Dropdown (Clean, Isolated, Zero Overlap) */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Real-Time Gemini AI Chat / Copilot */}
        {onOpenAiChat && (
          <button
            onClick={onOpenAiChat}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 rounded-lg transition-colors cursor-pointer shadow-sm whitespace-nowrap"
            title="Chat in real-time with Gemini Market Copilot"
          >
            <Bot className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
            <span>AI Copilot</span>
          </button>
        )}

        {/* AI Order Flow & Zone Debrief */}
        <button
          onClick={onOpenAiAnalyst}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer shadow-sm shadow-emerald-950 whitespace-nowrap shrink-0"
          title="AI Order Flow & Market Structure Debrief"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">AI Debrief</span>
          <span className="sm:hidden">AI</span>
        </button>

        {/* QA Safety Status Pill (Real Money Protection Gate) */}
        {onOpenQaMonitor && (
          <button
            onClick={onOpenQaMonitor}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono font-medium rounded-lg border border-rose-800/80 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 transition-colors cursor-pointer shadow-sm whitespace-nowrap shrink-0"
            title="Institutional QA Safety Interlock: Real-money routing is strictly locked. Click to inspect QA Monitor & Pre-Flight Checklist."
          >
            <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="hidden xl:inline">QA Safety:</span>
            <span className="text-amber-300 font-bold">Real Money Locked</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="QA Gate Active" />
          </button>
        )}

        {/* PWA Standalone Desktop / Mobile Install Button */}
        <PWAInstallButton variant="nav" />

        {/* Configuration, Setup & Feeds Dropdown */}
        <div className="relative shrink-0" ref={configRef}>
          <button
            onClick={() => setIsConfigOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              isConfigOpen
                ? 'bg-sky-600 text-white border-sky-500 shadow-md shadow-sky-950/60'
                : isSimulating
                ? 'bg-amber-950/50 text-amber-300 border-amber-700/80 hover:bg-amber-900/60'
                : 'text-slate-300 bg-slate-900 hover:bg-slate-800 border-slate-800 hover:text-white'
            }`}
            title="Configure Charles Schwab API, CSV Imports, Diagnostics, and Simulation Replay"
          >
            <Settings className={`w-3.5 h-3.5 shrink-0 ${isConfigOpen ? 'rotate-90 text-white' : 'text-slate-400'} transition-transform duration-200`} />
            <span className="font-semibold hidden sm:inline">Setup</span>
            {isSimulating && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" title="Simulation Replay Active" />
            )}
            <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isConfigOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Setup Modal Card */}
          {isConfigOpen && (
            <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-24px)] rounded-xl bg-[#0D131F] border border-slate-800 shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-sky-400" />
                  <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">Configuration &amp; Setup</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  Settings
                </span>
              </div>

              {/* SECTION 1: BROKER & DATA INTEGRATIONS */}
              <div className="space-y-1.5 mb-3">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 px-1">
                  Broker &amp; Data Integration
                </div>

                {onOpenSchwab && (
                  <button
                    onClick={() => {
                      setIsConfigOpen(false);
                      onOpenSchwab();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-sky-500/50 text-left transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded bg-sky-950/80 border border-sky-800/80 flex items-center justify-center shrink-0 group-hover:border-sky-500">
                        <Building2 className="w-4 h-4 text-sky-400" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white group-hover:text-sky-300">Charles Schwab Trader API</div>
                        <div className="text-[10px] text-slate-400">OAuth tokens, gateway keys &amp; live sync</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-sky-400 group-hover:translate-x-0.5 transition-transform">Open &rarr;</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsConfigOpen(false);
                    onOpenImport();
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center shrink-0 group-hover:border-emerald-500">
                      <Upload className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white group-hover:text-emerald-300">Import CSV Candles</div>
                      <div className="text-[10px] text-slate-400">thinkorswim & Schwab exports, Binance</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 group-hover:translate-x-0.5 transition-transform">Import &rarr;</span>
                </button>
              </div>

              {/* SECTION 2: MARKET SIMULATION & REPLAY */}
              <div className="space-y-1.5 mb-3">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 px-1">
                  Simulation &amp; Market Replay
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5 text-amber-400" />
                      <span>Market Replay Mode</span>
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      isSimulating 
                        ? 'bg-amber-950 text-amber-300 border border-amber-700' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {isSimulating ? 'Active' : 'Live Feeds'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={onToggleSimulate}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                        isSimulating 
                          ? 'bg-amber-600 hover:bg-amber-500 text-white' 
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isSimulating ? 'Pause Replay' : 'Start Replay'}</span>
                    </button>

                    <button
                      onClick={onStepCandle}
                      disabled={isSimulating}
                      className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded transition-colors cursor-pointer"
                      title="Step 1 Candle Forward"
                    >
                      <StepForward className="w-3.5 h-3.5" />
                      <span>Step</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION 3: SYSTEM VERIFICATION & DIAGNOSTICS */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 px-1">
                  Diagnostics &amp; System Health
                </div>

                {onOpenQaMonitor && (
                  <button
                    onClick={() => {
                      setIsConfigOpen(false);
                      onOpenQaMonitor();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800/90 border border-rose-900/50 hover:border-rose-500/70 text-left transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded bg-rose-950/80 border border-rose-800/80 flex items-center justify-center shrink-0 group-hover:border-rose-500">
                        <Lock className="w-4 h-4 text-rose-400" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white group-hover:text-rose-300">QA Order Monitor &amp; Safety Lock</div>
                        <div className="text-[10px] text-slate-400">8 guardrails · dry-run simulator · audit trail</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-rose-400 group-hover:translate-x-0.5 transition-transform">Inspect &rarr;</span>
                  </button>
                )}

                {onOpenDiagnostics && (
                  <button
                    onClick={() => {
                      setIsConfigOpen(false);
                      onOpenDiagnostics();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 text-left transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center shrink-0 group-hover:border-emerald-500">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white group-hover:text-emerald-300">Automated Verification Suite</div>
                        <div className="text-[10px] text-slate-400">12 health checks &amp; test suites</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 group-hover:translate-x-0.5 transition-transform">Run &rarr;</span>
                  </button>
                )}
              </div>

              {/* SECTION 4: DESKTOP & STANDALONE APP */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 px-1">
                  Desktop &amp; Standalone Experience
                </div>
                <PWAInstallButton variant="menu" />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
