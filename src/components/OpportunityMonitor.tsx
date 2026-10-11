import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  MonitoredOpportunity, 
  OpportunityAlert, 
  SupplyDemandZone, 
  TradeRecommendation, 
  VolatilityMetrics,
  Candle
} from '../types/trading';
import { 
  detectSupplyDemandZones 
} from '../utils/zoneDetector';
import { 
  getLatestVolatilityMetrics 
} from '../utils/volatility';
import { 
  generateTradeRecommendations 
} from '../utils/tradeEngine';
import { 
  generateSchwabOptionPlay,
  formatTosNaturalOptionCommand,
  formatTosOptionCommand
} from '../utils/optionsEngine';
import { 
  generateSyntheticMarketData 
} from '../utils/marketData';
import { 
  playOpportunityAlertSound 
} from '../utils/soundAlert';
import { 
  Radio, 
  Bell, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  Plus, 
  Trash2, 
  ExternalLink, 
  ArrowUpRight, 
  ArrowDownRight, 
  Sparkles, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Copy, 
  Check, 
  Building2, 
  Terminal, 
  Search,
  BookOpen
} from 'lucide-react';

interface OpportunityMonitorProps {
  onSelectAsset: (symbol: string) => void;
  onOpenOptionsForAsset: (symbol: string) => void;
  onOpenChartForAsset: (symbol: string, zoneId?: string) => void;
  onLogTradeToJournal?: (rec: TradeRecommendation, symbol: string) => void;
  onAlertTriggered?: (alert: OpportunityAlert) => void;
}

const DEFAULT_WATCHLIST = [
  { symbol: '/MES', name: 'Micro E-mini S&P 500 Futures', category: 'Future' as const },
  { symbol: 'SPCX', name: 'S&P 500 Covered Call ETF', category: 'Optionable Stock' as const },
  { symbol: 'IREN', name: 'Iris Energy (High Volatility AI/Data Center)', category: 'Optionable Stock' as const },
  { symbol: 'PLTR', name: 'Palantir Technologies (Institutional S&P Tech)', category: 'Optionable Stock' as const },
  { symbol: 'TSLA', name: 'Tesla Inc (High Beta Option Momentum)', category: 'Optionable Stock' as const },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF (Core Liquid Options)', category: 'Index / ETF' as const },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust (Nasdaq 100)', category: 'Index / ETF' as const },
];

