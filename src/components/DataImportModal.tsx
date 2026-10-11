import React, { useState } from 'react';
import { parseCandleCSV } from '../utils/marketData';
import { parseSchwabOptionsCSV, convertOptionHistoryToCandles } from '../utils/schwabOptionsParser';
import { Candle, SchwabOptionTrade, SchwabOptionPerformance } from '../types/trading';
import { 
  X, 
  Upload, 
  FileText, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  ExternalLink,
  Sparkles,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Building2,
  FileSpreadsheet,
  Layers
} from 'lucide-react';

interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportData: (candles: Candle[], symbolName: string) => void;
}

// Sample Datasets
const REAL_EQUITY_SPY_CSV = `Date,Open,High,Low,Close,Adj Close,Volume
2026-01-05,532.10,536.40,531.05,535.80,535.80,42100000
2026-01-06,535.90,538.25,534.10,537.15,537.15,38900000
2026-01-07,536.80,537.90,532.50,533.20,533.20,45300000
2026-01-08,532.80,534.50,528.90,529.40,529.40,56200000
2026-01-09,529.10,531.80,527.20,530.90,530.90,48700000
2026-01-12,531.50,535.70,530.80,535.20,535.20,39400000
2026-01-13,535.40,541.20,534.80,540.60,540.60,52100000
2026-01-14,541.10,544.80,540.20,543.90,543.90,51800000
2026-01-15,543.50,545.10,541.70,542.80,542.80,44200000
2026-01-16,542.40,543.60,538.10,539.00,539.00,49800000
2026-01-20,539.80,542.40,538.50,541.30,541.30,41200000
2026-01-21,541.70,546.50,541.20,545.80,545.80,47600000
2026-01-22,546.20,549.90,545.40,549.10,549.10,53100000
2026-01-23,549.50,551.40,547.00,548.20,548.20,46900000
2026-01-26,547.80,549.00,543.20,544.10,544.10,48300000
2026-01-27,544.60,548.10,543.90,547.50,547.50,42700000
2026-01-28,548.00,552.30,547.20,551.80,551.80,55400000
2026-01-29,552.10,555.60,551.40,554.90,554.90,58200000
2026-01-30,554.20,555.10,549.80,550.40,550.40,61200000
2026-02-02,551.00,553.80,549.20,552.70,552.70,44500000`;

const REAL_SCHWAB_OPTION_TRADES_CSV = `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"02/09/2026","Buy to Open","SPY 260220C00540000","CALL SPDR S&P 500 ETF EXP 02/20/26 $540","5","$3.40","$3.25","-$1703.25"
"02/12/2026","Sell to Close","SPY 260220C00540000","CALL SPDR S&P 500 ETF EXP 02/20/26 $540","-5","$5.25","$3.25","$2621.75"
"02/13/2026","Buy to Open","QQQ 260227P00460000","PUT INVESCO QQQ TRUST EXP 02/27/26 $460","10","$2.80","$6.50","-$2806.50"
"02/18/2026","Sell to Close","QQQ 260227P00460000","PUT INVESCO QQQ TRUST EXP 02/27/26 $460","-10","$4.10","$6.50","$4093.50"
"02/19/2026","Sell to Open","NVDA 260306P00120000","PUT NVIDIA CORP EXP 03/06/26 $120","4","$2.10","$2.60","$837.40"
"02/26/2026","Buy to Close","NVDA 260306P00120000","PUT NVIDIA CORP EXP 03/06/26 $120","-4","$0.55","$2.60","-$222.60"
"02/27/2026","Buy to Open","AAPL 260313C00230000","CALL APPLE INC EXP 03/13/26 $230","6","$4.20","$3.90","-$2523.90"
"03/04/2026","Sell to Close","AAPL 260313C00230000","CALL APPLE INC EXP 03/13/26 $230","-6","$6.40","$3.90","$3836.10"`;

