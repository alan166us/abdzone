import React, { useState, useMemo } from 'react';
import { 
  JournalTrade, 
  PatternPerformance, 
  ZonePattern, 
  ZoneType, 
  JournalOutcome, 
  SupplyDemandZone 
} from '../types/trading';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Trophy, 
  TrendingUp, 
  Filter, 
  Plus, 
  Download, 
  Trash2, 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Layers, 
  Sparkles, 
  BarChart3,
  Search,
  Check,
  AlertCircle
} from 'lucide-react';

interface TradingJournalProps {
  trades: JournalTrade[];
  onAddTrade: (trade: Omit<JournalTrade, 'id' | 'timestamp'>) => void;
  onUpdateTrade: (id: string, updates: Partial<JournalTrade>) => void;
  onDeleteTrade: (id: string) => void;
  onInspectZone: (zoneId: string) => void;
  onClearJournal?: () => void;
  onResetSampleData?: () => void;
  currentSymbol: string;
}

export const TradingJournal: React.FC<TradingJournalProps> = ({
  trades,
  onAddTrade,
  onUpdateTrade,
  onDeleteTrade,
  onInspectZone,
  onClearJournal,
  onResetSampleData,
  currentSymbol,
}) => {
  // Filters State
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'Win' | 'Loss' | 'Open'>('all');
  const [patternFilter, setPatternFilter] = useState<'all' | ZonePattern>('all');
  const [sideFilter, setSideFilter] = useState<'all' | 'long' | 'short'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);

  // Manual Form State
  const [formSymbol, setFormSymbol] = useState<string>(currentSymbol || 'SPY');
  const [formSide, setFormSide] = useState<'long' | 'short'>('long');
  const [formPattern, setFormPattern] = useState<ZonePattern>('DBR');
  const [formZoneId, setFormZoneId] = useState<string>('');
  const [formInstrument, setFormInstrument] = useState<'OPTION' | 'STOCK' | 'FUTURE'>('OPTION');
  const [formContracts, setFormContracts] = useState<number>(1);
  const [formEntry, setFormEntry] = useState<string>('');
  const [formStop, setFormStop] = useState<string>('');
  const [formTarget, setFormTarget] = useState<string>('');
  const [formExit, setFormExit] = useState<string>('');
  const [formOutcome, setFormOutcome] = useState<JournalOutcome>('Open');
  const [formNotes, setFormNotes] = useState<string>('');

  // 1. Overall Journal Aggregate Stats
  const stats = useMemo(() => {
    const totalTrades = trades.length;
    const closedTrades = trades.filter(t => t.outcome !== 'Open');
    const wins = trades.filter(t => t.outcome === 'Win');
    const losses = trades.filter(t => t.outcome === 'Loss');
    const openTrades = trades.filter(t => t.outcome === 'Open');

    const totalPnLDollar = closedTrades.reduce((acc, t) => acc + (t.pnlDollar || 0), 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

    const grossProfit = wins.reduce((acc, t) => acc + Math.max(0, t.pnlDollar || 0), 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + Math.min(0, t.pnlDollar || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 9.99 : 1.0;

    const avgRMultiple = closedTrades.length > 0
      ? closedTrades.reduce((acc, t) => acc + (t.rMultiple || 0), 0) / closedTrades.length
      : 0;

    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;

    return {
      totalTrades,
      closedCount: closedTrades.length,
      winCount: wins.length,
      lossCount: losses.length,
      openCount: openTrades.length,
      totalPnLDollar,
      winRate,
      profitFactor,
      avgRMultiple,
      avgWin,
      avgLoss,
    };
  }, [trades]);

  // 2. Pattern-Specific Performance Breakdown (DBR, RBR, RBD, DBD)
  const patternStats = useMemo(() => {
    const patterns: ZonePattern[] = ['DBR', 'RBR', 'RBD', 'DBD'];

    const breakdown: Record<ZonePattern, PatternPerformance> = {
      DBR: { pattern: 'DBR', zoneType: 'demand', totalTrades: 0, wins: 0, losses: 0, openTrades: 0, winRate: 0, totalPnLDollar: 0, profitFactor: 1, avgRMultiple: 0, avgWinDollar: 0, avgLossDollar: 0, bestTradeDollar: 0 },
      RBR: { pattern: 'RBR', zoneType: 'demand', totalTrades: 0, wins: 0, losses: 0, openTrades: 0, winRate: 0, totalPnLDollar: 0, profitFactor: 1, avgRMultiple: 0, avgWinDollar: 0, avgLossDollar: 0, bestTradeDollar: 0 },
      RBD: { pattern: 'RBD', zoneType: 'supply', totalTrades: 0, wins: 0, losses: 0, openTrades: 0, winRate: 0, totalPnLDollar: 0, profitFactor: 1, avgRMultiple: 0, avgWinDollar: 0, avgLossDollar: 0, bestTradeDollar: 0 },
      DBD: { pattern: 'DBD', zoneType: 'supply', totalTrades: 0, wins: 0, losses: 0, openTrades: 0, winRate: 0, totalPnLDollar: 0, profitFactor: 1, avgRMultiple: 0, avgWinDollar: 0, avgLossDollar: 0, bestTradeDollar: 0 },
    };

    patterns.forEach(p => {
      const pTrades = trades.filter(t => t.pattern === p);
      const closed = pTrades.filter(t => t.outcome !== 'Open');
      const wins = pTrades.filter(t => t.outcome === 'Win');
      const losses = pTrades.filter(t => t.outcome === 'Loss');
      const opens = pTrades.filter(t => t.outcome === 'Open');

      const pnl = closed.reduce((acc, t) => acc + (t.pnlDollar || 0), 0);
      const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
      const grossWin = wins.reduce((acc, t) => acc + Math.max(0, t.pnlDollar || 0), 0);
      const grossLoss = Math.abs(losses.reduce((acc, t) => acc + Math.min(0, t.pnlDollar || 0), 0));
      const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 9.99 : 1.0;
      const avgR = closed.length > 0 ? closed.reduce((acc, t) => acc + (t.rMultiple || 0), 0) / closed.length : 0;
      const best = pTrades.reduce((max, t) => Math.max(max, t.pnlDollar || 0), 0);

      breakdown[p] = {
        pattern: p,
        zoneType: (p === 'DBR' || p === 'RBR') ? 'demand' : 'supply',
        totalTrades: pTrades.length,
        wins: wins.length,
        losses: losses.length,
        openTrades: opens.length,
        winRate,
        totalPnLDollar: pnl,
        profitFactor: pf,
        avgRMultiple: avgR,
        avgWinDollar: wins.length > 0 ? grossWin / wins.length : 0,
        avgLossDollar: losses.length > 0 ? grossLoss / losses.length : 0,
        bestTradeDollar: best,
      };
    });

    // Find the #1 most profitable pattern
    const sorted = [...Object.values(breakdown)].sort((a, b) => b.totalPnLDollar - a.totalPnLDollar);
    const topPattern = sorted.length > 0 && sorted[0].totalPnLDollar > 0 ? sorted[0].pattern : null;

    return {
      breakdown,
      topPattern,
    };
  }, [trades]);

  // 3. Filtered Trades List
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      if (outcomeFilter !== 'all' && t.outcome !== outcomeFilter) return false;
      if (patternFilter !== 'all' && t.pattern !== patternFilter) return false;
      if (sideFilter !== 'all' && t.side !== sideFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchSymbol = t.symbol.toLowerCase().includes(q);
        const matchZone = t.zoneId.toLowerCase().includes(q);
        const matchNotes = (t.notes || '').toLowerCase().includes(q);
        const matchPattern = t.pattern.toLowerCase().includes(q);
        if (!matchSymbol && !matchZone && !matchNotes && !matchPattern) return false;
      }
      return true;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [trades, outcomeFilter, patternFilter, sideFilter, searchQuery]);

  // Quick Action: Close Open Trade
  const handleQuickClose = (trade: JournalTrade, outcome: 'Win' | 'Loss') => {
    const isWin = outcome === 'Win';
    const exitPrice = isWin ? trade.targetPrice : trade.stopLoss;
    const riskDollar = Math.abs(trade.entryPrice - trade.stopLoss) * (trade.instrumentType === 'OPTION' ? trade.contracts * 100 : trade.contracts);
    const pnlDollar = isWin ? riskDollar * (trade.rMultiple || 2.5) : -riskDollar;
    const rMultiple = isWin ? (trade.rMultiple || 2.5) : -1.0;

    onUpdateTrade(trade.id, {
      outcome,
      exitPrice,
      exitDateStr: new Date().toISOString().substring(0, 10),
      pnlDollar: Math.round(pnlDollar),
      pnlPercent: isWin ? 65 : -35,
      rMultiple,
    });
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (trades.length === 0) return;
    const headers = [
      'Date',
      'Symbol',
      'Side',
      'Zone_ID',
      'Pattern',
      'Instrument',
      'Contracts',
      'Entry_Price',
      'Stop_Loss',
      'Target_Price',
      'Exit_Price',
      'Outcome',
      'R_Multiple',
      'PnL_Dollar',
      'PnL_Percent',
      'Quality_Score',
      'Execution_Source',
      'Notes'
    ];

    const rows = trades.map(t => [
      t.dateStr,
      t.symbol,
      t.side,
      t.zoneId,
      t.pattern,
      t.instrumentType,
      t.contracts,
      t.entryPrice,
      t.stopLoss,
      t.targetPrice,
      t.exitPrice || '',
      t.outcome,
      t.rMultiple,
      t.pnlDollar,
      t.pnlPercent,
      t.qualityScore,
      t.executionSource,
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `stratazone_trading_journal_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entry = parseFloat(formEntry) || 0;
    const stop = parseFloat(formStop) || 0;
    const target = parseFloat(formTarget) || 0;
    const exit = parseFloat(formExit) || (formOutcome === 'Win' ? target : formOutcome === 'Loss' ? stop : entry);
    const contracts = Math.max(1, formContracts);

    const isOption = formInstrument === 'OPTION';
    const multiplier = isOption ? 100 : 1;
    const riskUnit = Math.abs(entry - stop) || 1;
    const rewardUnit = Math.abs(exit - entry) || 0;

    let rMultiple = 0;
    let pnlDollar = 0;

    if (formOutcome === 'Win') {
      rMultiple = Number((rewardUnit / riskUnit).toFixed(2));
      pnlDollar = Math.round(rMultiple * riskUnit * contracts * multiplier);
    } else if (formOutcome === 'Loss') {
      rMultiple = -1.0;
      pnlDollar = -Math.round(riskUnit * contracts * multiplier);
    } else if (formOutcome === 'Breakeven') {
      rMultiple = 0;
      pnlDollar = 0;
    }

    const zoneType: ZoneType = (formPattern === 'DBR' || formPattern === 'RBR') ? 'demand' : 'supply';
    const generatedZoneId = formZoneId.trim() || `${zoneType}-${formPattern}-user-${Math.round(entry)}`;

    onAddTrade({
      dateStr: new Date().toISOString().substring(0, 10),
      symbol: formSymbol.toUpperCase().trim(),
      side: formSide,
      zoneId: generatedZoneId,
      zoneType,
      pattern: formPattern,
      instrumentType: formInstrument,
      contracts,
      entryPrice: entry,
      stopLoss: stop,
      targetPrice: target,
      exitPrice: formOutcome !== 'Open' ? exit : undefined,
      exitDateStr: formOutcome !== 'Open' ? new Date().toISOString().substring(0, 10) : undefined,
      outcome: formOutcome,
      rMultiple,
      pnlDollar,
      pnlPercent: formOutcome === 'Win' ? 70 : formOutcome === 'Loss' ? -35 : 0,
      qualityScore: 85,
      executionSource: 'Manual',
      notes: formNotes,
    });

    setIsManualModalOpen(false);
    setFormNotes('');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0B0F17] overflow-y-auto p-4 md:p-6 space-y-6 select-text min-h-0">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-white font-display">Institutional Trading Journal</h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Zone ID Tracking
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tracks executed trades, profit outcomes, and analyzes which Supply & Demand patterns (DBR, RBR, RBD, DBD) give you the strongest statistical edge.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onResetSampleData && (
            <button
              onClick={onResetSampleData}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Load realistic executed trade history from supply/demand zones"
            >
              Seed History
            </button>
          )}

          <button
            onClick={handleExportCSV}
            disabled={trades.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
            title="Download full journal CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setIsManualModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Trade</span>
          </button>
        </div>
      </div>

      {/* 2. Primary Performance Strip (HUD) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0F172A]/70">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Total Realized P&L</div>
          <div className={`text-xl font-bold font-mono mt-1 tabular-nums ${
            stats.totalPnLDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {stats.totalPnLDollar >= 0 ? '+' : ''}${stats.totalPnLDollar.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {stats.closedCount} closed trade{stats.closedCount !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0F172A]/70">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Win Rate</div>
          <div className="text-xl font-bold font-mono mt-1 tabular-nums text-slate-100">
            {stats.winRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            <span className="text-emerald-400 font-medium">{stats.winCount}W</span> · <span className="text-rose-400 font-medium">{stats.lossCount}L</span>
            {stats.openCount > 0 && <span className="text-sky-400 font-medium ml-1">({stats.openCount} open)</span>}
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0F172A]/70">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Profit Factor</div>
          <div className="text-xl font-bold font-mono mt-1 tabular-nums text-sky-400">
            {stats.profitFactor.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Gross Gain / Loss ratio
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0F172A]/70">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Avg R-Multiple</div>
          <div className={`text-xl font-bold font-mono mt-1 tabular-nums ${
            stats.avgRMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {stats.avgRMultiple >= 0 ? '+' : ''}{stats.avgRMultiple.toFixed(2)}R
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Per closed setup
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0F172A]/70">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Average Winner</div>
          <div className="text-xl font-bold font-mono mt-1 tabular-nums text-emerald-400">
            +${Math.round(stats.avgWin).toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Reward efficiency
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0F172A]/70">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Average Loser</div>
          <div className="text-xl font-bold font-mono mt-1 tabular-nums text-rose-400">
            -${Math.round(stats.avgLoss).toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Controlled by stop-loss
          </div>
        </div>
      </div>

      {/* 3. Pattern Edge Analyzer: Which Supply & Demand Patterns are Most Profitable */}
      <div className="p-5 rounded-lg border border-slate-800 bg-[#0F172A]/40 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white font-display">
              Pattern Profitability Ranking (DBR · RBR · RBD · DBD)
            </h2>
          </div>
          <div className="text-xs text-slate-400">
            Correlated across tagged zone footprints
          </div>
        </div>

        {/* Pattern Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {(['DBR', 'RBR', 'RBD', 'DBD'] as ZonePattern[]).map((pattern) => {
            const pData = patternStats.breakdown[pattern];
            const isTop = patternStats.topPattern === pattern;
            const isDemand = pattern === 'DBR' || pattern === 'RBR';

            return (
              <div
                key={pattern}
                onClick={() => setPatternFilter(patternFilter === pattern ? 'all' : pattern)}
                className={`p-4 rounded-lg border transition-all cursor-pointer relative overflow-hidden ${
                  patternFilter === pattern
                    ? 'border-amber-400 bg-slate-900/90 shadow-lg shadow-amber-950/20'
                    : isTop
                    ? 'border-amber-500/40 bg-[#0B0F17]/90'
                    : 'border-slate-800 bg-[#0B0F17]/60 hover:border-slate-700'
                }`}
              >
                {/* Top Badge */}
                {isTop && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                    <Trophy className="w-3 h-3" />
                    <span>#1 Most Profitable</span>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <span className={isDemand ? 'text-emerald-400' : 'text-rose-400'}>
                    {isDemand ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  </span>
                  <div>
                    <span className="font-bold text-sm text-slate-100 font-mono">{pattern}</span>
                    <span className="text-[10px] text-slate-400 ml-1.5">
                      {pattern === 'DBR' && 'Drop-Base-Rally (Demand Reversal)'}
                      {pattern === 'RBR' && 'Rally-Base-Rally (Demand Continuation)'}
                      {pattern === 'RBD' && 'Rally-Base-Drop (Supply Reversal)'}
                      {pattern === 'DBD' && 'Drop-Base-Drop (Supply Continuation)'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800/80 font-mono">
                  <div>
                    <div className="text-[10px] text-slate-500">Net Profit</div>
                    <div className={`text-base font-bold tabular-nums ${
                      pData.totalPnLDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {pData.totalPnLDollar >= 0 ? '+' : ''}${pData.totalPnLDollar.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-500">Win Rate</div>
                    <div className="text-base font-bold tabular-nums text-slate-200">
                      {pData.winRate.toFixed(1)}%
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-500">Trade Volume</div>
                    <div className="text-xs text-slate-300 tabular-nums">
                      {pData.wins}W / {pData.losses}L ({pData.totalTrades} total)
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-500">Expectancy</div>
                    <div className="text-xs text-sky-400 tabular-nums font-semibold">
                      {pData.avgRMultiple >= 0 ? '+' : ''}{pData.avgRMultiple.toFixed(2)}R avg
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Insight Banner */}
        <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/60 text-xs text-slate-300">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-white">Algorithmic Edge Summary: </span>
            {patternStats.topPattern ? (
              <>
                Your strongest edge is <span className="text-amber-400 font-bold font-mono">{patternStats.topPattern}</span> with{' '}
                <span className="text-emerald-400 font-semibold">{patternStats.breakdown[patternStats.topPattern].winRate.toFixed(1)}% Win Rate</span> and{' '}
                <span className="text-emerald-400 font-semibold">+${patternStats.breakdown[patternStats.topPattern].totalPnLDollar.toLocaleString()}</span> in realized profits. 
                Focus your largest option position sizing on {patternStats.topPattern} zones when they align with fresh wholesaler volume imbalances.
              </>
            ) : (
              'Log or execute trades to begin building your institutional pattern win/loss distribution.'
            )}
          </div>
        </div>
      </div>

      {/* 4. Interactive Trades Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-slate-800 bg-[#0F172A]/50">
        <div className="flex flex-wrap items-center gap-2">
          {/* Outcome Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-medium">
            <button
              onClick={() => setOutcomeFilter('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                outcomeFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({trades.length})
            </button>
            <button
              onClick={() => setOutcomeFilter('Win')}
              className={`px-2.5 py-1 rounded transition-colors ${
                outcomeFilter === 'Win' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Wins ({stats.winCount})
            </button>
            <button
              onClick={() => setOutcomeFilter('Loss')}
              className={`px-2.5 py-1 rounded transition-colors ${
                outcomeFilter === 'Loss' ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Losses ({stats.lossCount})
            </button>
            <button
              onClick={() => setOutcomeFilter('Open')}
              className={`px-2.5 py-1 rounded transition-colors ${
                outcomeFilter === 'Open' ? 'bg-sky-950/80 text-sky-300 border border-sky-800/80' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Open ({stats.openCount})
            </button>
          </div>

          {/* Pattern Filter Selector */}
          <select
            value={patternFilter}
            onChange={(e) => setPatternFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-400 font-mono"
          >
            <option value="all">All Patterns</option>
            <option value="DBR">DBR (Drop-Base-Rally)</option>
            <option value="RBR">RBR (Rally-Base-Rally)</option>
            <option value="RBD">RBD (Rally-Base-Drop)</option>
            <option value="DBD">DBD (Drop-Base-Drop)</option>
          </select>

          {/* Side Filter */}
          <select
            value={sideFilter}
            onChange={(e) => setSideFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-400 font-mono"
          >
            <option value="all">Both Sides</option>
            <option value="long">Long / Call Only</option>
            <option value="short">Short / Put Only</option>
          </select>
        </div>

        {/* Search input */}
        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search symbol, zone ID, notes..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>
      </div>

      {/* 5. Trades Ledger Table */}
      <div className="rounded-lg border border-slate-800 bg-[#0B0F17] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/70 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Symbol & Trade</th>
                <th className="py-3 px-4">Tagged Zone ID</th>
                <th className="py-3 px-4 text-right">Entry $\rightarrow$ Stop / Target</th>
                <th className="py-3 px-4 text-center">Outcome</th>
                <th className="py-3 px-4 text-right">R-Multiple</th>
                <th className="py-3 px-4 text-right">Net P&L ($ / %)</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
              {filteredTrades.map((t) => {
                const isWin = t.outcome === 'Win';
                const isLoss = t.outcome === 'Loss';
                const isOpen = t.outcome === 'Open';
                const isLong = t.side === 'long';

                return (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Date */}
                    <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                      <div>{t.dateStr}</div>
                      <div className="text-[10px] text-slate-500">{t.executionSource}</div>
                    </td>

                    {/* Symbol & Instrument */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-bold text-white">
                        <span className={isLong ? 'text-emerald-400' : 'text-rose-400'}>
                          {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        </span>
                        <span>{t.symbol}</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          ({t.contracts} {t.instrumentType === 'OPTION' ? (t.optionType || 'OPT') : 'shs'})
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {isLong ? 'LONG / CALL' : 'SHORT / PUT'} · Score {t.qualityScore}%
                      </div>
                    </td>

                    {/* Tagged Zone ID & Pattern */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onInspectZone(t.zoneId)}
                          className="font-semibold text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1 group text-left"
                          title="Inspect zone geometry on chart"
                        >
                          <span>{t.zoneId}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span className="font-bold text-amber-400">{t.pattern}</span>
                        <span className="text-slate-600">·</span>
                        <span>{t.zoneType === 'demand' ? 'Demand Zone' : 'Supply Zone'}</span>
                      </div>
                    </td>

                    {/* Entry / Stop / Target */}
                    <td className="py-3.5 px-4 text-right tabular-nums whitespace-nowrap">
                      <div className="text-slate-200">
                        In: <span className="font-semibold">${t.entryPrice.toFixed(2)}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        SL: ${t.stopLoss.toFixed(2)} · TP: ${t.targetPrice.toFixed(2)}
                      </div>
                    </td>

                    {/* Outcome Badge */}
                    <td className="py-3.5 px-4 text-center">
                      {isWin && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>WIN</span>
                        </span>
                      )}
                      {isLoss && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-950/80 border border-rose-800/80 px-2 py-0.5 rounded">
                          <XCircle className="w-3 h-3" />
                          <span>LOSS</span>
                        </span>
                      )}
                      {isOpen && (
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 bg-sky-950/80 border border-sky-800/80 px-2 py-0.5 rounded">
                          <Clock className="w-3 h-3 animate-spin" />
                          <span>OPEN</span>
                        </div>
                      )}
                      {t.outcome === 'Breakeven' && (
                        <span className="inline-flex items-center text-[11px] font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
                          BE
                        </span>
                      )}
                    </td>

                    {/* R Multiple */}
                    <td className="py-3.5 px-4 text-right tabular-nums font-bold">
                      {isOpen ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <span className={t.rMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {t.rMultiple >= 0 ? '+' : ''}{t.rMultiple.toFixed(2)}R
                        </span>
                      )}
                    </td>

                    {/* Net PnL */}
                    <td className="py-3.5 px-4 text-right tabular-nums">
                      {isOpen ? (
                        <span className="text-slate-500">In Play</span>
                      ) : (
                        <>
                          <div className={`font-bold ${t.pnlDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.pnlDollar >= 0 ? '+' : ''}${Math.round(t.pnlDollar).toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(1)}%
                          </div>
                        </>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {isOpen ? (
                          <>
                            <button
                              onClick={() => handleQuickClose(t, 'Win')}
                              className="px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:text-white bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 rounded transition-colors"
                              title="Target Hit (+Win)"
                            >
                              Hit Target
                            </button>
                            <button
                              onClick={() => handleQuickClose(t, 'Loss')}
                              className="px-2 py-0.5 text-[10px] font-semibold text-rose-300 hover:text-white bg-rose-950 hover:bg-rose-900 border border-rose-800 rounded transition-colors"
                              title="Stopped Out (-Loss)"
                            >
                              Stop Out
                            </button>
                          </>
                        ) : null}

                        <button
                          onClick={() => onDeleteTrade(t.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Delete trade entry"
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

        {filteredTrades.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            No trades match the selected outcome or pattern filters.
          </div>
        )}
      </div>

      {/* 6. Manual Log Trade Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0F172A] border border-slate-800 rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white font-display">Log Executed Trade Setup</h3>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Symbol</label>
                  <input
                    type="text"
                    value={formSymbol}
                    onChange={(e) => setFormSymbol(e.target.value)}
                    required
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Trade Side</label>
                  <select
                    value={formSide}
                    onChange={(e) => setFormSide(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono"
                  >
                    <option value="long">Long (Buy Call / Shares)</option>
                    <option value="short">Short (Buy Put / Shares)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Zone Pattern</label>
                  <select
                    value={formPattern}
                    onChange={(e) => setFormPattern(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono"
                  >
                    <option value="DBR">DBR (Drop-Base-Rally Demand)</option>
                    <option value="RBR">RBR (Rally-Base-Rally Demand)</option>
                    <option value="RBD">RBD (Rally-Base-Drop Supply)</option>
                    <option value="DBD">DBD (Drop-Base-Drop Supply)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Tagged Zone ID</label>
                  <input
                    type="text"
                    value={formZoneId}
                    onChange={(e) => setFormZoneId(e.target.value)}
                    placeholder="e.g. demand-DBR-14-572"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono placeholder-slate-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Entry Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formEntry}
                    onChange={(e) => setFormEntry(e.target.value)}
                    required
                    placeholder="575.50"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Stop Loss</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formStop}
                    onChange={(e) => setFormStop(e.target.value)}
                    required
                    placeholder="571.20"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Target Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formTarget}
                    onChange={(e) => setFormTarget(e.target.value)}
                    required
                    placeholder="583.00"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Instrument</label>
                  <select
                    value={formInstrument}
                    onChange={(e) => setFormInstrument(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono"
                  >
                    <option value="OPTION">Option</option>
                    <option value="STOCK">Stock Shares</option>
                    <option value="FUTURE">Futures Contract</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Size (Contracts)</label>
                  <input
                    type="number"
                    min="1"
                    value={formContracts}
                    onChange={(e) => setFormContracts(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Current Outcome</label>
                  <select
                    value={formOutcome}
                    onChange={(e) => setFormOutcome(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono"
                  >
                    <option value="Open">Open (In Play)</option>
                    <option value="Win">Win (Target Hit)</option>
                    <option value="Loss">Loss (Stopped Out)</option>
                    <option value="Breakeven">Breakeven</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Trade Notes & Observations</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Clean DBR bounce during opening hour. Wholesaler volume confirmed."
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded shadow-md"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
