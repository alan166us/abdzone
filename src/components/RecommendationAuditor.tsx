import React, { useState, useMemo } from 'react';
import { 
  AuditedRecommendation, 
  AuditAggregateStats, 
  calculateAuditStats, 
  createAuditSnapshotFromRecommendation, 
  evaluateAuditRecordsAgainstCandles,
  getSampleAuditRecords 
} from '../utils/auditEngine';
import { TradeRecommendation, VolatilityMetrics, SupplyDemandZone, Candle } from '../types/trading';
import { 
  ShieldCheck, 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Clock, 
  Camera, 
  RefreshCw, 
  Download, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ExternalLink, 
  Building2, 
  Sparkles,
  Check,
  ChevronRight
} from 'lucide-react';

interface RecommendationAuditorProps {
  candles: Candle[];
  recommendations: TradeRecommendation[];
  volatilityMetrics: VolatilityMetrics;
  zones: SupplyDemandZone[];
  symbol: string;
  currentPrice: number;
  onInspectOnChart: (symbol: string, zoneId?: string) => void;
}

export const RecommendationAuditor: React.FC<RecommendationAuditorProps> = ({
  candles,
  recommendations,
  volatilityMetrics,
  zones,
  symbol,
  currentPrice,
  onInspectOnChart,
}) => {
  // Audit Ledger State with localStorage persistence
  const [auditRecords, setAuditRecords] = useState<AuditedRecommendation[]>(() => {
    try {
      const saved = localStorage.getItem('strata_audit_ledger');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse saved audit ledger:', e);
    }
    return getSampleAuditRecords(symbol);
  });

  const [horizonFilter, setHorizonFilter] = useState<'all' | '1-Week Later' | '3-Day Swing' | '1-Day Scalp'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'WIN' | 'LOSS' | 'PENDING' | 'SCRATCH'>('all');
  const [notification, setNotification] = useState<string | null>(null);

  // Sync to localStorage
  const saveAuditRecords = (records: AuditedRecommendation[]) => {
    setAuditRecords(records);
    try {
      localStorage.setItem('strata_audit_ledger', JSON.stringify(records));
    } catch {}
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Compute aggregate validation statistics
  const stats: AuditAggregateStats = useMemo(() => {
    return calculateAuditStats(auditRecords);
  }, [auditRecords]);

  // Filtered records for table
  const filteredRecords = useMemo(() => {
    return auditRecords.filter((r) => {
      if (horizonFilter !== 'all' && r.evaluationHorizon !== horizonFilter) return false;
      if (outcomeFilter !== 'all' && r.outcome !== outcomeFilter) return false;
      return true;
    });
  }, [auditRecords, horizonFilter, outcomeFilter]);

  // Action: Snapshot active recommendations today into the audit ledger
  const handleSnapshotToday = () => {
    if (recommendations.length === 0) {
      showNotification('No active recommendations currently available to snapshot.');
      return;
    }

    const newSnapshots: AuditedRecommendation[] = [];
    recommendations.slice(0, 3).forEach((rec) => {
      const zone = zones.find((z) => z.id === rec.zoneId);
      const snap = createAuditSnapshotFromRecommendation(
        rec,
        currentPrice,
        volatilityMetrics,
        zone,
        '1-Week Later'
      );
      newSnapshots.push(snap);
    });

    const updated = [...newSnapshots, ...auditRecords];
    saveAuditRecords(updated);
    showNotification(`Captured ${newSnapshots.length} recommended setup(s) into 1-Week Forward Audit Ledger.`);
  };

  // Action: Evaluate audit records against latest candles
  const handleRunEvaluation = () => {
    if (candles.length === 0) {
      showNotification('No candlestick history available to evaluate.');
      return;
    }

    const evaluated = evaluateAuditRecordsAgainstCandles(auditRecords, candles);
    saveAuditRecords(evaluated);
    showNotification('Forward audit evaluated against current price action!');
  };

  // Action: Reset with fresh sample historical data
  const handleResetSampleData = () => {
    const samples = getSampleAuditRecords(symbol);
    saveAuditRecords(samples);
    showNotification('Audit ledger reset with benchmark historical 1-week validation data.');
  };

  // Action: Export Audit Report as CSV
  const handleExportCSV = () => {
    if (auditRecords.length === 0) return;

    const headers = [
      'Date Generated',
      'Horizon',
      'Target Date',
      'Symbol',
      'Signal',
      'Pattern',
      'Underlying Spot',
      'Entry Price',
      'Target 1',
      'Target 2',
      'Stop Loss',
      'Option Contract',
      'Option Entry Prem',
      'Option Peak Prem',
      'Tagged Entry?',
      'Status',
      'Outcome',
      'Gain %',
      'P&L $',
      'R-Multiple',
      'Exit Reason',
    ];

    const rows = auditRecords.map((r) => [
      r.dateGenerated,
      r.evaluationHorizon,
      r.targetHorizonDate,
      r.symbol,
      r.signalType,
      r.pattern,
      r.underlyingSpotAtRec.toFixed(2),
      r.entryPrice.toFixed(2),
      r.takeProfit1Price.toFixed(2),
      r.takeProfit2Price.toFixed(2),
      r.stopLossPrice.toFixed(2),
      r.optionSymbol || 'N/A',
      r.recommendedEntryPremium ? r.recommendedEntryPremium.toFixed(2) : 'N/A',
      r.peakOptionPremiumReached ? r.peakOptionPremiumReached.toFixed(2) : 'N/A',
      r.didPriceTagEntry ? 'YES' : 'NO',
      r.status,
      r.outcome,
      r.realizedGainPct ? `${r.realizedGainPct}%` : '0%',
      r.realizedPnLDollar ? `$${r.realizedPnLDollar}` : '$0',
      r.rMultipleAchieved ? `${r.rMultipleAchieved}R` : '0R',
      `"${(r.exitReason || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `StrataZone_Option_Audit_Report_${symbol}_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0F17] rounded-lg border border-slate-800 overflow-hidden shadow-2xl relative text-slate-200">
      {/* Toast Notification Banner */}
      {notification && (
        <div className="absolute top-3 right-4 z-50 flex items-center gap-2 bg-emerald-950/95 border border-emerald-500 text-emerald-300 text-xs px-3.5 py-2 rounded-lg shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* 1. Header & Validation Verdict Banner */}
      <div className="p-4 sm:p-5 border-b border-slate-800 bg-[#0D131F]/90">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                <ShieldCheck className="w-4.5 h-4.5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white font-display flex items-center gap-2">
                  <span>Recommendation Algorithm Auditor</span>
                  <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                    Forward Paper-Validation
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Track every recommended option play 1 day, 3 days, and 1 week later. Measure win/loss ratios to validate statistical edge before committing real capital.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSnapshotToday}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-950 transition-all cursor-pointer"
              title="Archive current active recommendations and option strikes into the forward audit ledger"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Snapshot Today's Plays</span>
            </button>

            <button
              onClick={handleRunEvaluation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/90 hover:bg-sky-500 text-white text-xs font-medium border border-sky-500/40 transition-all cursor-pointer"
              title="Audit pending plays against the latest price action bars"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Evaluate Plays</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs transition-colors cursor-pointer"
              title="Download full audit ledger as CSV spreadsheet"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Export</span>
            </button>

            <button
              onClick={handleResetSampleData}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer"
              title="Reset ledger to benchmark validation history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Statistical Edge Banner */}
        <div className={`mt-4 p-3.5 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
          stats.edgeConfirmed
            ? 'bg-emerald-950/30 border-emerald-500/40 shadow-sm'
            : 'bg-amber-950/30 border-amber-500/40'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              stats.edgeConfirmed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
            }`}>
              <Trophy className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono font-bold tracking-wider uppercase ${
                  stats.edgeConfirmed ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {stats.edgeConfirmed ? '✓ Algorithm Statistical Edge Confirmed' : '⚠ Forward Validation in Progress'}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-300">
                  Confidence: {stats.edgeConfidenceScore}%
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 max-w-3xl leading-relaxed">
                {stats.edgeVerdictMessage}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto shrink-0 font-mono text-xs">
            <div className="bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800 text-center">
              <div className="text-[10px] text-slate-400 uppercase">1-Wk Win Rate</div>
              <div className="text-emerald-400 font-bold text-sm">{stats.oneWeekWinRate}%</div>
            </div>
            <div className="bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800 text-center">
              <div className="text-[10px] text-slate-400 uppercase">Profit Factor</div>
              <div className="text-sky-400 font-bold text-sm">{stats.profitFactor.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* 2. Key Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-4">
          {/* Win Rate */}
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center justify-between">
              <span>Overall Win Rate</span>
              <Trophy className="w-3 h-3 text-emerald-400" />
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
              {stats.winRatePct}%
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              {stats.wins}W / {stats.losses}L ({stats.scratches} Unfilled)
            </div>
          </div>

          {/* Profit Factor */}
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center justify-between">
              <span>Profit Factor</span>
              <TrendingUp className="w-3 h-3 text-sky-400" />
            </div>
            <div className="text-lg font-bold font-mono text-sky-400 mt-1">
              {stats.profitFactor.toFixed(2)}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              +${stats.grossGainDollars.toLocaleString()} / -${stats.grossLossDollars.toLocaleString()}
            </div>
          </div>

          {/* Net Simulated Return */}
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center justify-between">
              <span>Simulated Net P&amp;L</span>
              <Building2 className="w-3 h-3 text-purple-400" />
            </div>
            <div className={`text-lg font-bold font-mono mt-1 ${stats.netPnLDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.netPnLDollar >= 0 ? '+' : ''}${stats.netPnLDollar.toLocaleString()}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              Avg: +{stats.avgReturnPct}% / play
            </div>
          </div>

          {/* Average R-Multiple */}
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center justify-between">
              <span>Average R-Multiple</span>
              <Sparkles className="w-3 h-3 text-amber-400" />
            </div>
            <div className="text-lg font-bold font-mono text-amber-400 mt-1">
              +{stats.avgRMultiple}R
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              Target R:R ≥ 1:2.0
            </div>
          </div>

          {/* Wholesale Trigger Rate */}
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center justify-between">
              <span>Wholesale Trigger</span>
              <Clock className="w-3 h-3 text-sky-400" />
            </div>
            <div className="text-lg font-bold font-mono text-slate-200 mt-1">
              {stats.triggerRatePct}%
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              {stats.triggeredCount} of {stats.totalAudited} Tagged Limit
            </div>
          </div>

          {/* Pending Plays */}
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center justify-between">
              <span>In-Flight / Pending</span>
              <Calendar className="w-3 h-3 text-indigo-400" />
            </div>
            <div className="text-lg font-bold font-mono text-indigo-300 mt-1">
              {stats.pendingCount}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              1-Wk Horizon Active
            </div>
          </div>
        </div>
      </div>

      {/* 3. Filter Bar & Horizon Switcher */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B0F17] gap-3 text-xs">
        {/* Horizon Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
          <span className="text-slate-400 text-[11px] px-2 font-mono">Horizon:</span>
          <button
            onClick={() => setHorizonFilter('all')}
            className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
              horizonFilter === 'all' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({auditRecords.length})
          </button>
          <button
            onClick={() => setHorizonFilter('1-Week Later')}
            className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer flex items-center gap-1 ${
              horizonFilter === '1-Week Later' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>1-Week Later</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-purple-950 border border-purple-400/30 text-purple-200">
              {auditRecords.filter(r => r.evaluationHorizon === '1-Week Later').length}
            </span>
          </button>
          <button
            onClick={() => setHorizonFilter('3-Day Swing')}
            className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
              horizonFilter === '3-Day Swing' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3-Day Swing
          </button>
        </div>

        {/* Outcome Filter */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
          <span className="text-slate-400 text-[11px] px-2 font-mono">Outcome:</span>
          {(['all', 'WIN', 'LOSS', 'PENDING', 'SCRATCH'] as const).map((out) => (
            <button
              key={out}
              onClick={() => setOutcomeFilter(out)}
              className={`px-2 py-1 rounded font-mono text-[11px] font-medium transition-colors cursor-pointer ${
                outcomeFilter === out
                  ? out === 'WIN' ? 'bg-emerald-600 text-white font-bold' : out === 'LOSS' ? 'bg-rose-600 text-white font-bold' : 'bg-slate-800 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {out}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Audit Ledger Table */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/70 text-slate-400 font-mono text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
              <th className="py-3 px-4">Date &amp; Horizon</th>
              <th className="py-3 px-4">Setup / Option Play</th>
              <th className="py-3 px-4 text-right">Wholesale Limit vs Spot</th>
              <th className="py-3 px-4 text-center">Wholesale Tagged?</th>
              <th className="py-3 px-4 text-right">Option Peak Achieved</th>
              <th className="py-3 px-4 text-center">1-Wk Outcome</th>
              <th className="py-3 px-4 text-right">Return / P&amp;L</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  <ShieldCheck className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-sans font-medium text-slate-400">No audit records match the selected filter</p>
                  <p className="text-xs text-slate-500 mt-1 font-sans">
                    Click "Snapshot Today's Plays" above to start tracking current recommendations!
                  </p>
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => {
                const isWin = record.outcome === 'WIN';
                const isLoss = record.outcome === 'LOSS';
                const isPending = record.outcome === 'PENDING';
                const isScratch = record.outcome === 'SCRATCH';

                return (
                  <tr key={record.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Date & Horizon */}
                    <td className="py-3.5 px-4 font-sans">
                      <div className="flex items-center gap-1.5 font-mono text-white font-bold text-xs">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{record.dateGenerated}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex items-center gap-1">
                        <span className="px-1.5 py-0.2 rounded bg-purple-950/60 border border-purple-500/30 text-purple-300 text-[10px]">
                          {record.evaluationHorizon}
                        </span>
                        <span>→ {record.targetHorizonDate}</span>
                      </div>
                    </td>

                    {/* Setup / Option Play */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className={record.side === 'long' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {record.symbol} {record.side === 'long' ? 'CALL' : 'PUT'}
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px]">
                          {record.pattern}
                        </span>
                        {record.isActiveZoneAtRec ? (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                            Active Primary
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-400 text-[10px]">
                            Reference
                          </span>
                        )}
                      </div>

                      {record.hasOptionPlay && record.optionSymbol ? (
                        <div className="text-xs font-mono text-sky-300 mt-1 font-semibold">
                          {record.optionStrike} {record.optionType} ({record.optionExpiration}) · {record.contracts}x
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 mt-1 font-mono">
                          Outright {record.symbol} Contract
                        </div>
                      )}
                    </td>

                    {/* Wholesale Limit vs Spot */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="text-white font-bold">
                        ${record.entryPrice.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Spot at rec: ${record.underlyingSpotAtRec.toFixed(2)}
                      </div>
                    </td>

                    {/* Wholesale Tagged? */}
                    <td className="py-3.5 px-4 text-center">
                      {record.didPriceTagEntry ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Tagged ({record.entryFillDate})</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[10px]">
                          <span>Unfilled</span>
                        </div>
                      )}
                    </td>

                    {/* Option Peak Achieved */}
                    <td className="py-3.5 px-4 text-right">
                      {record.recommendedEntryPremium ? (
                        <>
                          <div className="text-white font-semibold">
                            {record.peakOptionPremiumReached
                              ? `$${record.peakOptionPremiumReached.toFixed(2)}`
                              : `$${record.recommendedEntryPremium.toFixed(2)}`}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Entry: ${record.recommendedEntryPremium.toFixed(2)} (TP: ${record.recommendedTarget1Premium?.toFixed(2)})
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Outcome Badge */}
                    <td className="py-3.5 px-4 text-center">
                      {isWin && (
                        <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/50 text-[11px] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>WIN</span>
                        </span>
                      )}
                      {isLoss && (
                        <span className="px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-300 font-bold border border-rose-500/50 text-[11px] inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-rose-400" />
                          <span>LOSS</span>
                        </span>
                      )}
                      {isPending && (
                        <span className="px-2.5 py-1 rounded-md bg-sky-500/20 text-sky-300 font-bold border border-sky-500/50 text-[11px] inline-flex items-center gap-1 animate-pulse">
                          <Clock className="w-3 h-3 text-sky-400" />
                          <span>PENDING</span>
                        </span>
                      )}
                      {isScratch && (
                        <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 font-bold text-[11px]">
                          UNFILLED
                        </span>
                      )}
                    </td>

                    {/* Return / P&L */}
                    <td className="py-3.5 px-4 text-right">
                      {isWin ? (
                        <div>
                          <div className="text-emerald-400 font-bold">
                            +${record.realizedPnLDollar?.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-emerald-500 font-semibold">
                            +{record.realizedGainPct}% ({record.rMultipleAchieved}R)
                          </div>
                        </div>
                      ) : isLoss ? (
                        <div>
                          <div className="text-rose-400 font-bold">
                            -${Math.abs(record.realizedPnLDollar || 0).toLocaleString()}
                          </div>
                          <div className="text-[10px] text-rose-500 font-semibold">
                            {record.realizedGainPct}% (-1.0R)
                          </div>
                        </div>
                      ) : isPending ? (
                        <div className="text-sky-300 font-semibold">
                          +{record.realizedGainPct}%
                          <div className="text-[10px] text-slate-400">Tracking...</div>
                        </div>
                      ) : (
                        <span className="text-slate-500">$0.00</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => onInspectOnChart(record.symbol)}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-sky-300 transition-colors cursor-pointer"
                        title="Inspect on candlestick chart"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Footer Methodology Note */}
      <div className="p-3 bg-[#0D131F] border-t border-slate-800 flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono gap-2">
        <div className="flex items-center gap-1.5 text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
          <span>Evaluation Horizon: 1-Week Walk Forward · Zero Lookahead Bias · Defined-Risk Cushion Validated</span>
        </div>
        <div className="text-slate-500">
          Audited Records: <strong className="text-slate-300">{stats.totalAudited}</strong> · Evaluated: <strong className="text-emerald-400">{stats.evaluatedCount}</strong>
        </div>
      </div>
    </div>
  );
};