const REAL_SCHWAB_OPTION_BARS_CSV = `Date,Time,Open,High,Low,Close,Volume,Open Interest
2026-02-10,09:30,3.15,3.65,3.05,3.40,4820,12400
2026-02-10,10:30,3.40,3.95,3.35,3.85,6180,12850
2026-02-10,11:30,3.85,4.20,3.75,4.10,3900,13200
2026-02-10,12:30,4.10,4.45,4.00,4.35,3100,13450
2026-02-10,13:30,4.35,4.80,4.25,4.70,5200,13900
2026-02-10,14:30,4.70,5.10,4.60,4.95,4900,14300
2026-02-10,15:30,4.95,5.35,4.90,5.25,7800,15100
2026-02-11,09:30,5.25,5.60,5.10,5.45,5100,15800
2026-02-11,10:30,5.45,5.85,5.35,5.75,4400,16200
2026-02-11,11:30,5.75,6.10,5.65,5.90,3200,16500
2026-02-11,12:30,5.90,6.05,5.50,5.60,2900,16400
2026-02-11,13:30,5.60,5.75,5.20,5.30,3800,16250
2026-02-11,14:30,5.30,5.55,5.15,5.40,4100,16300
2026-02-11,15:30,5.40,5.50,5.10,5.25,6200,16500`;

const REAL_BINANCE_BTC_CSV = `open_time,open,high,low,close,volume
2026-02-10 00:00,64280.50,64820.00,64150.00,64750.20,1842
2026-02-10 01:00,64750.20,65120.00,64600.00,64980.00,2105
2026-02-10 02:00,64980.00,65450.00,64890.00,65390.10,2480
2026-02-10 03:00,65390.10,65500.00,64200.00,64310.00,4120
2026-02-10 04:00,64310.00,64450.00,63780.00,63890.50,3850
2026-02-10 05:00,63890.50,64120.00,63690.00,64080.00,1920
2026-02-10 06:00,64080.00,64920.00,64010.00,64850.00,3640
2026-02-10 07:00,64850.00,65880.00,64780.00,65790.00,4910
2026-02-10 08:00,65790.00,66350.00,65650.00,66240.00,4320
2026-02-10 09:00,66240.00,66490.00,65980.00,66110.00,2850
2026-02-10 10:00,66110.00,66250.00,65540.00,65680.00,3140
2026-02-10 11:00,65680.00,65850.00,65320.00,65490.00,2290
2026-02-10 12:00,65490.00,66100.00,65420.00,66050.00,2980
2026-02-10 13:00,66050.00,66920.00,65980.00,66850.00,5120
2026-02-10 14:00,66850.00,67400.00,66710.00,67320.00,5410`;

