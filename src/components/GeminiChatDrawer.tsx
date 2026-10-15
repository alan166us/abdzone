import React, { useState, useRef, useEffect } from 'react';
import { SupplyDemandZone, VolatilityMetrics, TradeRecommendation } from '../types/trading';
import { 
  X, 
  Send, 
  Sparkles, 
  Bot, 
  User, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
  ShieldCheck, 
  Target, 
  SlidersHorizontal, 
  DollarSign, 
  Copy, 
  Check, 
  TrendingUp, 
  AlertCircle,
  HelpCircle,
  Flame
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

interface GeminiChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  currentPrice: number;
  timeframe?: string;
  zones: SupplyDemandZone[];
  volatilityMetrics: VolatilityMetrics;
  recommendations: TradeRecommendation[];
  initialMessage?: string;
  initialRole?: 'daily_coach' | 'quant' | 'risk_architect' | 'fast_scalp';
}

const INITIAL_PROMPTS = [
  '🎯 What is our game plan on this chart right now?',
  '🛑 Why wait for wholesale instead of buying here?',
  '🛡️ Why does the ATR cushion protect against stop hunts?',
  '💰 Which credit spread gives us high-probability cashflow?',
  '⚠️ What price action invalidates our thesis?',
  '☕ Should we just sit on our hands right now?',
  '🏁 Walk me through the 50% profit take rule',
  '⚖️ Credit Spreads vs Outrights: which vehicle fits best?',
];

