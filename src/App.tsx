import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TopNav, ActiveTab } from './components/TopNav';
import { CandleChart } from './components/CandleChart';
import { TradeRecommendationPanel } from './components/TradeRecommendationPanel';
import { ZoneRadar } from './components/ZoneRadar';
import { VolatilityMatrix } from './components/VolatilityMatrix';
import { StrategyBacktest } from './components/StrategyBacktest';
import { RiskSizer } from './components/RiskSizer';
import { SchwabOptionsTrader } from './components/SchwabOptionsTrader';
import { TradingJournal } from './components/TradingJournal';
import { OpportunityMonitor } from './components/OpportunityMonitor';
import { ThinkorswimPostModal } from './components/ThinkorswimPostModal';
import { QAMonitorModal } from './components/QAMonitorModal';
import { AIAnalystModal } from './components/AIAnalystModal';
import { DataImportModal } from './components/DataImportModal';
import { SchwabConnectModal } from './components/SchwabConnectModal';
import { DiagnosticSuiteModal } from './components/DiagnosticSuiteModal';
import { GeminiChatDrawer } from './components/GeminiChatDrawer';

import { Candle, SupplyDemandZone, TradeRecommendation, BacktestTrade, JournalTrade, OpportunityAlert } from './types/trading';
import { generateSyntheticMarketData, generateNextSimulatedCandle } from './utils/marketData';
import { detectSupplyDemandZones } from './utils/zoneDetector';
import { getLatestVolatilityMetrics } from './utils/volatility';
import { generateTradeRecommendations } from './utils/tradeEngine';
import { generateSchwabOptionPlay } from './utils/optionsEngine';
import { getSampleJournalTrades } from './utils/journalSeed';
import { ArrowUpRight, ArrowDownRight, Layers, SlidersHorizontal, CheckCircle, Info, Bot, Sparkles } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chart');
  const [selectedAsset, setSelectedAsset] = useState<string>('SPY');

  // Market Data Candles
  const [candles, setCandles] = useState<Candle[]>(() => {
    return generateSyntheticMarketData('SPY', 360, 574, 5);
  });

  // User-tuned Stop-Loss Volatility Buffer Multiplier (e.g. 1.35x ATR)
  const [customBufferMultiplier, setCustomBufferMultiplier] = useState<number>(1.35);

  // Selected Zone & Trade Recommendation for Interactive Chart Highlighting
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<TradeRecommendation | null>(null);

  // Simulation / Replay State
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Modals & Drawers
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isSchwabModalOpen, setIsSchwabModalOpen] = useState<boolean>(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>(undefined);
  const [chatInitialRole, setChatInitialRole] = useState<'daily_coach' | 'quant' | 'risk_architect' | 'fast_scalp'>('daily_coach');
  const [isTosModalOpen, setIsTosModalOpen] = useState<boolean>(false);
  const [isQaMonitorOpen, setIsQaMonitorOpen] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const handleOpenAiChatWithPrompt = (msg?: string, role: 'daily_coach' | 'quant' | 'risk_architect' | 'fast_scalp' = 'daily_coach') => {
    setChatInitialMessage(msg);
    setChatInitialRole(role);
    setIsChatOpen(true);
  };

  // Institutional Trading Journal State with localStorage persistence
  const [journalTrades, setJournalTrades] = useState<JournalTrade[]>(() => {
    try {
      const saved = localStorage.getItem('strata_trading_journal');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse saved trading journal:', e);
    }
    return getSampleJournalTrades('SPY');
  });

  useEffect(() => {
    try {
      localStorage.setItem('strata_trading_journal', JSON.stringify(journalTrades));
    } catch {}
  }, [journalTrades]);

  const [dataSourceInfo, setDataSourceInfo] = useState<{
    source: string;
    isRealtime: boolean;
    lastUpdated: string;
    mode: 'schwab' | 'exchange' | 'synthetic';
  }>({
    source: 'exchange-feed',
    isRealtime: false,
    lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    mode: 'exchange',
  });

  // Candle Bar Frequency (1m, 5m, 15m, 30m, 60m, 240m, 1440m)
  const [frequency, setFrequency] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('strata_candle_frequency');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if ([1, 5, 15, 30, 60, 240, 1440].includes(parsed)) return parsed;
      }
    } catch {}
    return 5; // Default to 5m intraday for immediate high-action precision
  });

  // Real-time Market Data Loader
  const fetchAssetData = useCallback(async (assetSymbol: string, freq?: number, isBackgroundPoll: boolean = false) => {
    const cleanSym = assetSymbol.toUpperCase().trim();
    const activeFreq = typeof freq === 'number' ? freq : frequency;
    if (!isBackgroundPoll) {
      setIsRefreshing(true);
    }
    try {
      const res = await fetch('/api/schwab/price-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: cleanSym, frequency: activeFreq }),
      });
      const data = await res.json();
      if (data && data.candles && data.candles.length > 0) {
        const converted: Candle[] = data.candles.map((c: any) => {
          const ts = typeof c.datetime === 'number' ? c.datetime : Date.parse(c.datetime) || Date.now();
          return {
            time: ts,
            dateStr: new Date(ts).toISOString().replace('T', ' ').substring(0, 16),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume || 1000,
          };
        });
        setCandles((prevCandles) => {
          if (isBackgroundPoll && prevCandles.length === converted.length) {
            const prevLast = prevCandles[prevCandles.length - 1];
            const newLast = converted[converted.length - 1];
            if (
              prevLast &&
              newLast &&
              prevLast.time === newLast.time &&
              prevLast.close === newLast.close &&
              prevLast.high === newLast.high &&
              prevLast.low === newLast.low &&
              prevLast.volume === newLast.volume
            ) {
              return prevCandles; // Data identical, maintain reference to prevent unnecessary redraws
            }
          }
          return converted;
        });
        setSelectedAsset(cleanSym);
        const isSchwab = data.source === 'schwab-live-api';
        const isExchange = data.source === 'real-market-exchange-feed';
        const freqLabel = 
          activeFreq === 1 ? '1m Scalp' :
          activeFreq === 5 ? '5m Intraday' :
          activeFreq === 15 ? '15m Day' :
          activeFreq === 30 ? '30m' :
          activeFreq === 60 ? '1H Swing' :
          activeFreq === 240 ? '4H Trend' : '1D Daily';

        setDataSourceInfo({
          source: data.source || 'exchange-feed-fallback',
          isRealtime: isSchwab || isExchange,
          lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          mode: isSchwab ? 'schwab' : (isExchange ? 'exchange' : 'synthetic'),
        });
        if (!isBackgroundPoll) {
          setSelectedZoneId(null);
          setSelectedRecommendation(null);
          setNotification(`Loaded ${cleanSym} (${freqLabel} · ${isSchwab ? 'Schwab Real-Time' : isExchange ? 'Real Exchange Feed' : 'Synthesized Backup'})`);
          setTimeout(() => setNotification(null), 3000);
        }
        setIsRefreshing(false);
        return;
      }
    } catch (e) {
      console.warn('Failed to fetch live asset data, using fallback:', e);
    } finally {
      setIsRefreshing(false);
    }

    // Fallback ONLY if initial manual load fails (never overwrite real charts on background polls)
    if (!isBackgroundPoll) {
      let startPrice = 779.09;
      if (cleanSym.includes('MES') || cleanSym.includes('ES')) startPrice = 7842.75;
      else if (cleanSym.includes('NQ') || cleanSym.includes('MNQ')) startPrice = 24850;
      else if (cleanSym.includes('YM') || cleanSym.includes('MYM')) startPrice = 46200;
      else if (cleanSym.includes('RTY') || cleanSym.includes('M2K')) startPrice = 2480;
      else if (cleanSym.includes('CL')) startPrice = 74.20;
      else if (cleanSym.includes('GC')) startPrice = 2950;
      else if (cleanSym === 'QQQ') startPrice = 605;
      else if (cleanSym === 'NVDA') startPrice = 184;
      else if (cleanSym === 'AAPL') startPrice = 258;
      else if (cleanSym === 'TSLA') startPrice = 380.68;
      else if (cleanSym === 'PLTR') startPrice = 192.07;
      else if (cleanSym === 'IREN') startPrice = 41.28;
      else if (cleanSym === 'SPCX') startPrice = 171.92;
      const fallbackCandles = generateSyntheticMarketData(cleanSym, activeFreq <= 5 ? 120 : 360, startPrice, activeFreq);
      setCandles(fallbackCandles);
      setSelectedAsset(cleanSym);
      setSelectedZoneId(null);
      setSelectedRecommendation(null);
    }
  }, [frequency]);

  const handleFrequencyChange = useCallback((newFreq: number) => {
    setFrequency(newFreq);
    try {
      localStorage.setItem('strata_candle_frequency', String(newFreq));
    } catch {}
    fetchAssetData(selectedAsset, newFreq, false);
    const label = 
      newFreq === 1 ? '1m Intraday Scalp' :
      newFreq === 5 ? '5m Intraday Momentum' :
      newFreq === 15 ? '15m Day Trading' :
      newFreq === 30 ? '30m Tactical' :
      newFreq === 60 ? '1H Swing' :
      newFreq === 240 ? '4H Trend' : '1D Daily Macro';
    setNotification(`Switched frequency to ${label}`);
    setTimeout(() => setNotification(null), 3000);
  }, [selectedAsset, fetchAssetData]);

  // Fetch real SPY market data immediately on initial mount
  useEffect(() => {
    fetchAssetData('SPY', frequency, false);
  }, [fetchAssetData, frequency]);

  // High-Frequency Real-Time Market Data Auto-Sync:
  // 1m & 5m: stream every 5s!
  // 15m & 30m: sync every 10s!
  // 60m+: sync every 20s!
  useEffect(() => {
    if (isSimulating) return;
    const pollIntervalMs = 
      frequency === 1 ? 5000 :
      frequency === 5 ? 5000 :
      frequency === 15 ? 10000 :
      frequency === 30 ? 10000 : 20000;

    const interval = setInterval(() => {
      fetchAssetData(selectedAsset, frequency, true);
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [isSimulating, selectedAsset, frequency, fetchAssetData]);

  // Handle Asset Preset Change
  const handleSelectAsset = useCallback((asset: string) => {
    setIsSimulating(false);
    setSelectedZoneId(null);
    setSelectedRecommendation(null);

    const cleanSym = asset.replace(/^(SCHWAB:|EXCHANGE:)/, '').trim().toUpperCase();
    setSelectedAsset(cleanSym);

    // Immediately seed clean initial candles for the target asset so that any derived
    // calculations (volatilityMetrics, zones, recommendations) are instantly aligned with
    // the target asset's true price realm, preventing stale SPY coordinates from lingering.
    let startPrice = 779.09;
    if (cleanSym.includes('MES') || cleanSym.includes('ES')) startPrice = 7842.75;
    else if (cleanSym.includes('NQ') || cleanSym.includes('MNQ')) startPrice = 24850;
    else if (cleanSym.includes('YM') || cleanSym.includes('MYM')) startPrice = 46200;
    else if (cleanSym.includes('RTY') || cleanSym.includes('M2K')) startPrice = 2480;
    else if (cleanSym.includes('CL')) startPrice = 74.20;
    else if (cleanSym.includes('GC')) startPrice = 2950;
    else if (cleanSym === 'QQQ') startPrice = 605;
    else if (cleanSym === 'NVDA') startPrice = 184;
    else if (cleanSym === 'AAPL') startPrice = 258;
    else if (cleanSym === 'TSLA') startPrice = 380.68;
    else if (cleanSym === 'PLTR') startPrice = 192.07;
    else if (cleanSym === 'IREN') startPrice = 41.28;
    else if (cleanSym === 'SPCX') startPrice = 171.92;

    const freshSeed = generateSyntheticMarketData(cleanSym, frequency <= 5 ? 120 : 360, startPrice, frequency);
    setCandles(freshSeed);

    fetchAssetData(cleanSym, frequency);
  }, [frequency, fetchAssetData]);

  // 1. Compute Volatility Metrics
  const volatilityMetrics = useMemo(() => {
    const isCrypto = selectedAsset.includes('BTC') || selectedAsset.includes('ETH');
    const metrics = getLatestVolatilityMetrics(candles, isCrypto);
    // incorporate user tuned buffer if modified
    return {
      ...metrics,
      recommendedBufferMultiplier: customBufferMultiplier,
    };
  }, [candles, selectedAsset, customBufferMultiplier]);

  // 2. Automatically Detect Supply & Demand Zones:
  // Strictly keep ONLY the single most recent active Demand & single most recent Supply zone
  const zones = useMemo(() => {
    return detectSupplyDemandZones(candles, {
      atrPeriod: 14,
      minImpulseMultiplier: 1.25,
      maxBaseCandles: 3,
      useWickForBoundary: true,
      recentOnly: true,
      maxRecentZonesPerType: 1, // Strictly 1 recent demand and 1 recent supply zone
      includeMitigated: false,
      dataSource: dataSourceInfo.mode,
    });
  }, [candles, dataSourceInfo.mode]);

  // All historical zones for the Zone Radar Grid table
  const allHistoricalZones = useMemo(() => {
    return detectSupplyDemandZones(candles, {
      atrPeriod: 14,
      minImpulseMultiplier: 1.25,
      maxBaseCandles: 3,
      useWickForBoundary: true,
      recentOnly: false,
      dataSource: dataSourceInfo.mode,
    });
  }, [candles, dataSourceInfo.mode]);

  // 3. Generate Precision Entry & Exit Recommendations
  const currentPrice = candles[candles.length - 1]?.close || 1;
  const recommendations = useMemo(() => {
    const isIndexFutures = selectedAsset.includes('MES') || selectedAsset.includes('ES');
    // Ensure recommendations are fully recalculated against fresh candles of the newly selected asset
    // and prevent stale SPY price coordinates from leaking into index futures
    if (isIndexFutures && currentPrice < 2000) {
      return [];
    }
    return generateTradeRecommendations(
      currentPrice,
      zones,
      volatilityMetrics,
      selectedAsset
    );
  }, [currentPrice, zones, volatilityMetrics, selectedAsset]);

  // Default select first recommendation if none selected or if selected recommendation is stale
  useEffect(() => {
    if (recommendations.length > 0) {
      const isIndexFutures = selectedAsset.includes('MES') || selectedAsset.includes('ES');
      const isStale = selectedRecommendation && (
        selectedRecommendation.symbol !== selectedAsset ||
        (isIndexFutures && selectedRecommendation.entry < 2000)
      );
      if (!selectedRecommendation || isStale) {
        setSelectedRecommendation(recommendations[0]);
        setSelectedZoneId(recommendations[0].zoneId);
      }
    }
  }, [recommendations, selectedRecommendation, selectedAsset]);

  // 4. Market Replay Tick Runner
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setCandles((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const isCrypto = selectedAsset.includes('BTC') || selectedAsset.includes('ETH');
        const next = generateNextSimulatedCandle(last, isCrypto, frequency);
        return [...prev.slice(1), next]; // slide window
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [isSimulating, selectedAsset, frequency]);

  const handleStepCandle = useCallback(() => {
    setCandles((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const isCrypto = selectedAsset.includes('BTC') || selectedAsset.includes('ETH');
      const next = generateNextSimulatedCandle(last, isCrypto, frequency);
      return [...prev.slice(1), next];
    });
  }, [selectedAsset, frequency]);

  // Zone selection from Radar or List
  const handleSelectZone = (zone: SupplyDemandZone) => {
    setSelectedZoneId(zone.id);
    // Find matching recommendation if exists
    const rec = recommendations.find((r) => r.zoneId === zone.id);
    if (rec) {
      setSelectedRecommendation(rec);
    }
    setActiveTab('chart');
  };

  const handleInspectBacktestTrade = (trade: BacktestTrade) => {
    setSelectedZoneId(trade.zoneId);
    const rec = recommendations.find((r) => r.zoneId === trade.zoneId);
    if (rec) {
      setSelectedRecommendation(rec);
    }
    setActiveTab('chart');
    setNotification(
      `Inspecting ${trade.side.toUpperCase()} ${trade.pattern} Trade: Entry $${trade.entryPrice.toFixed(2)} (${trade.outcome.toUpperCase()} ${trade.rMultiple > 0 ? '+' : ''}${trade.rMultiple.toFixed(1)}R)`
    );
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSelectRecommendation = (rec: TradeRecommendation) => {
    setSelectedRecommendation(rec);
    setSelectedZoneId(rec.zoneId);
  };

  const handleAddJournalTrade = useCallback((tradeData: Omit<JournalTrade, 'id' | 'timestamp'>) => {
    const newTrade: JournalTrade = {
      ...tradeData,
      id: `jt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: Date.now(),
    };
    setJournalTrades((prev) => [newTrade, ...prev]);
    setNotification(`Recorded ${newTrade.symbol} ${newTrade.side.toUpperCase()} (${newTrade.pattern}) in Trading Journal`);
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const handleUpdateJournalTrade = useCallback((id: string, updates: Partial<JournalTrade>) => {
    setJournalTrades((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const handleDeleteJournalTrade = useCallback((id: string) => {
    setJournalTrades((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleResetSampleJournal = useCallback(() => {
    const fresh = getSampleJournalTrades(selectedAsset);
    setJournalTrades(fresh);
    setNotification('Restored sample historical trading journal records');
    setTimeout(() => setNotification(null), 3000);
  }, [selectedAsset]);

  const handleInspectJournalZone = useCallback((zoneId: string) => {
    setSelectedZoneId(zoneId);
    setActiveTab('chart');
    setNotification(`Inspecting Tagged Zone: ${zoneId}`);
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const handleLogRecommendationToJournal = useCallback((rec: TradeRecommendation) => {
    const optionPlay = generateSchwabOptionPlay(rec, selectedAsset, volatilityMetrics);
    const newTrade: JournalTrade = {
      id: `jt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: Date.now(),
      dateStr: new Date().toISOString().substring(0, 10),
      symbol: selectedAsset,
      side: rec.side,
      zoneId: rec.zoneId,
      zoneType: rec.zoneType,
      pattern: rec.pattern,
      instrumentType: 'OPTION',
      optionSymbol: optionPlay.occSymbol,
      strike: optionPlay.strike,
      optionType: optionPlay.optionType,
      contracts: 2,
      entryPrice: optionPlay.entry.premium,
      stopLoss: optionPlay.stopLoss.premium,
      targetPrice: optionPlay.target.premium,
      outcome: 'Open',
      rMultiple: 0,
      pnlDollar: 0,
      pnlPercent: 0,
      qualityScore: rec.qualityScore,
      executionSource: 'Schwab Portal',
      notes: `Executed via Schwab Options Assist on ${rec.pattern} ${rec.zoneType === 'demand' ? 'Demand' : 'Supply'} Zone ($${rec.entry.toFixed(2)}).`,
    };
    setJournalTrades((prev) => [newTrade, ...prev]);
    setNotification(`Logged ${selectedAsset} ${rec.pattern} setup to Trading Journal!`);
    setTimeout(() => setNotification(null), 4000);
  }, [selectedAsset, volatilityMetrics]);

  const [alertCount, setAlertCount] = useState<number>(0);

  const handleMonitorSelectAsset = useCallback((symbol: string) => {
    handleSelectAsset(symbol);
    setActiveTab('chart');
  }, [handleSelectAsset]);

  const handleMonitorOpenOptions = useCallback((symbol: string) => {
    handleSelectAsset(symbol);
    setActiveTab('options');
  }, [handleSelectAsset]);

  const handleMonitorOpenChart = useCallback((symbol: string, zoneId?: string) => {
    handleSelectAsset(symbol);
    if (zoneId) {
      setSelectedZoneId(zoneId);
    }
    setActiveTab('chart');
  }, [handleSelectAsset]);

  const handleAlertTriggered = useCallback((alert: OpportunityAlert) => {
    setAlertCount((prev) => prev + 1);
    setNotification(`🚨 Opportunity Alert: ${alert.symbol} ${alert.type === 'IN_ZONE' ? 'INSIDE ZONE' : 'HOT'} (${alert.signal}) @ $${alert.entryPrice.toFixed(2)}`);
    setTimeout(() => setNotification(null), 6000);
  }, []);

  const handleSimulateOrder = (rec: TradeRecommendation) => {
    handleLogRecommendationToJournal(rec);
    setNotification(`Order Staged & Logged to Journal: ${rec.side.toUpperCase()} limit @ $${rec.entry.toFixed(2)} with Stop-Loss at $${rec.stopLoss.toFixed(2)}.`);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleImportData = (newCandles: Candle[], customName: string, loadedFreq?: number) => {
    setSelectedAsset(customName);
    setIsSimulating(false);
    setSelectedZoneId(null);
    setSelectedRecommendation(null);
    setCandles(newCandles);
    if (loadedFreq) {
      setFrequency(loadedFreq);
      try {
        localStorage.setItem('strata_candle_frequency', String(loadedFreq));
      } catch {}
    }
    setActiveTab('chart');
  };

  // Quick stats
  const freshDemandCount = zones.filter((z) => z.type === 'demand' && !z.isMitigated && z.testedCount === 0).length;
  const freshSupplyCount = zones.filter((z) => z.type === 'supply' && !z.isMitigated && z.testedCount === 0).length;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0B0F17] text-[#E2E8F0] overflow-hidden select-none font-sans">
      {/* 1. Universal Top Bar Contract */}
      <TopNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isSimulating={isSimulating}
        onToggleSimulate={() => setIsSimulating(!isSimulating)}
        onStepCandle={handleStepCandle}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenSchwab={() => setIsSchwabModalOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onOpenAiAnalyst={() => setIsAiModalOpen(true)}
        onOpenAiChat={() => setIsChatOpen((prev) => !prev)}
        onOpenQaMonitor={() => setIsQaMonitorOpen(true)}
        selectedAsset={selectedAsset}
        onSelectAsset={handleSelectAsset}
        alertCount={alertCount}
        frequency={frequency}
        onFrequencyChange={handleFrequencyChange}
        lastSyncTime={frequency <= 5 ? '5s' : frequency <= 30 ? '10s' : '20s'}
        isLiveSyncing={!isSimulating}
      />

      {/* 2. Main Content Viewport */}
      <main className="flex-1 overflow-hidden p-3 md:p-4 min-h-0 flex flex-col">
        {/* VIEW 1: Main Chart Terminal + Recommendation Deck */}
        {activeTab === 'chart' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full min-h-0 flex-1">
            {/* Left 3 Columns: High Performance Candlestick Chart */}
            <div className="lg:col-span-3 h-full flex flex-col min-h-0">
              <CandleChart
                candles={candles}
                zones={allHistoricalZones}
                volatilityMetrics={volatilityMetrics}
                selectedRecommendation={selectedRecommendation}
                onSelectZone={handleSelectZone}
                selectedZoneId={selectedZoneId}
                symbol={selectedAsset}
                frequency={frequency}
                onFrequencyChange={handleFrequencyChange}
                dataSourceInfo={isSimulating ? { source: 'simulation', isRealtime: true, lastUpdated: 'Replay Active', mode: 'synthetic' } : dataSourceInfo}
                onRefreshData={() => fetchAssetData(selectedAsset, frequency)}
                isRefreshing={isRefreshing}
              />
            </div>

            {/* Right Column: Active Zone Signals & Volatility Recommendations Deck */}
            <div className="lg:col-span-1 h-full flex flex-col min-h-0 bg-[#0B0F17] rounded-lg border border-slate-800/80 overflow-hidden shadow-xl">
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-800 bg-[#0F172A]/70 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xs font-bold text-white font-display uppercase tracking-wider">
                    Volatility Recommendations
                  </h3>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    {freshDemandCount} Fresh Demand · {freshSupplyCount} Fresh Supply
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('volatility')}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                  title="Configure Volatility Buffer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Scrollable Recommendations Deck */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <TradeRecommendationPanel
                  recommendations={recommendations}
                  volatilityMetrics={volatilityMetrics}
                  selectedRecommendation={selectedRecommendation}
                  onSelectRecommendation={handleSelectRecommendation}
                  onSimulateOrder={handleSimulateOrder}
                  ticker={selectedAsset}
                  onOpenOptionsTab={() => setActiveTab('options')}
                  onOpenTosModal={(rec) => {
                    setSelectedRecommendation(rec);
                    setIsTosModalOpen(true);
                  }}
                  onLogToJournal={handleLogRecommendationToJournal}
                  onOpenAiChat={handleOpenAiChatWithPrompt}
                />

                {/* Secondary Section: Pristine Untested Order Blocks */}
                <div className="pt-2 border-t border-slate-800/80">
                  <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Key Zone Clusters</span>
                    <button
                      onClick={() => setActiveTab('radar')}
                      className="text-emerald-400 hover:underline text-[10px]"
                    >
                      View All ({zones.length})
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {zones
                      .filter((z) => !z.isMitigated)
                      .slice(0, 4)
                      .map((zone) => {
                        const isDemand = zone.type === 'demand';
                        const isSelected = selectedZoneId === zone.id;

                        return (
                          <div
                            key={zone.id}
                            onClick={() => handleSelectZone(zone)}
                            className={`p-2 rounded border text-xs font-mono transition-colors cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'bg-slate-800 border-emerald-500/80 text-white'
                                : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className={isDemand ? 'text-emerald-400' : 'text-rose-400'}>
                                {isDemand ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                              </span>
                              <div>
                                <span className="font-semibold">
                                  {isDemand ? 'DZ' : 'SZ'} · {zone.pattern}
                                </span>
                                <span className="text-[10px] text-slate-500 ml-1.5">
                                  {zone.testedCount === 0 ? 'Fresh' : `Tested ${zone.testedCount}x`}
                                </span>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="tabular-nums font-semibold">
                                ${zone.low.toFixed(1)} - ${zone.high.toFixed(1)}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Velocity: {zone.departureVelocity.toFixed(1)}x ATR
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: Charles Schwab Options Trading Assist Station */}
        {activeTab === 'options' && (
          <div className="h-full w-full rounded-lg border border-slate-800/80 overflow-hidden shadow-xl flex flex-col min-h-0 flex-1">
            <SchwabOptionsTrader
              recommendations={recommendations}
              volatilityMetrics={volatilityMetrics}
              zones={zones}
              symbol={selectedAsset}
              currentPrice={currentPrice}
              selectedRecommendation={selectedRecommendation}
              onSelectRecommendation={handleSelectRecommendation}
              onOpenSchwabModal={() => setIsSchwabModalOpen(true)}
              onOpenTosModal={() => setIsTosModalOpen(true)}
              onOpenQaMonitor={() => setIsQaMonitorOpen(true)}
              onLogToJournal={handleLogRecommendationToJournal}
              onOpenAiChat={handleOpenAiChatWithPrompt}
            />
          </div>
        )}

        {/* VIEW 3: Options & Futures Opportunity Monitor */}
        {activeTab === 'monitor' && (
          <div className="h-full w-full rounded-lg border border-slate-800/80 overflow-hidden shadow-xl flex flex-col min-h-0 flex-1">
            <OpportunityMonitor
              onSelectAsset={handleMonitorSelectAsset}
              onOpenOptionsForAsset={handleMonitorOpenOptions}
              onOpenChartForAsset={handleMonitorOpenChart}
              onLogTradeToJournal={handleLogRecommendationToJournal}
              onAlertTriggered={handleAlertTriggered}
            />
          </div>
        )}

        {/* VIEW 4: Automatic Zone Radar Grid */}
        {activeTab === 'radar' && (
          <div className="h-full w-full rounded-lg border border-slate-800/80 overflow-hidden shadow-xl flex flex-col min-h-0 flex-1">
            <ZoneRadar
              zones={allHistoricalZones}
              onSelectZone={handleSelectZone}
              selectedZoneId={selectedZoneId}
            />
          </div>
        )}

        {/* VIEW: Institutional Trading Journal */}
        {activeTab === 'journal' && (
          <div className="h-full w-full rounded-lg border border-slate-800/80 overflow-hidden shadow-xl flex flex-col min-h-0 flex-1">
            <TradingJournal
              trades={journalTrades}
              onAddTrade={handleAddJournalTrade}
              onUpdateTrade={handleUpdateJournalTrade}
              onDeleteTrade={handleDeleteJournalTrade}
              onInspectZone={handleInspectJournalZone}
              onResetSampleData={handleResetSampleJournal}
              currentSymbol={selectedAsset}
            />
          </div>
        )}

        {/* VIEW 4: Historical Volatility Matrix */}
        {activeTab === 'volatility' && (
          <div className="h-full w-full rounded-lg border border-slate-800/80 overflow-hidden shadow-xl flex flex-col min-h-0 flex-1">
            <VolatilityMatrix
              volatilityMetrics={volatilityMetrics}
              candles={candles}
              symbol={selectedAsset}
              customBufferMultiplier={customBufferMultiplier}
              onChangeBufferMultiplier={setCustomBufferMultiplier}
            />
          </div>
        )}

        {/* VIEW 4: Strategy Backtesting Engine */}
        {activeTab === 'backtest' && (
          <div className="h-full w-full rounded-lg border border-slate-800/80 overflow-hidden shadow-xl flex flex-col min-h-0 flex-1">
            <StrategyBacktest
              candles={candles}
              zones={zones}
              volatilityMetrics={volatilityMetrics}
              symbol={selectedAsset}
              onInspectTrade={handleInspectBacktestTrade}
            />
          </div>
        )}

        {/* VIEW 5: Risk & Position Sizer */}
        {activeTab === 'sizer' && (
          <div className="h-full w-full rounded-lg border border-slate-800/80 overflow-hidden shadow-xl flex flex-col min-h-0 flex-1">
            <RiskSizer
              recommendation={selectedRecommendation}
              volatilityMetrics={volatilityMetrics}
              symbol={selectedAsset}
            />
          </div>
        )}
      </main>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-950 border border-emerald-500/80 text-emerald-200 shadow-2xl text-xs font-mono animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* CSV Data Import Modal */}
      <DataImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportData={handleImportData}
      />

      {/* Charles Schwab Trader API Integration Modal */}
      <SchwabConnectModal
        isOpen={isSchwabModalOpen}
        onClose={() => setIsSchwabModalOpen(false)}
        onLoadSchwabCandles={handleImportData}
        currentFrequency={frequency}
      />

      {/* Automated Diagnostic Verification Suite Modal */}
      <DiagnosticSuiteModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        candles={candles}
        zones={zones}
        volatilityMetrics={volatilityMetrics}
        symbol={selectedAsset}
      />

      {/* AI Institutional Order Flow Analyst Modal */}
      <AIAnalystModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        symbol={selectedAsset}
        timeframe="1H"
        currentPrice={currentPrice}
        zones={zones}
        volatilityMetrics={volatilityMetrics}
        recommendations={recommendations}
      />

      {/* Real-Time Gemini 3.8 Flash AI Chat Drawer */}
      <GeminiChatDrawer
        isOpen={isChatOpen}
        onClose={() => {
          setIsChatOpen(false);
          setChatInitialMessage(undefined);
        }}
        symbol={selectedAsset}
        currentPrice={currentPrice}
        timeframe="1H"
        zones={zones}
        volatilityMetrics={volatilityMetrics}
        recommendations={recommendations}
        initialMessage={chatInitialMessage}
        initialRole={chatInitialRole}
      />

      {/* Thinkorswim Order Posting Walkthrough & Clipboard Helper Modal */}
      <ThinkorswimPostModal
        isOpen={isTosModalOpen}
        onClose={() => setIsTosModalOpen(false)}
        recommendation={selectedRecommendation}
        symbol={selectedAsset}
        volatilityMetrics={volatilityMetrics}
        onOpenSchwabModal={() => setIsSchwabModalOpen(true)}
        onOpenQaMonitor={() => setIsQaMonitorOpen(true)}
      />

      {/* QA Safety & Pre-Flight Order Monitor Modal */}
      <QAMonitorModal
        isOpen={isQaMonitorOpen}
        onClose={() => setIsQaMonitorOpen(false)}
        activeSymbol={selectedAsset}
      />

      {/* Floating Real-Time Gemini Chat Trigger */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white shadow-xl shadow-emerald-950/80 border border-emerald-400/40 font-mono text-xs font-semibold cursor-pointer transition-all hover:scale-105 active:scale-95 group"
          title="Open Real-Time Gemini 3.8 AI Market Copilot"
        >
          <Bot className="w-4 h-4 text-emerald-200 animate-pulse" />
          <span>Gemini Copilot</span>
          <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
        </button>
      )}
    </div>
  );
}