export const DataImportModal: React.FC<DataImportModalProps> = ({
  isOpen,
  onClose,
  onImportData,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'guide'>('import');
  const [symbolName, setSymbolName] = useState<string>('SCHWAB:SPY_540C');
  const [csvContent, setCsvContent] = useState<string>(REAL_SCHWAB_OPTION_BARS_CSV);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Schwab Option Trades parsed state
  const [parsedOptionsResult, setParsedOptionsResult] = useState<{
    trades: SchwabOptionTrade[];
    performance: SchwabOptionPerformance;
  } | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      setSymbolName(file.name.replace(/\.[^/.]+$/, '').toUpperCase());
      setError(null);
      detectAndPreviewContent(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      setSymbolName(file.name.replace(/\.[^/.]+$/, '').toUpperCase());
      setError(null);
      detectAndPreviewContent(text);
    };
    reader.readAsText(file);
  };

  const detectAndPreviewContent = (text: string) => {
    const header = text.split('\n')[0].toLowerCase();
    const isOptionsActivity = 
      header.includes('action') || 
      text.includes('Buy to Open') || 
      text.includes('Sell to Close') || 
      text.includes('TO OPEN') ||
      text.includes('CALL') ||
      text.includes('PUT');

    if (isOptionsActivity && (header.includes('action') || header.includes('side') || header.includes('symbol'))) {
      try {
        const result = parseSchwabOptionsCSV(text);
        if (result.trades.length > 0) {
          setParsedOptionsResult(result);
          return;
        }
      } catch {
        // Not a trade log, fallback to candlestick
      }
    }
    setParsedOptionsResult(null);
  };

  const handleLoadSample = (type: 'spy' | 'schwab_options' | 'schwab_bars' | 'btc') => {
    setError(null);
    if (type === 'spy') {
      setSymbolName('SPY (Daily Bars)');
      setCsvContent(REAL_EQUITY_SPY_CSV);
      setParsedOptionsResult(null);
    } else if (type === 'schwab_options') {
      setSymbolName('SCHWAB:OPTION_ACTIVITY');
      setCsvContent(REAL_SCHWAB_OPTION_TRADES_CSV);
      detectAndPreviewContent(REAL_SCHWAB_OPTION_TRADES_CSV);
    } else if (type === 'schwab_bars') {
      setSymbolName('SCHWAB:SPY_540C');
      setCsvContent(REAL_SCHWAB_OPTION_BARS_CSV);
      setParsedOptionsResult(null);
    } else if (type === 'btc') {
      setSymbolName('BTC/USDT (Binance 1H)');
      setCsvContent(REAL_BINANCE_BTC_CSV);
      setParsedOptionsResult(null);
    }
  };

  const handleProcessImport = () => {
    try {
      setError(null);

      // Check if it's an option activity CSV
      if (parsedOptionsResult && parsedOptionsResult.trades.length > 0) {
        // Synthesize option contract price trajectory with real order entry/exit levels
        const candles = convertOptionHistoryToCandles(parsedOptionsResult.trades);
        const underlying = parsedOptionsResult.trades[0]?.underlying || 'SPY';
        onImportData(candles, `SCHWAB:${underlying}_OPT_DECK`);
        onClose();
        return;
      }

      // Check if user pasted option trades directly without preview trigger
      const header = csvContent.split('\n')[0].toLowerCase();
      if (header.includes('action') && (csvContent.includes('Buy to Open') || csvContent.includes('Sell to Close'))) {
        const optResult = parseSchwabOptionsCSV(csvContent);
        if (optResult.trades.length > 0) {
          const candles = convertOptionHistoryToCandles(optResult.trades);
          const underlying = optResult.trades[0]?.underlying || 'SPY';
          onImportData(candles, `SCHWAB:${underlying}_OPT_DECK`);
          onClose();
          return;
        }
      }

      // Standard Candlestick CSV
      const parsedCandles = parseCandleCSV(csvContent);
      onImportData(parsedCandles, symbolName);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to parse CSV file');
    }
  };

  const handleExportOptionAuditReport = () => {
    if (!parsedOptionsResult) return;
    const headers = ['Date', 'Underlying', 'Option Symbol', 'Type', 'Strike', 'Expiration', 'Action', 'Contracts', 'Entry Price', 'Exit Price', 'Realized PnL ($)', 'ROI %'];
    const rows = parsedOptionsResult.trades.map((t) => [
      t.date,
      t.underlying,
      `"${t.optionSymbol}"`,
      t.type,
      t.strike,
      t.expiration,
      `"${t.action}"`,
      t.contracts,
      t.entryPrice,
      t.exitPrice || '',
      t.realizedPnL !== undefined ? t.realizedPnL : '',
      t.roiPercent !== undefined ? `${t.roiPercent}%` : '',
    ]);

    const csvStr = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Schwab_Option_Trade_Audit_${new Date().toISOString().substring(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#0B0F17] border border-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0F172A]/70">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-display">Real Market & Schwab Option Trade Import</h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Import CSVs from Charles Schwab (Options & Equities), thinkorswim, TradingView, or Binance
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

        {/* Tab Switcher */}
        <div className="flex items-center border-b border-slate-800 bg-slate-900/60 px-6 text-xs font-mono">
          <button
            onClick={() => setActiveTab('import')}
            className={`py-2.5 px-3 border-b-2 font-medium transition-colors ${
              activeTab === 'import'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Import / Paste CSV Data
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-2.5 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'guide'
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>2. Schwab Option & Stock Export Guide</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 font-sans text-xs text-slate-300 space-y-4">
          {activeTab === 'import' ? (
            <>
              {/* Preset Loaders */}
              <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Quick Load Real Market Samples:</span>
                  </span>
                  <span className="text-[11px] text-slate-500">Includes Schwab Options</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => handleLoadSample('schwab_options')}
                    className="px-2.5 py-1.5 rounded bg-sky-950/80 hover:bg-sky-900/90 text-sky-300 border border-sky-700/80 transition-colors flex items-center gap-1 font-semibold"
                  >
                    <Building2 className="w-3 h-3 text-sky-400" />
                    <span>Schwab Option Trades CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('schwab_bars')}
                    className="px-2.5 py-1.5 rounded bg-sky-950/40 hover:bg-sky-900/60 text-sky-300 border border-sky-800 transition-colors"
                  >
                    Schwab SPY 540C Bars
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('spy')}
                    className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    SPY (Daily Bars)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('btc')}
                    className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    Binance (BTC 1H)
                  </button>
                </div>
              </div>

              {/* Schwab Option Trade Report Preview if detected */}
              {parsedOptionsResult && (
                <div className="p-4 rounded-xl bg-slate-900 border border-sky-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-sky-500/20 text-sky-400">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-white font-mono font-bold text-xs flex items-center gap-2">
                          <span>Charles Schwab Option Trades Detected</span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px]">
                            {parsedOptionsResult.performance.closedTrades} Round Trips Matched
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Auto-extracted strikes, expirations, call/put legs & commissions
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleExportOptionAuditReport}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-mono flex items-center gap-1.5 transition-colors"
                      title="Download parsed round trip ledger"
                    >
                      <Download className="w-3 h-3" />
                      <span>Export Audit</span>
                    </button>
                  </div>

                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Net Realized P&L</div>
                      <div className={`font-bold text-sm ${parsedOptionsResult.performance.totalNetPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {parsedOptionsResult.performance.totalNetPnL >= 0 ? '+' : ''}${parsedOptionsResult.performance.totalNetPnL.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Win Rate %</div>
                      <div className="font-bold text-sm text-white">
                        {parsedOptionsResult.performance.winRate}% ({parsedOptionsResult.performance.winningTrades}W / {parsedOptionsResult.performance.losingTrades}L)
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Profit Factor</div>
                      <div className="font-bold text-sm text-sky-400">
                        {parsedOptionsResult.performance.profitFactor}x
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <div className="text-slate-500">Avg Return / Trade</div>
                      <div className="font-bold text-sm text-slate-200">
                        ${parsedOptionsResult.performance.avgWin.toFixed(0)} avg win
                      </div>
                    </div>
                  </div>

                  {/* Options Contract Leg Preview */}
                  <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-left font-mono text-[10px]">
                      <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                        <tr>
                          <th className="p-1.5">Date</th>
                          <th className="p-1.5">Contract</th>
                          <th className="p-1.5">Action</th>
                          <th className="p-1.5 text-right">Entry</th>
                          <th className="p-1.5 text-right">Exit</th>
                          <th className="p-1.5 text-right">Realized PnL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {parsedOptionsResult.trades.slice(0, 8).map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40">
                            <td className="p-1.5 text-slate-400">{t.date}</td>
                            <td className="p-1.5 text-white font-bold">
                              {t.underlying} ${t.strike} {t.type}
                            </td>
                            <td className="p-1.5">
                              <span className={`px-1 py-0.2 rounded text-[9px] ${
                                t.action.includes('Buy') ? 'bg-emerald-950 text-emerald-300' : 'bg-sky-950 text-sky-300'
                              }`}>
                                {t.action}
                              </span>
                            </td>
                            <td className="p-1.5 text-right">${t.entryPrice.toFixed(2)}</td>
                            <td className="p-1.5 text-right">{t.exitPrice ? `$${t.exitPrice.toFixed(2)}` : 'Open'}</td>
                            <td className={`p-1.5 text-right font-bold ${
                              (t.realizedPnL || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {t.realizedPnL !== undefined ? `${t.realizedPnL >= 0 ? '+' : ''}$${t.realizedPnL}` : '--'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Asset Name & Drag-and-Drop */}
              <div className="space-y-1.5">
                <label className="text-slate-400 font-mono text-xs">Symbol Name for Terminal</label>
                <input
                  type="text"
                  value={symbolName}
                  onChange={(e) => setSymbolName(e.target.value)}
                  placeholder="e.g. SCHWAB:SPY_OPTIONS, SPY, NVDA"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Drag Drop Box */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                  isDragOver ? 'border-emerald-500 bg-emerald-950/20' : 'border-slate-800 hover:border-slate-700 bg-slate-900/30'
                }`}
              >
                <Upload className="w-5 h-5 mx-auto text-slate-400 mb-1" />
                <div className="text-xs font-mono text-slate-300">
                  Drag and drop any <span className="text-emerald-400 font-bold">Charles Schwab CSV</span> or candlestick file here, or{' '}
                  <label className="text-sky-400 hover:underline cursor-pointer">
                    browse files
                    <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-1">
                  Supports Schwab Account Activity Options, thinkorswim Trade History, TradingView, and Binance
                </div>
              </div>

              {/* Raw CSV Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 font-mono text-xs">CSV Text (or paste directly)</label>
                  <button
                    type="button"
                    onClick={() => { setCsvContent(''); setParsedOptionsResult(null); }}
                    className="text-slate-500 hover:text-slate-300 font-mono text-[11px]"
                  >
                    Clear
                  </button>
                </div>
                <textarea
                  value={csvContent}
                  onChange={(e) => {
                    setCsvContent(e.target.value);
                    detectAndPreviewContent(e.target.value);
                  }}
                  rows={5}
                  placeholder={`"Date","Action","Symbol","Description","Quantity","Price","Amount"...`}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            /* Tab 2: Step-by-Step Guide on How to Export Schwab Options & Stocks */
            <div className="space-y-4">
              <div className="text-xs text-slate-300 leading-relaxed">
                Step-by-step instructions for exporting Charles Schwab options and stock data into StrataZone:
              </div>

              {/* Schwab Options Export Guide */}
              <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-display flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                    How to Export Options Trade History from Schwab.com
                  </span>
                  <span className="text-[11px] font-mono text-sky-400">Account Activity CSV</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300 leading-relaxed font-sans pl-1">
                  <li>Log in to <strong className="text-white">schwab.com</strong>.</li>
                  <li>Go to <strong className="text-white">Accounts &rarr; History</strong> (or Transaction History).</li>
                  <li>Set the filter dropdown to <strong className="text-sky-300 font-semibold">Options</strong> (or All Transactions).</li>
                  <li>Select your date range (e.g. Previous 30, 60, or 90 Days).</li>
                  <li>Click the <strong className="text-emerald-400 font-bold">Export</strong> link in the upper-right corner of the table.</li>
                  <li>Choose <strong className="text-white">CSV format</strong>.</li>
                  <li>Drag the downloaded file into this modal — StrataZone will automatically pair your Buy to Open and Sell to Close legs, calculate exact P&L, and chart the contract!</li>
                </ol>
              </div>

              {/* thinkorswim Options Export */}
              <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-display flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    How to Export Options from thinkorswim (TOS)
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400">Trade History CSV</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300 leading-relaxed font-sans pl-1">
                  <li>In thinkorswim desktop, click the <strong className="text-white">Monitor</strong> tab.</li>
                  <li>Select <strong className="text-white">Account Activity &rarr; Trade History</strong>.</li>
                  <li>Click the menu icon in the upper-right corner of the table and choose <strong className="text-sky-300 font-semibold">Export to CSV...</strong></li>
                  <li>Upload the file here to analyze your option win rates and zone executions.</li>
                </ol>
              </div>

              {/* Option Candlestick Charting */}
              <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-display flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    How to Export Option Contract Price Bars (Candlesticks)
                  </span>
                  <span className="text-[11px] font-mono text-amber-400">Chart Bars</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300 leading-relaxed font-sans pl-1">
                  <li>In thinkorswim Charts, type in the option symbol (e.g. <code className="text-sky-300 bg-slate-950 px-1 py-0.5 rounded">.SPY260220C540</code>).</li>
                  <li>Right click chart &rarr; <strong className="text-white">Export to CSV</strong>.</li>
                  <li>Import it here to detect Supply & Demand zones on option premiums!</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          {activeTab === 'guide' ? (
            <button
              onClick={() => setActiveTab('import')}
              className="text-emerald-400 hover:underline text-xs font-mono flex items-center gap-1"
            >
              <span>Back to Import Screen</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="text-[11px] text-slate-500 font-mono">
              {parsedOptionsResult
                ? `Mapped ${parsedOptionsResult.trades.length} option trade legs with FIFO P&L`
                : 'Ready to detect Supply & Demand zones and calculate volatility'}
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleProcessImport}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium text-xs font-mono flex items-center gap-1.5 shadow-sm"
            >
              <span>Analyze & Map Zones</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
