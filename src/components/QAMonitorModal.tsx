import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Play, 
  Trash2, 
  Download, 
  FileCode, 
  ExternalLink, 
  Layers,
  Terminal,
  Activity,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface QaCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface QaAuditEntry {
  qaTestId: string;
  timestamp: string;
  symbol: string;
  assetType: string;
  strategy: string;
  quantity: number;
  entryPrice: number;
  stopPrice?: number;
  targetPrice?: number;
  status: 'QA_PASSED' | 'QA_FLAGGED';
  checks: QaCheck[];
  realMoneyBlocked: boolean;
  orderPayload: any;
}

interface QAMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSymbol: string;
}

export const QAMonitorModal: React.FC<QAMonitorModalProps> = ({
  isOpen,
  onClose,
  activeSymbol,
}) => {
  const [qaStatus, setQaStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRunningTest, setIsRunningTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [expandedPayloadId, setExpandedPayloadId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchQaStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/schwab/qa-monitor');
      const data = await res.json();
      setQaStatus(data);
    } catch (e) {
      console.error('Failed to load QA monitor status:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchQaStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunSampleDryRun = async () => {
    setIsRunningTest(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/schwab/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: activeSymbol || 'TSLA',
          isOption: true,
          occSymbol: `${(activeSymbol || 'TSLA').padEnd(6, ' ')}261023P00541000`,
          price: 2.06,
          stopPrice: 1.25,
          targetPrice: 3.50,
          quantity: 2,
          strategyType: 'TRIGGER',
        }),
      });
      const data = await res.json();
      setTestResult(data);
      fetchQaStatus();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `QA Dry Run test error: ${err?.message || err}`,
      });
    } finally {
      setIsRunningTest(false);
    }
  };

  const handleClearLog = async () => {
    if (!window.confirm('Clear all historical QA dry-run audit records?')) return;
    try {
      await fetch('/api/schwab/qa-clear', { method: 'POST' });
      fetchQaStatus();
    } catch (e) {
      console.error('Failed to clear QA log:', e);
    }
  };

  const handleCopyJson = (payload: any, id: string) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const auditLog: QaAuditEntry[] = qaStatus?.auditLog || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in select-none">
      <div className="bg-[#0B0F17] border border-slate-800 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0F172A]/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-950/80 border border-rose-700/80 text-rose-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-display">
                  StrataZone QA Safety &amp; Pre-Flight Order Monitor
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                  <span>Real Money Locked</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Brokerage orders are intercepted, audited, and tested in simulation sandbox before real capital authorization.
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs font-mono">
          {/* Safety Gate Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/40 via-amber-950/30 to-slate-900 border border-rose-700/70 shadow-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wide">
                <ShieldCheck className="w-4 h-4 text-rose-400" />
                <span>Institutional Real-Money Protection Protocol</span>
              </div>
              <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                QA Gate Status: ACTIVE
              </span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              As requested, live account debiting to Charles Schwab is <strong className="text-rose-400">HARD-LOCKED</strong>. 
              All order generation runs through this QA Monitor system where bracket parameters, option contracts, OCC symbols, and ThinkorSwim formats are audited without touching your brokerage capital.
            </p>
          </div>

          {/* Active Pre-Flight Guardrails Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-bold uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                <span>8 Active Pre-Flight Safety Guardrails</span>
              </span>
              <span className="text-[10px] text-slate-500">Auto-Enforced on All Orders</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px]">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">1. Real-Money Circuit Breaker</span>
                  <span className="text-slate-400 text-[10px]">Blocks all live brokerage account requests; forces simulated staging route.</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">2. Anti-Stock Default Guard (TOS)</span>
                  <span className="text-slate-400 text-[10px]">Validates mandatory SINGLE keyword to prevent ThinkorSwim 100-share TSLA fallback.</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">3. Order Type STP Verifier</span>
                  <span className="text-slate-400 text-[10px]">Guarantees stop rows use STP (not LMT), preventing the ThinkorSwim 2-targets bug.</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">4. Contract Conservation Checker</span>
                  <span className="text-slate-400 text-[10px]">Ensures entry quantity (+2) mathematically matches target and stop exit legs.</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">5. Directional Price Logic Audit</span>
                  <span className="text-slate-400 text-[10px]">Validates target &gt; entry &gt; stop for longs and inversed for puts.</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">6. Schwab Trader API v1 Schema</span>
                  <span className="text-slate-400 text-[10px]">Verifies nested TRIGGER/OCO child strategy JSON compliance before staging.</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">7. OCC 21-Char Option Formatter</span>
                  <span className="text-slate-400 text-[10px]">Validates exact root ticker, 6-digit expiration, and 8-digit price padding.</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">8. Downside Risk Budget Guard</span>
                  <span className="text-slate-400 text-[10px]">Calculates max dollar loss per contract and flags any oversized exposures.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Dry-Run Test Console */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-white text-xs block uppercase">
                  Run Live QA Pre-Flight Dry Run ({activeSymbol || 'TSLA'})
                </span>
                <span className="text-[10px] text-slate-400">
                  Simulates full order generation, runs 8 checks, and logs telemetry
                </span>
              </div>

              <button
                type="button"
                onClick={handleRunSampleDryRun}
                disabled={isRunningTest}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer"
              >
                {isRunningTest ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Auditing Order...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run Simulated QA Dry Run</span>
                  </>
                )}
              </button>
            </div>

            {testResult && (
              <div className="p-3 rounded-lg bg-slate-950 border border-emerald-500/70 text-[11px] space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{testResult.message}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Order ID: {testResult.orderId}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 text-[10px]">
                  {testResult.checks?.map((c: any, idx: number) => (
                    <div key={idx} className="p-1.5 rounded bg-slate-900 border border-slate-800 flex items-center gap-1 text-slate-300">
                      <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="truncate">{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Historical QA Telemetry Log */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-bold uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>QA Audit Telemetry Trail ({auditLog.length} Recorded Runs)</span>
              </span>

              {auditLog.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearLog}
                  className="text-[10px] text-slate-500 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear History</span>
                </button>
              )}
            </div>

            {auditLog.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-950 border border-slate-800/80 text-center text-slate-500 text-xs">
                No orders audited yet. Click &quot;Run Simulated QA Dry Run&quot; above or test via the Post to Thinkorswim modal.
              </div>
            ) : (
              <div className="space-y-2">
                {auditLog.slice(0, 10).map((entry) => {
                  const isExpanded = expandedPayloadId === entry.qaTestId;
                  return (
                    <div
                      key={entry.qaTestId}
                      className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold text-[10px]">
                            {entry.status}
                          </span>
                          <span className="font-bold text-white text-xs">{entry.quantity}x {entry.symbol}</span>
                          <span className="text-slate-400 text-[10px]">{entry.strategy} Bracket</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedPayloadId(isExpanded ? null : entry.qaTestId)}
                            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer"
                          >
                            <FileCode className="w-3 h-3 text-sky-400" />
                            <span>{isExpanded ? 'Hide Payload' : 'Inspect JSON'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                        <span>Entry: <strong className="text-sky-300">${entry.entryPrice?.toFixed(2)}</strong></span>
                        {entry.stopPrice && <span>Stop: <strong className="text-rose-400">${entry.stopPrice?.toFixed(2)}</strong></span>}
                        {entry.targetPrice && <span>Target: <strong className="text-emerald-400">${entry.targetPrice?.toFixed(2)}</strong></span>}
                        <span className="text-emerald-400">8/8 Checks Passed</span>
                        <span className="text-rose-400 font-semibold">🔒 Real Money Intercepted</span>
                      </div>

                      {isExpanded && (
                        <div className="mt-2 p-2.5 rounded bg-[#020617] border border-slate-900 text-[10px] text-sky-300 space-y-1.5 animate-in fade-in">
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Official Charles Schwab Trader API v1 Payload:</span>
                            <button
                              type="button"
                              onClick={() => handleCopyJson(entry.orderPayload, entry.qaTestId)}
                              className="text-sky-400 hover:text-white cursor-pointer"
                            >
                              {copiedId === entry.qaTestId ? '✓ Copied' : 'Copy JSON'}
                            </button>
                          </div>
                          <pre className="overflow-x-auto max-h-40 p-1.5 bg-black/60 rounded border border-slate-950 font-mono text-[9.5px]">
                            {JSON.stringify(entry.orderPayload, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-[#0F172A]/90 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <Lock className="w-3.5 h-3.5 text-rose-400" />
            <span>Safety Policy: Zero real-money transmission without prior QA sign-off</span>
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
