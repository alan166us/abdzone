import React, { useState, useMemo, useEffect } from 'react';
import { BacktestConfig, BacktestSummary, BacktestTrade, Candle, SupplyDemandZone, VolatilityMetrics } from '../types/trading';
import { runHistoricalZoneBacktest } from '../utils/tradeEngine';
import { 
  Download, 
  Sliders, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface StrategyBacktestProps {
  candles: Candle[];
  zones: SupplyDemandZone[];
  volatilityMetrics: VolatilityMetrics;
  symbol: string;
  onInspectTrade?: (trade: BacktestTrade) => void;
}

export const StrategyBacktest: React.FC<StrategyBacktestProps> = ({
  candles,
  zones,
  volatilityMetrics,
  symbol,
  onInspectTrade,
}) => {
  // Available bounds from candles
  const minDateStr = candles.length > 0 ? candles[0].dateStr.substring(0, 10) : '2026-01-01';
  const maxDateStr = candles.length > 0 ? candles[candles.length - 1].dateStr.substring(0, 10) : '2026-12-31';

  // Backtest Configuration State
  const [startDate, setStartDate] = useState<string>(() => {
    // Default to approximately 14 days ago or first candle
    if (candles.length > 100) {
      const idx = Math.max(0, candles.length - 150);
      return candles[idx].dateStr.substring(0, 10);
    }
    return minDateStr;
  });

  const [endDate, setEndDate] = useState<string>(maxDateStr);
  const [initialBalance, setInitialBalance] = useState<number>(50000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [targetMode, setTargetMode] = useState<'tp1' | 'tp2' | 'tp3'>('tp2');
  const [atrBufferMultiplier, setAtrBufferMultiplier] = useState<number>(
    volatilityMetrics.recommendedBufferMultiplier || 1.35
  );
  const [minQualityScore, setMinQualityScore] = useState<number>(50);
  const [sideFilter, setSideFilter] = useState<'all' | 'long' | 'short'>('all');
  const [freshOnly, setFreshOnly] = useState<boolean>(false);

  // UI state
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'wins' | 'losses' | 'long' | 'short'>('all');
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);

  // Auto-sync start and end dates when candles dataset updates (e.g. changing ticker or importing CSV)
  useEffect(() => {
    if (candles.length > 0) {
      const first = candles[0].dateStr.substring(0, 10);
      const last = candles[candles.length - 1].dateStr.substring(0, 10);
      setStartDate(first);
      setEndDate(last);
    }
  }, [candles, symbol]);

  // Run backtest computation
  const summary: BacktestSummary = useMemo(() => {
    const config: BacktestConfig = {
      startDate: `${startDate} 00:00`,
      endDate: `${endDate} 23:59`,
      initialBalance,
      riskPercent,
      targetMode,
      atrBufferMultiplier,
      minQualityScore,
      sideFilter,
      freshOnly,
    };
    return runHistoricalZoneBacktest(candles, zones, volatilityMetrics, config);
  }, [
    candles,
    zones,
    volatilityMetrics,
    startDate,
    endDate,
    initialBalance,
    riskPercent,
    targetMode,
    atrBufferMultiplier,
    minQualityScore,
    sideFilter,
    freshOnly,
  ]);

  // Date Presets Handler
  const handleApplyPreset = (days: number | 'all') => {
    if (days === 'all') {
      setStartDate(minDateStr);
      setEndDate(maxDateStr);
      return;
    }

    const latest = candles[candles.length - 1];
    if (!latest) return;

    const msPerDay = 24 * 3600 * 1000;
    const targetMs = latest.time - days * msPerDay;

    const startCandle = candles.find(c => c.time >= targetMs) || candles[0];
    setStartDate(startCandle.dateStr.substring(0, 10));
    setEndDate(latest.dateStr.substring(0, 10));
  };

  // Filtered trades list
  const filteredTrades = useMemo(() => {
    return summary.trades.filter(t => {
      if (tradeFilter === 'wins') return t.rMultiple > 0;
      if (tradeFilter === 'losses') return t.rMultiple < 0;
      if (tradeFilter === 'long') return t.side === 'long';
      if (tradeFilter === 'short') return t.side === 'short';
      return true;
    });
  }, [summary.trades, tradeFilter]);

  // Export Backtest Report as CSV
  const handleExportCSV = () => {
    if (summary.trades.length === 0) return;

    const headers = [
      'Trade ID',
      'Side',
      'Pattern',
      'Quality Score',
      'Entry Date',
      'Entry Price',
      'Exit Date',
      'Exit Price',
      'Stop Loss',
      'Buffer ATR',
      'Outcome',
      'R-Multiple',
      'PnL ($)',
      'PnL (%)',
      'Ending Balance',
      'Bars Held',
    ];

    const rows = summary.trades.map(t => [
      t.id,
      t.side.toUpperCase(),
      t.pattern,
      t.qualityScore,
      t.entryDateStr,
      t.entryPrice.toFixed(2),
      t.exitDateStr,
      t.exitPrice.toFixed(2),
      t.stopLossPrice.toFixed(2),
      t.bufferAmount.toFixed(2),
      t.outcome.toUpperCase(),
      t.rMultiple.toFixed(2),
      t.pnlDollar.toFixed(2),
      t.pnlPercent.toFixed(2),
      t.balanceAfter.toFixed(2),
      t.barsHeld,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `StrataZone_Backtest_${symbol.replace('/', '_')}_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate SVG Equity Curve points
  const equityPoints = summary.equityCurve;
  const minEquity = Math.min(...equityPoints.map(p => p.equity), summary.initialBalance * 0.95);
  const maxEquity = Math.max(...equityPoints.map(p => p.equity), summary.initialBalance * 1.05);
  const equityRange = maxEquity - minEquity || 1;

  const svgWidth = 800;
  const svgHeight = 160;
  const paddingY = 16;
  const paddingX = 20;

  const getSvgX = (index: number) => {
    if (equityPoints.length <= 1) return paddingX;
    return paddingX + (index / (equityPoints.length - 1)) * (svgWidth - paddingX * 2);
  };

  const getSvgY = (equity: number) => {
    return svgHeight - paddingY - ((equity - minEquity) / equityRange) * (svgHeight - paddingY * 2);
  };

  const baselineY = getSvgY(summary.initialBalance);

  let pathD = '';
  equityPoints.forEach((p, idx) => {
    const x = getSvgX(idx);
    const y = getSvgY(p.equity);
    if (idx === 0) pathD += `M ${x} ${y}`;
    else pathD += ` L ${x} ${y}`;
  });

  const areaD = pathD ? `${pathD} L ${getSvgX(equityPoints.length - 1)} ${svgHeight - paddingY} L ${getSvgX(0)} ${svgHeight - paddingY} Z` : '';

  return (
    <div className="flex flex-col h-full bg-[#0B0F17] rounded-lg border border-slate-800 overflow-hidden">
      {/* 1. Header & Date Range Control Bar */}
      <div className="px-6 py-4 border-b border-slate-800 bg-[#0F172A]/70 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white font-display">Historical Strategy Backtest Engine</h2>
            {summary.disclaimer && (
              <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-[10px] font-mono text-emerald-300">
                {summary.disclaimer}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Test automatic Supply & Demand detection and volatility-adjusted entry/exit setups across historical market cycles.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
              showConfigDrawer
                ? 'bg-slate-800 text-white border-slate-700'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span>Parameters</span>
            {showConfigDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleExportCSV}
            disabled={summary.trades.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-slate-300 hover:text-white text-xs font-mono transition-colors"
            title="Download CSV Trade Log"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Interactive Date Range Selector Strip */}
      <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-950/80 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        {/* Date Inputs */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">START:</span>
            <input
              type="date"
              value={startDate}
              min={minDateStr}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-slate-200 px-2.5 py-1 rounded focus:outline-none focus:border-emerald-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">END:</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={maxDateStr}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-slate-200 px-2.5 py-1 rounded focus:outline-none focus:border-emerald-500 cursor-pointer"
            />
          </div>

          <div className="text-slate-500 hidden sm:inline">
            · <span className="text-slate-300">{summary.totalCandlesInRange}</span> candles in range
          </div>
        </div>

        {/* Quick Range Presets */}
        <div className="flex items-center gap-1">
          <span className="text-slate-500 mr-1 text-[11px]">PRESETS:</span>
          {[
            { label: '7D', days: 7 },
            { label: '14D', days: 14 },
            { label: '30D', days: 30 },
            { label: 'ALL', days: 'all' as const },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleApplyPreset(preset.days)}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-[11px] transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Collapsible Backtest Parameters Configuration Drawer */}
      {showConfigDrawer && (
        <div className="p-6 border-b border-slate-800 bg-[#0F172A]/90 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-xs font-mono animate-in slide-in-from-top-2">
          {/* Initial Balance */}
          <div className="space-y-1.5">
            <label className="text-slate-400">INITIAL EQUITY ($ USD)</label>
            <input
              type="number"
              value={initialBalance}
              onChange={(e) => setInitialBalance(Math.max(100, parseFloat(e.target.value) || 0))}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Risk % per trade */}
          <div className="space-y-1.5">
            <label className="text-slate-400">RISK PER TRADE (%)</label>
            <select
              value={riskPercent}
              onChange={(e) => setRiskPercent(parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-white focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="0.5">0.5% (Conservative)</option>
              <option value="1.0">1.0% (Standard Institutional)</option>
              <option value="1.5">1.5% (Aggressive)</option>
              <option value="2.0">2.0% (High Growth)</option>
            </select>
          </div>

          {/* Take-Profit Mode */}
          <div className="space-y-1.5">
            <label className="text-slate-400">PROFIT TARGET MODE</label>
            <select
              value={targetMode}
              onChange={(e) => setTargetMode(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-white focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="tp1">Target 1 (1:2 R:R Conservative Scalp)</option>
              <option value="tp2">Target 2 (1:3 R:R Standard Swing)</option>
              <option value="tp3">Target 3 (1:4.5 R:R Structural Runner)</option>
            </select>
          </div>

          {/* Volatility Buffer Multiplier */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-400">ATR BUFFER MULTIPLIER</label>
              <span className="text-sky-400 font-bold">{atrBufferMultiplier.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="2.2"
              step="0.05"
              value={atrBufferMultiplier}
              onChange={(e) => setAtrBufferMultiplier(parseFloat(e.target.value))}
              className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded cursor-pointer mt-2"
            />
          </div>

          {/* Min Quality Score */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-400">MIN ZONE QUALITY</label>
              <span className="text-emerald-400 font-bold">&ge; {minQualityScore}%</span>
            </div>
            <input
              type="range"
              min="30"
              max="85"
              step="5"
              value={minQualityScore}
              onChange={(e) => setMinQualityScore(parseInt(e.target.value))}
              className="w-full accent-emerald-400 h-1.5 bg-slate-800 rounded cursor-pointer mt-2"
            />
          </div>

          {/* Side Filter */}
          <div className="space-y-1.5">
            <label className="text-slate-400">DIRECTIONAL BIAS</label>
            <select
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-white focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="all">Both Long (Demand) & Short (Supply)</option>
              <option value="long">Long Only (Demand Zones)</option>
              <option value="short">Short Only (Supply Zones)</option>
            </select>
          </div>

          {/* Fresh Zones Only */}
          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="flex items-center gap-2 cursor-pointer py-1.5 text-slate-300">
              <input
                type="checkbox"
                checked={freshOnly}
                onChange={(e) => setFreshOnly(e.target.checked)}
                className="rounded border-slate-800 bg-slate-900 accent-emerald-400 w-4 h-4 cursor-pointer"
              />
              <span>Fresh Untested Zones Only</span>
            </label>
          </div>
        </div>
      )}

      {/* 4. Executive KPI Dashboard Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 p-5 border-b border-slate-800/80 bg-slate-900/30">
        {/* Net P&L */}
        <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-mono mb-1">Net Realized Profit</div>
          <div className={`text-xl font-bold font-mono tabular-nums ${
            summary.netProfitDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {summary.netProfitDollar >= 0 ? '+' : ''}${summary.netProfitDollar.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={`text-[11px] font-mono mt-0.5 ${summary.netProfitPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {summary.netProfitPercent >= 0 ? '+' : ''}{summary.netProfitPercent.toFixed(2)}%
          </div>
        </div>

        {/* Win Rate */}
        <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-mono mb-1">Win Rate %</div>
          <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
            {summary.winRate.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            {summary.wins} W / {summary.losses} L ({summary.totalTrades} total)
          </div>
        </div>

        {/* Profit Factor */}
        <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-mono mb-1">Profit Factor</div>
          <div className="text-xl font-bold font-mono text-sky-400 tabular-nums">
            {summary.profitFactor.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            Gross Gain vs Loss
          </div>
        </div>

        {/* Max Drawdown */}
        <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-mono mb-1">Max Drawdown</div>
          <div className="text-xl font-bold font-mono text-rose-400 tabular-nums">
            -{summary.maxDrawdownPercent.toFixed(2)}%
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            -${summary.maxDrawdownDollar.toFixed(0)} peak-to-trough
          </div>
        </div>

        {/* Average Return per Risk (Avg R) */}
        <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-mono mb-1">Trade Expectancy</div>
          <div className="text-xl font-bold font-mono text-purple-400 tabular-nums">
            +{summary.avgRMultiple.toFixed(2)}R
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            Target: 1:{targetMode === 'tp1' ? '2.0' : targetMode === 'tp2' ? '3.0' : '4.5'}
          </div>
        </div>

        {/* Directional Win Breakdown */}
        <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-mono mb-1">Long vs Short Rate</div>
          <div className="text-xs font-mono space-y-1 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-emerald-400">Demand:</span>
              <span className="font-bold text-slate-200">{summary.longWinRate.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-rose-400">Supply:</span>
              <span className="font-bold text-slate-200">{summary.shortWinRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Interactive Portfolio Equity Growth Curve */}
      <div className="px-6 py-4 border-b border-slate-800 bg-[#0B0F17] flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300 font-bold uppercase tracking-wider">Cumulative Portfolio Equity Curve</span>
            <span className="text-slate-500">(${summary.initialBalance.toLocaleString()} &rarr; ${summary.endingBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
          </div>

          {hoveredPoint ? (
            <div className="flex items-center gap-3 text-slate-300">
              <span>{hoveredPoint.dateStr}</span>
              <span className="font-bold text-emerald-400">${hoveredPoint.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-rose-400">DD: -{hoveredPoint.drawdownPercent.toFixed(1)}%</span>
            </div>
          ) : (
            <div className="text-slate-500 text-[11px]">
              Hover points to inspect individual trade outcomes
            </div>
          )}
        </div>

        {/* SVG Curve */}
        <div className="w-full h-40 relative bg-slate-950/60 rounded-lg border border-slate-800/80 overflow-hidden">
          <svg className="w-full h-full" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Baseline at Initial Capital */}
            <line
              x1={paddingX}
              y1={baselineY}
              x2={svgWidth - paddingX}
              y2={baselineY}
              stroke="#334155"
              strokeDasharray="4 4"
              strokeWidth="1"
            />

            {/* Filled Area */}
            {areaD && <path d={areaD} fill="url(#equityGradient)" />}

            {/* Main Equity Path Line */}
            {pathD && <path d={pathD} fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}

            {/* Trade Markers */}
            {equityPoints.map((p, idx) => {
              if (idx === 0) return null;
              const cx = getSvgX(idx);
              const cy = getSvgY(p.equity);
              const isWin = p.outcome === 'win';
              const isLoss = p.outcome === 'loss';

              return (
                <circle
                  key={idx}
                  cx={cx}
                  cy={cy}
                  r="4"
                  fill={isWin ? '#10B981' : (isLoss ? '#F43F5E' : '#64748B')}
                  stroke="#0B0F17"
                  strokeWidth="1.5"
                  className="cursor-pointer hover:r-6 transition-all"
                  onMouseEnter={() => setHoveredPoint(p)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* 6. Trade Log Table with Filter Bar */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Table Filter Tabs */}
        <div className="px-6 py-2.5 border-b border-slate-800 bg-[#0F172A]/40 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTradeFilter('all')}
              className={`px-3 py-1 rounded transition-colors ${
                tradeFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Trades ({summary.trades.length})
            </button>
            <button
              onClick={() => setTradeFilter('wins')}
              className={`px-3 py-1 rounded transition-colors ${
                tradeFilter === 'wins' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Wins ({summary.wins})
            </button>
            <button
              onClick={() => setTradeFilter('losses')}
              className={`px-3 py-1 rounded transition-colors ${
                tradeFilter === 'losses' ? 'bg-rose-950 text-rose-300 border border-rose-800 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Losses ({summary.losses})
            </button>
            <button
              onClick={() => setTradeFilter('long')}
              className={`px-3 py-1 rounded transition-colors ${
                tradeFilter === 'long' ? 'bg-slate-800 text-slate-200 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Demand Longs ({summary.trades.filter(t => t.side === 'long').length})
            </button>
            <button
              onClick={() => setTradeFilter('short')}
              className={`px-3 py-1 rounded transition-colors ${
                tradeFilter === 'short' ? 'bg-slate-800 text-slate-200 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Supply Shorts ({summary.trades.filter(t => t.side === 'short').length})
            </button>
          </div>

          <div className="text-slate-500 text-[11px]">
            Showing {filteredTrades.length} trades
          </div>
        </div>

        {/* Scrollable Trade Data Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-mono text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <th className="py-3 px-4"># & Setup</th>
                <th className="py-3 px-4">Entry Date / Price</th>
                <th className="py-3 px-4">Exit Date / Price</th>
                <th className="py-3 px-4">Stop-Loss (Buffer)</th>
                <th className="py-3 px-4 text-center">Duration</th>
                <th className="py-3 px-4 text-center">Outcome</th>
                <th className="py-3 px-4 text-right">R-Multiple</th>
                <th className="py-3 px-4 text-right">Realized P&L ($)</th>
                <th className="py-3 px-4 text-right">Balance</th>
                <th className="py-3 px-4 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
              {filteredTrades.map((trade) => {
                const isWin = trade.rMultiple > 0;
                return (
                  <tr key={trade.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Trade ID & Pattern */}
                    <td className="py-3 px-4 font-medium">
                      <div className="flex items-center gap-2">
                        <span className={trade.side === 'long' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {trade.side.toUpperCase()}
                        </span>
                        <span className="text-slate-400">· {trade.pattern}</span>
                        <span className="text-[10px] text-slate-500">({trade.qualityScore}%)</span>
                      </div>
                    </td>

                    {/* Entry Date & Price */}
                    <td className="py-3 px-4">
                      <div className="text-slate-200 tabular-nums font-semibold">${trade.entryPrice.toFixed(2)}</div>
                      <div className="text-[10px] text-slate-500">{trade.entryDateStr}</div>
                    </td>

                    {/* Exit Date & Price */}
                    <td className="py-3 px-4">
                      <div className="text-slate-200 tabular-nums font-semibold">${trade.exitPrice.toFixed(2)}</div>
                      <div className="text-[10px] text-slate-500">{trade.exitDateStr}</div>
                    </td>

                    {/* Stop-Loss & Buffer */}
                    <td className="py-3 px-4">
                      <div className="text-rose-400/90 tabular-nums">${trade.stopLossPrice.toFixed(2)}</div>
                      <div className="text-[10px] text-slate-500">${trade.bufferAmount.toFixed(2)} buffer</div>
                    </td>

                    {/* Bars Held */}
                    <td className="py-3 px-4 text-center text-slate-400">
                      {trade.barsHeld} bar{trade.barsHeld > 1 ? 's' : ''}
                    </td>

                    {/* Outcome Badge */}
                    <td className="py-3 px-4 text-center">
                      {trade.outcome === 'sl' ? (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                          <XCircle className="w-3.5 h-3.5" /> Stop-Loss
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {trade.outcome.toUpperCase()}
                        </span>
                      )}
                    </td>

                    {/* R-Multiple */}
                    <td className={`py-3 px-4 text-right font-bold tabular-nums ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isWin ? '+' : ''}{trade.rMultiple.toFixed(1)}R
                    </td>

                    {/* Realized P&L */}
                    <td className={`py-3 px-4 text-right tabular-nums font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isWin ? '+' : ''}${trade.pnlDollar.toFixed(2)} ({isWin ? '+' : ''}{trade.pnlPercent.toFixed(2)}%)
                    </td>

                    {/* Balance After */}
                    <td className="py-3 px-4 text-right tabular-nums text-slate-300">
                      ${trade.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center">
                      {onInspectTrade && (
                        <button
                          onClick={() => onInspectTrade(trade)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[10px] transition-colors inline-flex items-center gap-1"
                          title="Focus Trade & Zone on Chart"
                        >
                          <span>Chart</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredTrades.length === 0 && (
            <div className="p-12 text-center text-slate-500 font-mono text-xs">
              No historical trades matched the selected filters within the specified date range.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