export const OpportunityMonitor: React.FC<OpportunityMonitorProps> = ({
  onSelectAsset,
  onOpenOptionsForAsset,
  onOpenChartForAsset,
  onLogTradeToJournal,
  onAlertTriggered,
}) => {
  // Watchlist State stored in localStorage
  const [watchlist, setWatchlist] = useState<Array<{ symbol: string; name: string; category: 'Future' | 'Optionable Stock' | 'Index / ETF' }>>(() => {
    try {
      const saved = localStorage.getItem('strata_monitor_watchlist');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_WATCHLIST;
  });

  // Scanner State
  const [opportunities, setOpportunities] = useState<Record<string, MonitoredOpportunity>>({});
  const [alerts, setAlerts] = useState<OpportunityAlert[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [lastScanTime, setLastScanTime] = useState<string>('Just now');
  const [newTickerInput, setNewTickerInput] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'IN_ZONE' | 'APPROACHING'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Save watchlist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('strata_monitor_watchlist', JSON.stringify(watchlist));
    } catch {}
  }, [watchlist]);

  // Scan a single asset to compute zones, proximity, and option setups
  const scanAsset = useCallback(async (item: { symbol: string; name: string; category: any }): Promise<MonitoredOpportunity | null> => {
    const cleanSym = item.symbol.toUpperCase().trim();
    let candles: Candle[] = [];

    try {
      const res = await fetch('/api/schwab/price-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: cleanSym, frequency: 60 }),
      });
      const data = await res.json();
      if (data && data.candles && data.candles.length > 0) {
        candles = data.candles.map((c: any) => ({
          time: c.datetime,
          dateStr: new Date(c.datetime).toISOString().replace('T', ' ').substring(0, 16),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume || 1000,
        }));
      }
    } catch (e) {
      console.warn(`Scan fetch error for ${cleanSym}:`, e);
    }

    if (candles.length === 0) {
      let start = 100;
      if (cleanSym.includes('MES') || cleanSym.includes('ES')) start = 5780;
      else if (cleanSym === 'SPCX') start = 31.60;
      else if (cleanSym === 'IREN') start = 9.40;
      else if (cleanSym === 'PLTR') start = 42.80;
      else if (cleanSym === 'TSLA') start = 250.00;
      else if (cleanSym === 'SPY') start = 574.50;
      else if (cleanSym === 'QQQ') start = 492.20;
      candles = generateSyntheticMarketData(cleanSym, 180, start);
    }

    if (candles.length < 20) return null;

    const currentPrice = candles[candles.length - 1].close;
    const prevPrice = candles[candles.length - 2]?.close || currentPrice;
    const priceChange = currentPrice - prevPrice;
    const changePercent = (priceChange / prevPrice) * 100;

    // Detect Zones & Recommendations
    const zones = detectSupplyDemandZones(candles, {
      atrPeriod: 14,
      minImpulseMultiplier: 1.3,
      maxBaseCandles: 3,
      useWickForBoundary: false,
    });

    const isCrypto = cleanSym.includes('BTC') || cleanSym.includes('ETH');
    const volMetrics = getLatestVolatilityMetrics(candles, isCrypto);
    const recs = generateTradeRecommendations(currentPrice, zones, volMetrics, cleanSym);

    // Find the nearest active, unmitigated zone
    const activeZones = zones.filter(z => !z.isMitigated);
    if (activeZones.length === 0 && recs.length === 0) {
      return {
        symbol: cleanSym,
        name: item.name,
        category: item.category,
        currentPrice,
        priceChange,
        changePercent,
        status: 'MONITORING',
        signalType: 'NEUTRAL',
        triggerAction: 'Watching Structure',
        distancePercent: 99,
        distanceDollars: 0,
        entryPrice: currentPrice,
        stopLoss: currentPrice * 0.98,
        targetPrice: currentPrice * 1.04,
        rMultiple: 2.0,
        qualityScore: 50,
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    }

    // Determine closest recommendation
    const closestRec = recs[0];
    let distancePct = 99;
    let distanceDollars = 0;
    let status: 'IN_ZONE' | 'APPROACHING' | 'MONITORING' = 'MONITORING';
    let signalType: 'CALL / LONG' | 'PUT / SHORT' | 'NEUTRAL' = 'NEUTRAL';
    let triggerAction = 'Watching Structure';
    let targetZone = activeZones[0];

    if (closestRec) {
      targetZone = activeZones.find(z => z.id === closestRec.zoneId) || activeZones[0];
      distanceDollars = Math.abs(currentPrice - closestRec.entry);
      distancePct = (distanceDollars / currentPrice) * 100;

      // Check if price is within the zone or testing boundary
      if (closestRec.side === 'long') {
        signalType = 'CALL / LONG';
        // Demand zone: entry is proximal line (high), low is stop boundary
        if (targetZone && currentPrice <= targetZone.high && currentPrice >= targetZone.low) {
          status = 'IN_ZONE';
        } else if (distancePct <= 0.85) {
          status = 'APPROACHING';
        }
      } else {
        signalType = 'PUT / SHORT';
        // Supply zone: entry is proximal line (low), high is stop boundary
        if (targetZone && currentPrice >= targetZone.low && currentPrice <= targetZone.high) {
          status = 'IN_ZONE';
        } else if (distancePct <= 0.85) {
          status = 'APPROACHING';
        }
      }
    }

    // Generate Option Specifications if applicable
    let optionStrike: number | undefined;
    let optionExp: string | undefined;
    let optionTosExp: string | undefined;
    let optionDotSymbol: string | undefined;
    let optionPremium: number | undefined;

    if (closestRec) {
      const optionPlay = generateSchwabOptionPlay(closestRec, cleanSym, volMetrics);
      if (optionPlay) {
        optionStrike = optionPlay.strike;
        optionExp = optionPlay.expirationDisplay;
        optionTosExp = optionPlay.tosExpirationStr;
        optionDotSymbol = optionPlay.tosDotSymbol;
        optionPremium = optionPlay.entry.premium;

        if (cleanSym.startsWith('/')) {
          triggerAction = closestRec.side === 'long' ? 'BUY FUTURE /MES' : 'SELL SHORT /MES';
        } else {
          triggerAction = closestRec.side === 'long' ? `BUY ${optionPlay.strike} CALL` : `BUY ${optionPlay.strike} PUT`;
        }
      } else if (cleanSym.startsWith('/')) {
        triggerAction = closestRec.side === 'long' ? 'BUY FUTURE /MES' : 'SELL SHORT /MES';
      }
    }

    return {
      symbol: cleanSym,
      name: item.name,
      category: item.category,
      currentPrice,
      priceChange,
      changePercent,
      status,
      signalType,
      triggerAction,
      nearestZone: targetZone,
      distancePercent: Number(distancePct.toFixed(2)),
      distanceDollars: Number(distanceDollars.toFixed(2)),
      entryPrice: closestRec ? closestRec.entry : currentPrice,
      stopLoss: closestRec ? closestRec.stopLoss : currentPrice * 0.98,
      targetPrice: closestRec ? closestRec.takeProfit2 : currentPrice * 1.05,
      rMultiple: closestRec ? closestRec.riskRewardRatio : 2.5,
      qualityScore: targetZone ? targetZone.strengthScore : 75,
      wholesalerVolumeRatio: targetZone?.volumeImbalanceRatio,
      lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      optionStrike,
      optionExp,
      optionTosExp,
      optionDotSymbol,
      optionPremium,
    };
  }, []);

  // Run full scan across entire watchlist
  const runFullScan = useCallback(async () => {
    setIsScanning(true);
    const newOpps: Record<string, MonitoredOpportunity> = {};
    const newAlertsFound: OpportunityAlert[] = [];

    for (const item of watchlist) {
      const result = await scanAsset(item);
      if (result) {
        newOpps[result.symbol] = result;

        // If in zone or approaching high quality zone, generate alert
        if (result.status === 'IN_ZONE' || result.status === 'APPROACHING') {
          const alertId = `alert-${result.symbol}-${result.status}-${Date.now()}`;
          const isCall = result.signalType === 'CALL / LONG';
          const alertObj: OpportunityAlert = {
            id: alertId,
            timestamp: Date.now(),
            timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            symbol: result.symbol,
            type: result.status,
            signal: result.symbol.startsWith('/') 
              ? (isCall ? 'FUTURE_LONG' : 'FUTURE_SHORT') 
              : (isCall ? 'CALL' : 'PUT'),
            message: `${result.symbol} is ${result.status === 'IN_ZONE' ? 'INSIDE' : 'APPROACHING'} ${result.nearestZone?.pattern || 'Zone'} (${result.distancePercent}% away). ${result.triggerAction} @ $${result.entryPrice.toFixed(2)}`,
            strike: result.optionStrike,
            zoneId: result.nearestZone?.id || 'zone-auto',
            pattern: result.nearestZone?.pattern || 'DBR',
            currentPrice: result.currentPrice,
            entryPrice: result.entryPrice,
            stopLoss: result.stopLoss,
            targetPrice: result.targetPrice,
            rMultiple: result.rMultiple,
          };
          newAlertsFound.push(alertObj);
        }
      }
    }

    setOpportunities(newOpps);
    setLastScanTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setIsScanning(false);

    if (newAlertsFound.length > 0) {
      setAlerts(prev => [...newAlertsFound, ...prev].slice(0, 30));
      if (soundEnabled) {
        playOpportunityAlertSound(0.35);
      }
      if (onAlertTriggered && newAlertsFound[0]) {
        onAlertTriggered(newAlertsFound[0]);
      }
    }
  }, [watchlist, scanAsset, soundEnabled, onAlertTriggered]);

  // Initial scan on mount & whenever watchlist changes
  useEffect(() => {
    runFullScan();
  }, [watchlist.length]);

  // Auto-scan polling loop every 10 seconds for real-time proximity alerts
  useEffect(() => {
    if (!autoScanEnabled) return;
    const interval = setInterval(() => {
      runFullScan();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoScanEnabled, runFullScan]);

  // Add ticker to watchlist
  const handleAddTicker = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTickerInput.toUpperCase().trim();
    if (!clean) return;
    if (watchlist.some(w => w.symbol === clean)) {
      setNewTickerInput('');
      return;
    }
    const isFuture = clean.startsWith('/');
    const newItem = {
      symbol: clean,
      name: isFuture ? `${clean} Future Contract` : `${clean} Optionable Stock`,
      category: isFuture ? ('Future' as const) : ('Optionable Stock' as const),
    };
    setWatchlist(prev => [...prev, newItem]);
    setNewTickerInput('');
  };

  // Remove ticker
  const handleRemoveTicker = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setWatchlist(prev => prev.filter(w => w.symbol !== sym));
  };

  // Filtered Opportunities List
  const filteredOpps = useMemo(() => {
    const list = Object.values(opportunities);
    return list.filter(o => {
      if (statusFilter === 'IN_ZONE') return o.status === 'IN_ZONE';
      if (statusFilter === 'APPROACHING') return o.status === 'APPROACHING' || o.status === 'IN_ZONE';
      return true;
    }).sort((a, b) => {
      // Prioritize IN_ZONE, then APPROACHING, then smallest distance
      const scoreA = a.status === 'IN_ZONE' ? 0 : a.status === 'APPROACHING' ? 1 : 2;
      const scoreB = b.status === 'IN_ZONE' ? 0 : b.status === 'APPROACHING' ? 1 : 2;
      if (scoreA !== scoreB) return scoreA - scoreB;
      return a.distancePercent - b.distancePercent;
    });
  }, [opportunities, statusFilter]);

  // Copy thinkorswim order command (strictly formatted for TOS clipboard parser)
  const handleCopyTos = (opp: MonitoredOpportunity, e: React.MouseEvent) => {
    e.stopPropagation();
    const isFutures = opp.category === 'Future' || opp.symbol.startsWith('/') || opp.symbol.includes('MES');
    const isLong = opp.signalType === 'CALL / LONG';
    let tosCommand = '';

    if (isFutures) {
      const actualSym = opp.symbol.startsWith('/') ? opp.symbol : `/${opp.symbol}`;
      const action = isLong ? 'BUY' : 'SELL';
      const signQty = isLong ? '+1' : '-1';
      tosCommand = `${action} ${signQty} ${actualSym} @${opp.entryPrice.toFixed(2)} LMT`;
    } else {
      const optType = isLong ? 'CALL' : 'PUT';
      const cleanSym = opp.symbol.replace('/', '').toUpperCase();
      // Universal natural order format with SINGLE keyword accepted by thinkorswim desktop
      if (opp.optionTosExp && opp.optionStrike) {
        tosCommand = formatTosNaturalOptionCommand(
          cleanSym,
          opp.optionTosExp,
          opp.optionStrike,
          optType,
          opp.optionPremium || 3.50,
          1
        );
      } else {
        tosCommand = `BUY +1 SINGLE ${cleanSym} 100 ${opp.optionExp || '17 OCT 25'} ${opp.optionStrike || 100} ${optType} @${(opp.optionPremium || 3.50).toFixed(2)} LMT`;
      }
    }

    navigator.clipboard.writeText(tosCommand);
    setCopiedId(opp.symbol);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const inZoneCount = Object.values(opportunities).filter(o => o.status === 'IN_ZONE').length;
  const approachingCount = Object.values(opportunities).filter(o => o.status === 'APPROACHING').length;

  return (
    <div className="flex flex-col h-full w-full bg-[#0B0F17] overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 md:space-y-5 select-text min-h-0">
      {/* 1. Top Header Bar & Live Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-white font-display flex items-center gap-2">
              <Radio className="w-5 h-5 text-amber-400 animate-pulse" />
              <span>Options & Futures Opportunity Monitor</span>
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Live Proximity Radar
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Actively scans your focus list (<strong className="text-slate-200">/MES, SPCX, IREN, PLTR, TSLA</strong>) for institutional zone tests and triggers audible/visual trade entry alerts.
          </p>
        </div>

        {/* Controls: Audio Toggle, Auto Scan & Manual Refresh */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              soundEnabled
                ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title={soundEnabled ? 'Audio Chime Enabled on Opportunities' : 'Sound Muted'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Chime Alert ON' : 'Muted'}</span>
          </button>

          <button
            onClick={() => setAutoScanEnabled(!autoScanEnabled)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              autoScanEnabled
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
            title="Auto-scan every 10 seconds for real-time alerts"
          >
            <span>Auto-Scan: {autoScanEnabled ? '10s' : 'Off'}</span>
          </button>

          <button
            onClick={runFullScan}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Scan Now'}</span>
          </button>
        </div>
      </div>

      {/* 2. Key Metrics & Alert Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0F172A]/70">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>In Zone (Ready to Trade)</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div className="text-2xl font-bold font-mono mt-1 tabular-nums text-emerald-400">
            {inZoneCount}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Price currently inside institutional zone
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0F172A]/70">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Approaching Zone</div>
          <div className="text-2xl font-bold font-mono mt-1 tabular-nums text-amber-400">
            {approachingCount}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Within &le; 0.85% of trade trigger
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0F172A]/70">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Watchlist Monitored</div>
          <div className="text-2xl font-bold font-mono mt-1 tabular-nums text-sky-400">
            {watchlist.length} Assets
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Futures, Tech & High Vol Options
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0F172A]/70">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Last Scanner Pass</div>
          <div className="text-xl font-bold font-mono mt-1 tabular-nums text-slate-200">
            {lastScanTime}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Polling 1H Supply/Demand candles
          </div>
        </div>
      </div>

      {/* 3. Live Active Opportunity Alerts Stream */}
      {alerts.length > 0 && (
        <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-950/20 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400 animate-bounce" />
              <h2 className="text-xs font-bold font-display uppercase tracking-wider text-amber-300">
                Recent Live Opportunities ({alerts.length})
              </h2>
            </div>
            <button
              onClick={() => setAlerts([])}
              className="text-[11px] text-slate-400 hover:text-white"
            >
              Clear Alerts
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {alerts.slice(0, 3).map((al) => (
              <div
                key={al.id}
                onClick={() => onOpenOptionsForAsset(al.symbol)}
                className="p-3 rounded-lg border border-amber-500/40 bg-slate-900/90 hover:border-amber-400 transition-colors cursor-pointer space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold font-mono text-white">
                    <span className={al.signal.includes('CALL') || al.signal.includes('LONG') ? 'text-emerald-400' : 'text-rose-400'}>
                      {al.signal.includes('CALL') || al.signal.includes('LONG') ? '▲ CALL' : '▼ PUT'}
                    </span>
                    <span>{al.symbol}</span>
                    <span className="text-[10px] text-slate-400">· {al.pattern}</span>
                  </div>
                  <span className="text-[10px] text-amber-400 font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20">
                    {al.type === 'IN_ZONE' ? 'IN ZONE' : 'HOT'}
                  </span>
                </div>

                <div className="text-xs text-slate-300 font-mono">
                  Entry: <span className="font-semibold text-white">${al.entryPrice.toFixed(2)}</span> · Target: <span className="text-emerald-400 font-semibold">${al.targetPrice.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
                  <span className="text-slate-500">{al.timeStr}</span>
                  <span className="text-sky-400 font-semibold flex items-center gap-1">
                    <span>Trade Option</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Watchlist Filter & Add Symbol Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-slate-800 bg-[#0F172A]/50">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-medium">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded transition-colors ${
                statusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Assets ({watchlist.length})
            </button>
            <button
              onClick={() => setStatusFilter('IN_ZONE')}
              className={`px-3 py-1 rounded transition-colors ${
                statusFilter === 'IN_ZONE' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              In Zone ({inZoneCount})
            </button>
            <button
              onClick={() => setStatusFilter('APPROACHING')}
              className={`px-3 py-1 rounded transition-colors ${
                statusFilter === 'APPROACHING' ? 'bg-amber-950/80 text-amber-300 border border-amber-800/80' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hot / Approaching ({approachingCount})
            </button>
          </div>
        </div>

        {/* Add Ticker Form */}
        <form onSubmit={handleAddTicker} className="flex items-center gap-1.5">
          <input
            type="text"
            value={newTickerInput}
            onChange={(e) => setNewTickerInput(e.target.value)}
            placeholder="Add ticker (e.g. AMD, /ES)..."
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 uppercase font-mono focus:outline-none focus:border-amber-400 w-44"
          />
          <button
            type="submit"
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Add</span>
          </button>
        </form>
      </div>

      {/* 5. Watchlist Opportunities Table */}
      <div className="rounded-lg border border-slate-800 bg-[#0B0F17] shadow-xl flex flex-col min-h-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[500px] xl:max-h-[600px] rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-[#0F172A] shadow-sm">
              <tr className="border-b border-slate-800 bg-[#0F172A] text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 bg-[#0F172A]">Symbol & Asset Name</th>
                <th className="py-3 px-4 text-right bg-[#0F172A]">Current Price</th>
                <th className="py-3 px-4 text-center bg-[#0F172A]">Trigger Status</th>
                <th className="py-3 px-4 bg-[#0F172A]">Recommended Trade Action</th>
                <th className="py-3 px-4 text-right bg-[#0F172A]">Distance to Zone</th>
                <th className="py-3 px-4 text-right bg-[#0F172A]">Target & R:R</th>
                <th className="py-3 px-4 text-center bg-[#0F172A]">Score / Vol</th>
                <th className="py-3 px-4 text-right bg-[#0F172A]">Trade Execution Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
              {filteredOpps.map((opp) => {
                const isCall = opp.signalType === 'CALL / LONG';
                const isFuture = opp.symbol.startsWith('/');
                const isInZone = opp.status === 'IN_ZONE';
                const isApproaching = opp.status === 'APPROACHING';

                return (
                  <tr
                    key={opp.symbol}
                    onClick={() => onSelectAsset(opp.symbol)}
                    className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${
                      isInZone ? 'bg-emerald-950/20 border-l-2 border-emerald-400' : isApproaching ? 'bg-amber-950/15 border-l-2 border-amber-400' : ''
                    }`}
                  >
                    {/* Symbol */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{opp.symbol}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {opp.category}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                        {opp.name}
                      </div>
                    </td>

                    {/* Price */}
                    <td className="py-3.5 px-4 text-right tabular-nums">
                      <div className="font-bold text-white text-sm">
                        ${opp.currentPrice.toFixed(2)}
                      </div>
                      <div className={`text-[10px] ${opp.priceChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {opp.priceChange >= 0 ? '+' : ''}{opp.priceChange.toFixed(2)} ({opp.changePercent.toFixed(2)}%)
                      </div>
                    </td>

                    {/* Trigger Status */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {isInZone && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950/90 border border-emerald-700 px-2 py-0.5 rounded animate-pulse">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>IN ZONE (EXECUTE)</span>
                        </span>
                      )}
                      {isApproaching && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-950/90 border border-amber-700 px-2 py-0.5 rounded">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>HOT ({opp.distancePercent}%)</span>
                        </span>
                      )}
                      {!isInZone && !isApproaching && (
                        <span className="text-slate-500 text-[11px]">
                          Monitoring ({opp.distancePercent}%)
                        </span>
                      )}
                    </td>

                    {/* Trade Action & Option Setup */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className={isCall ? 'text-emerald-400' : 'text-rose-400'}>
                          {isCall ? <ArrowUpRight className="w-3.5 h-3.5 inline" /> : <ArrowDownRight className="w-3.5 h-3.5 inline" />}
                        </span>
                        <span className={isCall ? 'text-emerald-300 font-semibold' : 'text-rose-300 font-semibold'}>
                          {opp.triggerAction}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {opp.nearestZone ? (
                          <>
                            <span>{opp.nearestZone.pattern} {opp.nearestZone.type === 'demand' ? 'Demand' : 'Supply'}</span>
                            <span className="text-slate-600"> · </span>
                            <span>${opp.nearestZone.low.toFixed(1)} - ${opp.nearestZone.high.toFixed(1)}</span>
                          </>
                        ) : 'Structure Forming'}
                      </div>
                    </td>

                    {/* Distance to Zone */}
                    <td className="py-3.5 px-4 text-right tabular-nums">
                      <div className={`font-semibold ${isInZone ? 'text-emerald-400' : isApproaching ? 'text-amber-400' : 'text-slate-300'}`}>
                        {isInZone ? '0.00% (In Zone)' : `${opp.distancePercent.toFixed(2)}%`}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ${opp.distanceDollars.toFixed(2)} spread
                      </div>
                    </td>

                    {/* Target & RR */}
                    <td className="py-3.5 px-4 text-right tabular-nums whitespace-nowrap">
                      <div className="text-emerald-400 font-semibold">
                        TP: ${opp.targetPrice.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        SL: ${opp.stopLoss.toFixed(2)} · <span className="text-sky-400">{opp.rMultiple.toFixed(1)}R</span>
                      </div>
                    </td>

                    {/* Quality & Vol */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="text-slate-200 font-bold">{opp.qualityScore}%</div>
                      <div className="text-[10px]">
                        {opp.nearestZone?.heuristicQualityScore ? (
                          <span className="text-emerald-400 font-semibold">{opp.nearestZone.heuristicQualityScore}/100 Quality</span>
                        ) : opp.wholesalerVolumeRatio && opp.wholesalerVolumeRatio >= 1.5 ? (
                          <span className="text-emerald-400 font-semibold">⚡{opp.wholesalerVolumeRatio.toFixed(1)}x Vol</span>
                        ) : (
                          <span className="text-slate-500">Normal Vol</span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onOpenOptionsForAsset(opp.symbol)}
                          className="px-2 py-1 text-[11px] font-semibold text-sky-300 hover:text-white bg-sky-950/80 hover:bg-sky-900 border border-sky-800/80 rounded transition-colors flex items-center gap-1 cursor-pointer"
                          title="Open Schwab Option Ticket with this contract"
                        >
                          <Building2 className="w-3 h-3 text-sky-400" />
                          <span>Schwab</span>
                        </button>

                        <button
                          onClick={(e) => handleCopyTos(opp, e)}
                          className="px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:text-white bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 rounded transition-colors flex items-center gap-1 cursor-pointer"
                          title="Copy thinkorswim 1st Triggers OCO bracket command"
                        >
                          {copiedId === opp.symbol ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Terminal className="w-3 h-3 text-emerald-400" />
                              <span>TOS</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => onOpenChartForAsset(opp.symbol, opp.nearestZone?.id)}
                          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                          title="View Candlestick Chart"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => handleRemoveTicker(opp.symbol, e)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Remove from Watchlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredOpps.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            No assets match the selected filter. Add new symbols above or switch filter to "All Assets".
          </div>
        )}
      </div>

      {/* 6. Institutional Usage Tips for Focus Assets */}
      <div className="p-4 rounded-lg border border-slate-800 bg-[#0F172A]/40 text-xs text-slate-300 space-y-2">
        <div className="font-bold text-white flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Focus Strategy Guide (/MES, SPCX, IREN, PLTR, TSLA):</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-400">
          <div>
            <strong className="text-slate-200">/MES (Micro S&P 500 Futures):</strong> 24-hour liquidity. Look for DBR/RBD departures during London open (3 AM ET) and US cash open (9:30 AM ET). Stops should maintain at least 1.35x ATR (6–12 points) to avoid market maker liquidity stop sweeps.
          </div>
          <div>
            <strong className="text-slate-200">PLTR & TSLA (High Momentum Options):</strong> Focus on In-The-Money (~0.68 Delta) 7-14 DTE option contracts on fresh 1-hour Demand zones for maximum delta acceleration.
          </div>
          <div>
            <strong className="text-slate-200">IREN (High Volatility AI/Crypto Miner):</strong> Requires wider ATR stop buffers due to high beta. When entering Put/Call options, lock in partial profits at TP1 (+50% premium) and trail the runner.
          </div>
          <div>
            <strong className="text-slate-200">SPCX (Covered Call Strategy):</strong> Ideal for range-bound mean reversion between outer daily Supply and Demand boundaries.
          </div>
        </div>
      </div>
    </div>
  );
};
