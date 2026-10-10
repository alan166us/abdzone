import React, { useState, useEffect } from 'react';
import { SupplyDemandZone, TradeRecommendation, VolatilityMetrics } from '../types/trading';
import { X, Sparkles, RefreshCw, Cpu, CheckCircle } from 'lucide-react';

interface AIAnalystModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  timeframe: string;
  currentPrice: number;
  zones: SupplyDemandZone[];
  volatilityMetrics: VolatilityMetrics;
  recommendations: TradeRecommendation[];
}

export const AIAnalystModal: React.FC<AIAnalystModalProps> = ({
  isOpen,
  onClose,
  symbol,
  timeframe,
  currentPrice,
  zones,
  volatilityMetrics,
  recommendations,
}) => {
  const [analysisText, setAnalysisText] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [languageStyle, setLanguageStyle] = useState<'daily' | 'quant'>('daily');

  const fetchAnalysis = async (styleToUse: 'daily' | 'quant' = languageStyle) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai/deep-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe,
          currentPrice,
          zones,
          volatilityMetrics,
          recommendations,
          languageStyle: styleToUse,
        }),
      });

      const data = await res.json();
      if (data && data.analysis) {
        setAnalysisText(data.analysis);
        setSource(data.source || 'ai-engine');
      }
    } catch (err) {
      console.error('Failed to fetch AI analysis', err);
      setAnalysisText('Analysis engine connection interrupted. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStyle = (newStyle: 'daily' | 'quant') => {
    if (newStyle === languageStyle) return;
    setLanguageStyle(newStyle);
    fetchAnalysis(newStyle);
  };

  useEffect(() => {
    if (isOpen && !analysisText) {
      fetchAnalysis(languageStyle);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0B0F17] border border-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0F172A]/70">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-display">AI Market Copilot · Analysis</h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {symbol} · {timeframe} · Spot ${currentPrice.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Style Switcher */}
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-lg p-0.5 flex items-center gap-0.5 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => handleToggleStyle('daily')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  languageStyle === 'daily'
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Explain in everyday daily language with market story and the 'why'"
              >
                🗣️ Daily Plain Talk
              </button>
              <button
                type="button"
                onClick={() => handleToggleStyle('quant')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  languageStyle === 'quant'
                    ? 'bg-purple-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Institutional quantitative SMC analysis"
              >
                🔬 Technical Quant
              </button>
            </div>

            <button
              onClick={() => fetchAnalysis(languageStyle)}
              disabled={isLoading}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh Analysis"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 font-sans text-xs text-slate-300 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
              <div className="text-slate-400 font-mono text-xs">Deconstructing market structure & order blocks...</div>
            </div>
          ) : (
            <div className="prose prose-invert prose-xs max-w-none space-y-3 whitespace-pre-wrap font-sans leading-relaxed">
              {analysisText}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-slate-500" />
            <span>Engine: {source || 'SMC Quant Model'}</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium text-xs"
          >
            Close Debrief
          </button>
        </div>
      </div>
    </div>
  );
};