export const GeminiChatDrawer: React.FC<GeminiChatDrawerProps> = ({
  isOpen,
  onClose,
  symbol,
  currentPrice,
  timeframe = '1H',
  zones,
  volatilityMetrics,
  recommendations,
  initialMessage,
  initialRole = 'daily_coach',
}) => {
  const [selectedModel, setSelectedModel] = useState<'gemini-3.8-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite'>('gemini-3.8-flash');
  const [selectedRole, setSelectedRole] = useState<'daily_coach' | 'quant' | 'risk_architect' | 'fast_scalp'>(initialRole);
  const [languageMode, setLanguageMode] = useState<'daily' | 'quant'>('daily');
  const [dailyCashflowGoal, setDailyCashflowGoal] = useState<number>(250);
  const [maxLossShield, setMaxLossShield] = useState<number>(150);
  const [showGoalSettings, setShowGoalSettings] = useState<boolean>(false);

  const atrDisplay = volatilityMetrics?.atr ? volatilityMetrics.atr.toFixed(2) : 'N/A';

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'model',
      content: `Hey! I'm sitting right beside you at the desk. 🤝

Let's look at **${symbol}** together. Price is currently at **$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**, moving about **$${atrDisplay}** per bar with **${zones.length} active zones** mapped on the radar.

Our core playbook on this desk is simple and disciplined:
🎯 **Protect Capital First:** No chasing in no-man's land. If there's no edge, sitting on hands is a winning trade.
🛡️ **Defined Risk Always:** Worst-case loss mathematically capped to the penny via credit spread wings or bracket orders.
💰 **Steady Daily Cashflow:** Harvest high-probability theta decay, lock in 50% profits early, and recycle our buying power.

What's on your mind? Want to check our wholesale entry level, size up an options credit spread, or verify our stop cushion?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handledInitialRef = useRef<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);

      if (initialRole) {
        setSelectedRole(initialRole);
      }

      if (initialMessage && handledInitialRef.current !== initialMessage) {
        handledInitialRef.current = initialMessage;
        handleSendMessage(initialMessage);
      }
    }
  }, [isOpen, initialMessage, initialRole]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isStreaming) return;

    setInput('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const assistantMsgId = `model-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'model',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg, assistantMsg];
    setMessages(newMessages);
    setIsStreaming(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          role: selectedRole,
          languageStyle: languageMode,
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          marketContext: {
            symbol,
            currentPrice,
            timeframe,
            zones: zones.map((z) => ({
              id: z.id,
              type: z.type,
              pattern: z.pattern,
              high: z.high,
              low: z.low,
              strengthScore: z.strengthScore,
              testedCount: z.testedCount,
              isMitigated: z.isMitigated,
            })),
            volatilityMetrics: {
              atr: volatilityMetrics?.atr,
              atrPercent: volatilityMetrics?.atrPercent,
              regime: volatilityMetrics?.regime,
              recommendedBufferMultiplier: volatilityMetrics?.recommendedBufferMultiplier,
              annualizedHV: volatilityMetrics?.annualizedHV,
            },
            recommendations: recommendations.map((r) => ({
              side: r.side,
              pattern: r.pattern,
              entry: r.entry,
              stopLoss: r.stopLoss,
              takeProfit1: r.takeProfit1,
              takeProfit2: r.takeProfit2,
              takeProfit3: r.takeProfit3,
              riskRewardRatio: r.riskRewardRatio,
            })),
          },
        }),
      });

      if (!response.body) {
        throw new Error('ReadableStream not supported on response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                accumulatedText += parsed.text;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: accumulatedText }
                      : msg
                  )
                );
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content:
                  msg.content ||
                  `Hey, I hit a temporary network blip reaching the AI engine: ${
                    err?.message || 'Connection lost'
                  }. Let's keep our discipline on ${symbol} and watch our key wholesale levels.`,
              }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `reset-${Date.now()}`,
        role: 'model',
        content: `Desk session refreshed! I'm sitting right here with you on **${symbol}**. Current spot is **$${currentPrice.toFixed(2)}**. What's our next move?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div 
      className={`fixed z-50 transition-all duration-300 flex flex-col bg-[#0B0F17] border-l border-slate-800 shadow-2xl ${
        isExpanded 
          ? 'inset-y-0 right-0 w-full sm:w-[680px]' 
          : 'inset-y-0 right-0 w-full sm:w-[480px]'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-800 bg-[#0F172A]/90 select-none">
        <div className="flex items-center gap-2.5">
          <div className="relative p-2 rounded-xl bg-gradient-to-tr from-emerald-500/20 via-teal-500/10 to-sky-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm">
            <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#0B0F17] animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">Trading Desk Partner</h3>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-mono text-[9px] uppercase tracking-wider font-semibold">
                Live Desk
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
              <span className="text-white font-semibold">{symbol}</span>
              <span>•</span>
              <span className="text-emerald-400">${currentPrice?.toFixed(2)}</span>
              <span>•</span>
              <span className="text-slate-400">ATR ${atrDisplay}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 text-slate-400">
          <button
            onClick={handleClearHistory}
            className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Reset desk session"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 min-h-[36px] min-w-[36px] items-center justify-center hover:text-white hover:bg-slate-800 rounded-lg transition-colors hidden sm:flex cursor-pointer"
            title={isExpanded ? 'Collapse width' : 'Expand width'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Close partner drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Model & Voice Sub-Bar */}
      <div className="px-3 sm:px-4 py-2 bg-slate-950/95 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono select-none">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 uppercase font-semibold">Mode:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setSelectedRole('daily_coach'); setLanguageMode('daily'); setSelectedModel('gemini-3.8-flash'); }}
              className={`px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer min-h-[28px] ${
                selectedRole === 'daily_coach'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Desk Partner: Plain English, steady cashflow, disciplined defined risk"
            >
              <span>🤝 Partner</span>
            </button>
            <button
              onClick={() => { setSelectedRole('risk_architect'); setSelectedModel('gemini-3.1-pro-preview'); }}
              className={`px-2 py-1 rounded transition-colors cursor-pointer min-h-[28px] ${
                selectedRole === 'risk_architect'
                  ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Deep Risk Architect (Gemini Pro): Probability math & invalidation thresholds"
            >
              <span>🛡️ Risk</span>
            </button>
            <button
              onClick={() => { setSelectedRole('quant'); setSelectedModel('gemini-3.8-flash'); setLanguageMode('quant'); }}
              className={`px-2 py-1 rounded transition-colors cursor-pointer min-h-[28px] ${
                selectedRole === 'quant'
                  ? 'bg-sky-600/30 text-sky-200 border border-sky-500/50 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Quant SMC Specialist: Order flow imbalances & institutional footprints"
            >
              <span>📊 Quant</span>
            </button>
            <button
              onClick={() => { setSelectedRole('fast_scalp'); setSelectedModel('gemini-3.1-flash-lite'); }}
              className={`px-2 py-1 rounded transition-colors cursor-pointer min-h-[28px] ${
                selectedRole === 'fast_scalp'
                  ? 'bg-amber-600/30 text-amber-200 border border-amber-500/50 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Fast Scalp: Rapid key triggers and micro levels"
            >
              <span>⚡ Scalp</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as any)}
            className="bg-slate-900 border border-slate-700/80 rounded px-1.5 py-0.5 text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer text-[10px]"
          >
            <option value="gemini-3.8-flash">gemini-3.8-flash</option>
            <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option>
            <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
          </select>
        </div>
      </div>

      {/* Partner Goal & Risk Shield Dashboard Widget */}
      <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-sky-950/70 border-b border-emerald-900/40 px-3.5 py-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-emerald-400 font-mono font-semibold text-[11px]">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400 font-normal">Daily Target:</span>
              <span className="text-emerald-300">${dailyCashflowGoal}/day</span>
            </div>
            <div className="flex items-center gap-1 text-rose-400 font-mono font-semibold text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-slate-400 font-normal">Max Stop:</span>
              <span className="text-rose-300">-${maxLossShield}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowGoalSettings(!showGoalSettings)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
              title="Adjust Daily Cashflow Goal & Max Loss Limit"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleSendMessage(`Partner, how do we target our $${dailyCashflowGoal} daily cashflow on ${symbol} today while keeping downside risk strictly capped under $${maxLossShield}? Give me the real talk game plan.`)}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-bold shadow-sm transition-all flex items-center gap-1 cursor-pointer min-h-[28px]"
            >
              <Sparkles className="w-3 h-3 text-emerald-200" />
              <span>Plan Cashflow</span>
            </button>
          </div>
        </div>

        {showGoalSettings && (
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2.5 text-[11px] font-mono animate-fadeIn">
            <div>
              <label className="text-slate-400 block text-[9px] uppercase tracking-wider mb-1 font-semibold">Daily Cashflow Goal ($):</label>
              <input
                type="number"
                value={dailyCashflowGoal}
                onChange={(e) => setDailyCashflowGoal(Number(e.target.value) || 100)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                step="50"
                min="50"
              />
            </div>
            <div>
              <label className="text-slate-400 block text-[9px] uppercase tracking-wider mb-1 font-semibold">Max Stop Limit ($):</label>
              <input
                type="number"
                value={maxLossShield}
                onChange={(e) => setMaxLossShield(Number(e.target.value) || 50)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-rose-400 font-bold focus:outline-none focus:border-rose-500"
                step="50"
                min="25"
              />
            </div>
          </div>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-xs">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-950 to-slate-900 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`group relative max-w-[88%] sm:max-w-[84%] rounded-2xl px-4 py-3 leading-relaxed text-xs shadow-md ${
                  isUser
                    ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white font-medium rounded-tr-none'
                    : 'bg-slate-900/95 border border-slate-800 text-slate-100 rounded-tl-none'
                }`}
              >
                {/* Content formatted */}
                <div className="whitespace-pre-wrap break-words space-y-1">
                  {msg.content || (
                    <span className="flex items-center gap-2 text-slate-400 font-mono text-[11px] py-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      Partner is reviewing live market numbers...
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/50 text-[9px] text-slate-400 font-mono">
                  <span>{msg.timestamp}</span>

                  {!isUser && msg.content && (
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="opacity-60 group-hover:opacity-100 hover:text-white transition-opacity flex items-center gap-1 cursor-pointer p-0.5"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {isUser && (
                <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5 shadow-sm">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Action Chips */}
      <div className="px-3 sm:px-4 py-2 border-t border-slate-800/80 bg-slate-950/70 overflow-x-auto select-none no-scrollbar flex items-center gap-1.5">
        {INITIAL_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleSendMessage(prompt)}
            disabled={isStreaming}
            className="px-2.5 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-slate-300 hover:text-white border border-slate-800/90 text-[10px] font-mono whitespace-nowrap transition-colors disabled:opacity-40 cursor-pointer shadow-sm min-h-[28px]"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Box with mobile touch targets */}
      <div className="p-3 border-t border-slate-800 bg-[#0F172A]/95">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask your desk partner anything: "Should we take this?", "Why wait?", etc.`}
            disabled={isStreaming}
            className="flex-1 min-h-[44px] bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-2.5 text-white font-sans text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50 transition-colors shadow-inner"
          />

          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="min-w-[44px] min-h-[44px] p-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl transition-all disabled:opacity-40 shrink-0 shadow-md flex items-center justify-center cursor-pointer"
            title="Send to partner"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="text-[10px] text-slate-500 font-mono mt-1.5 text-center flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          <span>Real-Time Desk Partner • Grounded in Live Order Flow & ATR</span>
        </div>
      </div>
    </div>
  );
};
