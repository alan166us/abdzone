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
  ArrowDown, 
  ShieldAlert, 
  Check, 
  Copy,
  Activity
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
}

const INITIAL_PROMPTS = [
  '📊 Analyze current demand zone & entry validity',
  '🛡️ Why is the stop-loss buffered at this ATR distance?',
  '🎯 Which setup has the highest R:R ratio?',
  '⚡ What does the current volatility regime imply?',
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
}) => {
  const [selectedModel, setSelectedModel] = useState<'gemini-3.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite'>('gemini-3.5-flash');
  const [selectedRole, setSelectedRole] = useState<'quant' | 'risk_architect' | 'fast_scalp'>('quant');

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'model',
      content: `Hello! I am your real-time **Gemini AI** Market Copilot.\n\nI have live visibility into **${symbol}** trading at **$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** with an ATR(14) of **$${volatilityMetrics?.atr?.toFixed(2) || 'N/A'}** and **${zones.length} active supply & demand zones**.\n\nAsk me anything about order blocks, liquidity sweeps, stop-loss buffer mathematics, or trade execution.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

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
              atr: volatilityMetrics.atr,
              atrPercent: volatilityMetrics.atrPercent,
              regime: volatilityMetrics.regime,
              recommendedBufferMultiplier: volatilityMetrics.recommendedBufferMultiplier,
              annualizedHV: volatilityMetrics.annualizedHV,
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
                  `Sorry, I encountered an issue communicating with the AI service: ${
                    err?.message || 'Connection lost'
                  }`,
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
        content: `Chat session reset. Ready to analyze **${symbol}** live order flow and volatility.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div 
      className={`fixed z-50 transition-all duration-300 flex flex-col bg-[#0B0F17] border-l border-slate-800 shadow-2xl ${
        isExpanded 
          ? 'inset-y-0 right-0 w-full sm:w-[680px]' 
          : 'inset-y-0 right-0 w-full sm:w-[460px]'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#0F172A]/80 select-none">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-gradient-to-tr from-emerald-500/20 to-sky-500/20 text-emerald-400 border border-emerald-500/30">
            <Sparkles className="w-4 h-4 animate-pulse text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-display">Gemini AI Market Copilot</h3>
              <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono text-[9px] uppercase">
                Multi-Turn
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
              <span>{symbol} @ ${currentPrice?.toFixed(2)}</span>
              <span>•</span>
              <span className="text-emerald-400">{volatilityMetrics.regime}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 text-slate-400">
          <button
            onClick={handleClearHistory}
            className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Reset conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition-colors hidden sm:block"
            title={isExpanded ? 'Collapse width' : 'Expand width'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Model & Role Sub-Bar */}
      <div className="px-4 py-2 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono select-none">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 uppercase">Model:</span>
          <select
            value={selectedModel}
            onChange={(e) => {
              const m = e.target.value as any;
              setSelectedModel(m);
              if (m === 'gemini-3.1-pro-preview') setSelectedRole('risk_architect');
              else if (m === 'gemini-3.1-flash-lite') setSelectedRole('fast_scalp');
              else setSelectedRole('quant');
            }}
            className="bg-slate-900 border border-slate-700/80 rounded px-1.5 py-0.5 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer text-[10px]"
          >
            <option value="gemini-3.5-flash">gemini-3.5-flash (General Tasks)</option>
            <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Complex Tasks)</option>
            <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast Tasks)</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-slate-500 uppercase hidden sm:inline">Role:</span>
          <button
            onClick={() => { setSelectedRole('quant'); setSelectedModel('gemini-3.5-flash'); }}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              selectedRole === 'quant'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Quant
          </button>
          <button
            onClick={() => { setSelectedRole('risk_architect'); setSelectedModel('gemini-3.1-pro-preview'); }}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              selectedRole === 'risk_architect'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Risk Architect
          </button>
          <button
            onClick={() => { setSelectedRole('fast_scalp'); setSelectedModel('gemini-3.1-flash-lite'); }}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              selectedRole === 'fast_scalp'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Fast Scalp
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-xs">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`group relative max-w-[85%] rounded-xl px-3.5 py-2.5 leading-relaxed text-xs shadow-sm ${
                  isUser
                    ? 'bg-emerald-600 text-white font-medium rounded-tr-none'
                    : 'bg-slate-900 border border-slate-800/90 text-slate-200 rounded-tl-none'
                }`}
              >
                {/* Content formatted */}
                <div className="whitespace-pre-wrap break-words">
                  {msg.content || (
                    <span className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Gemini is generating quantitative response...
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/40 text-[9px] text-slate-400 font-mono">
                  <span>{msg.timestamp}</span>

                  {!isUser && msg.content && (
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity flex items-center gap-1"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompt Chips */}
      <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-950/60 overflow-x-auto select-none no-scrollbar flex items-center gap-2">
        {INITIAL_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleSendMessage(prompt)}
            disabled={isStreaming}
            className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[10px] font-mono whitespace-nowrap transition-colors disabled:opacity-40"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-slate-800 bg-[#0F172A]/90">
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
            placeholder={`Ask Gemini about ${symbol} order flow, SL buffer, or setups...`}
            disabled={isStreaming}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2 text-white font-sans text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-40 shrink-0 shadow-sm"
            title="Send query"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
        <div className="text-[10px] text-slate-500 font-mono mt-1 text-center">
          Powered by Gemini 3.8 Flash • Real-Time Order Flow Grounding
        </div>
      </div>
    </div>
  );
};
