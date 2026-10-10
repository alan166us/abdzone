import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Candle, SupplyDemandZone, TradeRecommendation, VolatilityMetrics } from '../types/trading';
import { calculateSessionVwap, VwapPoint } from '../utils/vwapEngine';
import { ZoomIn, ZoomOut, RotateCcw, Crosshair, Layers, ChevronRight, Clock, Calendar } from 'lucide-react';

export type TimezoneMode = 'ET' | 'CT' | 'LOCAL' | 'UTC';

export function formatTimeWithZone(
  timeMs: number,
  tzMode: TimezoneMode = 'ET',
  hourShift: number = 0
): {
  axisLabel: string;
  fullDisplay: string;
  timeOnly: string;
  dateOnly: string;
} {
  const safeMs = typeof timeMs === 'number' && !isNaN(timeMs) && timeMs > 0 ? timeMs : Date.now();
  const adjusted = safeMs + hourShift * 3600 * 1000;
  const d = new Date(adjusted);

  const tz = 
    tzMode === 'ET' ? 'America/New_York' :
    tzMode === 'CT' ? 'America/Chicago' :
    tzMode === 'UTC' ? 'UTC' : undefined;

  try {
    const tzOpt = tz ? { timeZone: tz } : {};

    const monthDay = d.toLocaleDateString('en-US', { ...tzOpt, month: 'short', day: 'numeric' });
    const weekday = d.toLocaleDateString('en-US', { ...tzOpt, weekday: 'short' });
    const timeFormatted = d.toLocaleTimeString('en-US', { ...tzOpt, hour: '2-digit', minute: '2-digit', hour12: true });

    const tzLabel = tzMode === 'ET' ? 'ET' : tzMode === 'CT' ? 'CT' : tzMode === 'UTC' ? 'UTC' : 'Local';
    const shiftLabel = hourShift !== 0 ? ` (${hourShift > 0 ? `+${hourShift}h` : `${hourShift}h`})` : '';

    return {
      axisLabel: `${monthDay} ${timeFormatted}`,
      fullDisplay: `${weekday}, ${monthDay} · ${timeFormatted} ${tzLabel}${shiftLabel}`,
      timeOnly: timeFormatted,
      dateOnly: monthDay,
    };
  } catch {
    return {
      axisLabel: d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      fullDisplay: d.toLocaleString(),
      timeOnly: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateOnly: d.toLocaleDateString(),
    };
  }
}

export interface DataSourceInfo {
  source: string;
  isRealtime: boolean;
  lastUpdated?: string;
  mode?: 'schwab' | 'exchange' | 'synthetic';
}

interface CandleChartProps {
  candles: Candle[];
  zones: SupplyDemandZone[];
  volatilityMetrics: VolatilityMetrics;
  selectedRecommendation: TradeRecommendation | null;
  onSelectZone: (zone: SupplyDemandZone) => void;
  selectedZoneId?: string | null;
  symbol: string;
  frequency?: number;
  onFrequencyChange?: (frequency: number) => void;
  dataSourceInfo?: DataSourceInfo;
  onRefreshData?: () => void;
  isRefreshing?: boolean;
}

export const CandleChart: React.FC<CandleChartProps> = ({
  candles,
  zones,
  volatilityMetrics,
  selectedRecommendation,
  onSelectZone,
  selectedZoneId,
  symbol,
  frequency = 60,
  onFrequencyChange,
  dataSourceInfo,
  onRefreshData,
  isRefreshing = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Viewport / Window State (Fixed-width coordinate system based on candle index)
  const [candleSpacing, setCandleSpacing] = useState<number>(12);
  const [startIndex, setStartIndex] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragStartOffset, setDragStartOffset] = useState<number>(0);
  const [isLiveFollowing, setIsLiveFollowing] = useState<boolean>(true);
  const prevSymbolRef = useRef<string>(symbol);
  const prevSelectedZoneIdRef = useRef<string | null>(null);
  const priceBoundsRef = useRef<{ minPrice: number; maxPrice: number; priceRange: number; chartHeight: number } | null>(null);
  const [chartWidth, setChartWidth] = useState<number>(850);

  // ResizeObserver to track responsive chart width
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width - 75; // minus price axis width
        if (w > 100) setChartWidth(w);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const visibleBarsCount = Math.max(10, Math.floor(chartWidth / candleSpacing));

  // Crosshair State
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [hoveredZone, setHoveredZone] = useState<SupplyDemandZone | null>(null);

  // Layer Visibility Toggles
  const [showDemand, setShowDemand] = useState<boolean>(true);
  const [showSupply, setShowSupply] = useState<boolean>(true);
  const [recentOnlyZones, setRecentOnlyZones] = useState<boolean>(true);
  const [showMitigated, setShowMitigated] = useState<boolean>(false);
  const [showVwap, setShowVwap] = useState<boolean>(true);
  const [showAtrBands, setShowAtrBands] = useState<boolean>(true);
  const [showTradeSetup, setShowTradeSetup] = useState<boolean>(true);
  const [showVolume, setShowVolume] = useState<boolean>(true);

  // Session Institutional VWAP calculation
  const sessionVwap = useMemo(() => calculateSessionVwap(candles), [candles]);
  const latestVwapPoint = sessionVwap[sessionVwap.length - 1];

  // Timezone and Hour Shift Configuration (persistent)
  const [tzMode, setTzMode] = useState<TimezoneMode>(() => {
    try {
      const saved = localStorage.getItem('strata_chart_tz');
      if (saved && ['ET', 'CT', 'LOCAL', 'UTC'].includes(saved)) {
        return saved as TimezoneMode;
      }
    } catch {}
    return 'ET';
  });

  const [hourShift, setHourShift] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('strata_chart_hour_shift');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed)) return parsed;
      }
    } catch {}
    return 0;
  });

  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSetTzMode = (mode: TimezoneMode) => {
    setTzMode(mode);
    try {
      localStorage.setItem('strata_chart_tz', mode);
    } catch {}
  };

  const handleSetHourShift = (deltaOrVal: number, isAbsolute: boolean = false) => {
    const next = isAbsolute ? deltaOrVal : hourShift + deltaOrVal;
    const clamped = Math.max(-12, Math.min(12, next));
    setHourShift(clamped);
    try {
      localStorage.setItem('strata_chart_hour_shift', clamped.toString());
    } catch {}
  };

  const liveClockFormatted = useMemo(() => {
    const tz =
      tzMode === 'ET' ? 'America/New_York' :
      tzMode === 'CT' ? 'America/Chicago' :
      tzMode === 'UTC' ? 'UTC' : undefined;
    const tzOpt = tz ? { timeZone: tz } : {};
    const shiftedMs = currentTime.getTime() + hourShift * 3600 * 1000;
    const d = new Date(shiftedMs);
    return d.toLocaleTimeString('en-US', {
      ...tzOpt,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }, [currentTime, tzMode, hourShift]);

  // When symbol changes, reset view to latest candles in live follow mode
  useEffect(() => {
    if (symbol !== prevSymbolRef.current) {
      prevSymbolRef.current = symbol;
      setIsLiveFollowing(true);
      if (candles.length > 0) {
        setStartIndex(Math.max(0, candles.length - visibleBarsCount + 3));
      }
    }
  }, [symbol, candles.length, visibleBarsCount]);

  // When candles update: if in Live Follow mode, smoothly keep pinned to the latest bar
  useEffect(() => {
    if (candles.length > 0 && isLiveFollowing) {
      const newStart = Math.max(0, candles.length - visibleBarsCount + 3);
      setStartIndex(newStart);
    }
  }, [candles.length, visibleBarsCount, isLiveFollowing]);

  // When selectedZoneId changes explicitly from user selection, center on it ONCE without fighting live ticks
  useEffect(() => {
    if (selectedZoneId && selectedZoneId !== prevSelectedZoneIdRef.current && candles.length > 0) {
      prevSelectedZoneIdRef.current = selectedZoneId;
      const zone = zones.find(z => z.id === selectedZoneId);
      if (zone) {
        let center = zone.startIndex;
        if (zone.startTime) {
          const cIdx = candles.findIndex(c => c.time === zone.startTime);
          if (cIdx !== -1) center = cIdx;
        }
        const newStart = Math.max(0, Math.min(candles.length - visibleBarsCount, center - Math.floor(visibleBarsCount / 2)));
        setStartIndex(newStart);
        setIsLiveFollowing(false); // User intentionally inspected a historical zone
      }
    } else if (!selectedZoneId) {
      prevSelectedZoneIdRef.current = null;
    }
  }, [selectedZoneId, visibleBarsCount, zones, candles]);

  // Handle Canvas Rendering with Fixed-Width Coordinate System
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Margins
    const priceAxisWidth = 75;
    const timeAxisHeight = 32;
    const volumeHeight = showVolume ? 70 : 0;
    const currentChartWidth = width - priceAxisWidth;
    const chartHeight = height - timeAxisHeight - volumeHeight;

    // Fixed-width coordinate system:
    // Each candle index occupies exactly candleSpacing pixels horizontally
    const candleBarWidth = Math.max(2, Math.floor(candleSpacing * 0.72));

    // Visible slice strictly calculated by candle index
    const safeStart = Math.max(0, Math.floor(startIndex));
    const maxVisibleBars = Math.ceil(currentChartWidth / candleSpacing) + 2;
    const safeEnd = Math.min(candles.length, safeStart + maxVisibleBars);
    const visibleCandles = candles.slice(safeStart, safeEnd);

    if (visibleCandles.length === 0) return;

    // Price Bounds computed over visible slice
    let minPrice = Math.min(...visibleCandles.map(c => c.low));
    let maxPrice = Math.max(...visibleCandles.map(c => c.high));

    // Expand price bounds slightly for padding
    const pricePadding = (maxPrice - minPrice) * 0.08 || 1;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    const priceRange = maxPrice - minPrice;

    // Max Volume
    const maxVolume = Math.max(...visibleCandles.map(c => c.volume), 1);

    // Store latest price bounds for accurate cursor price conversion and zone hit-testing
    priceBoundsRef.current = { minPrice, maxPrice, priceRange, chartHeight };

    // Fixed-width Coordinate conversion:
    // Any candle index has a fixed X position independent of count variations
    const getX = (globalIdx: number) => (globalIdx - startIndex) * candleSpacing + candleSpacing / 2;
    const getY = (price: number) => chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    const getPriceFromY = (y: number) => maxPrice - (y / chartHeight) * priceRange;

    // 1. Clear background
    ctx.fillStyle = '#0B0F17';
    ctx.fillRect(0, 0, width, height);

    // 1.1 Time Axis Background Strip
    ctx.fillStyle = '#080C14';
    ctx.fillRect(0, height - timeAxisHeight, width, timeAxisHeight);

    // Divider line between chart and time axis
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - timeAxisHeight);
    ctx.lineTo(width, height - timeAxisHeight);
    ctx.stroke();

    // 2. Draw Grid Lines
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);

    // Horizontal Price Grids (6 levels)
    const gridSteps = 6;
    ctx.fillStyle = '#64748B';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    for (let i = 0; i <= gridSteps; i++) {
      const p = minPrice + (priceRange / gridSteps) * i;
      const y = getY(p);

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(currentChartWidth, y);
      ctx.stroke();

      // Price text on axis
      ctx.fillText(p.toFixed(p < 10 ? 4 : 2), currentChartWidth + 8, y + 3);
    }

    // Vertical Time Grids based on fixed candle index steps
    const timeStepBars = Math.max(5, Math.round(80 / candleSpacing));
    ctx.textAlign = 'center';
    ctx.font = '10px "JetBrains Mono", monospace';

    const firstGridIdx = Math.ceil(safeStart / timeStepBars) * timeStepBars;
    for (let globalIdx = firstGridIdx; globalIdx < safeEnd; globalIdx += timeStepBars) {
      const x = getX(globalIdx);
      if (x < 0 || x > currentChartWidth) continue;

      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - timeAxisHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tick mark on time axis
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, height - timeAxisHeight);
      ctx.lineTo(x, height - timeAxisHeight + 4);
      ctx.stroke();

      const c = candles[globalIdx];
      if (c) {
        const ts = typeof c.time === 'number' && !isNaN(c.time) && c.time > 0
          ? c.time
          : Date.parse(c.dateStr) || Date.now();
        const { axisLabel } = formatTimeWithZone(ts, tzMode, hourShift);
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(axisLabel, x, height - 10);
      }
    }
    ctx.setLineDash([]); // Reset dashed

    // 3. Draw Supply & Demand Zones in Fixed-Width Coordinates
    let activeZones = zones.filter(z => {
      if (z.isMitigated && !showMitigated) return false;
      if (z.type === 'demand' && !showDemand) return false;
      if (z.type === 'supply' && !showSupply) return false;
      return true;
    });

    if (recentOnlyZones) {
      // Keep strictly ONLY the single most recent unmitigated demand zone and single most recent unmitigated supply zone
      const recentDemand = activeZones.filter(z => z.type === 'demand' && !z.isMitigated).slice(0, 1);
      const recentSupply = activeZones.filter(z => z.type === 'supply' && !z.isMitigated).slice(0, 1);
      const recentMitigated = showMitigated ? activeZones.filter(z => z.isMitigated).slice(0, 1) : [];
      activeZones = [...recentDemand, ...recentSupply, ...recentMitigated];
    }

    const drawnTags: { x: number; y: number; w: number; h: number }[] = [];

    for (const zone of activeZones) {
      // Find start & end X by matching exact candle timestamp (guarantees zero drift/shifting)
      let actualStart = zone.startIndex;
      if (zone.startTime) {
        const found = candles.findIndex(c => c.time === zone.startTime);
        if (found !== -1) actualStart = found;
      }
      const rawZoneLeft = (actualStart - startIndex) * candleSpacing;

      let actualEnd = candles.length - 1;
      if (zone.isMitigated) {
        if (zone.mitigatedTime) {
          const foundM = candles.findIndex(c => c.time === zone.mitigatedTime);
          if (foundM !== -1) actualEnd = foundM;
          else if (zone.mitigatedIndex !== undefined) actualEnd = zone.mitigatedIndex;
        } else if (zone.mitigatedIndex !== undefined) {
          actualEnd = zone.mitigatedIndex;
        }
      }
      const rawZoneRight = zone.isMitigated
        ? (actualEnd - startIndex) * candleSpacing + candleSpacing
        : currentChartWidth;

      if (rawZoneRight <= 0 || rawZoneLeft >= currentChartWidth) continue; // Out of view

      const drawLeft = Math.max(-10, rawZoneLeft);
      const drawRight = Math.min(currentChartWidth, rawZoneRight);
      const drawWidth = drawRight - drawLeft;
      if (drawWidth <= 0) continue;

      const topY = getY(zone.high);
      const bottomY = getY(zone.low);
      const zoneH = Math.max(3, bottomY - topY);
      const isSelected = selectedZoneId === zone.id;
      const isHovered = hoveredZone?.id === zone.id;
      const isDemand = zone.type === 'demand';

      // --- Dynamic Conviction Opacity Engine ---
      // Distinguish institutional conviction by combining freshness (testedCount) and departure velocity:
      // High departureVelocity (>= 1.6x ATR) and 0 tests indicate massive unfulfilled limit order imbalances.
      // Repeatedly tested zones (testedCount >= 2) indicate liquidity exhaustion.
      const velocity = zone.departureVelocity || 1.2;
      const velocityMultiplier = Math.min(1.50, Math.max(0.65, 0.65 + (velocity - 1.0) * 0.45));

      let freshnessMultiplier = 1.0;
      if (zone.isMitigated) {
        freshnessMultiplier = 0.16;
      } else if (zone.testedCount === 0) {
        freshnessMultiplier = 1.0;
      } else if (zone.testedCount === 1) {
        freshnessMultiplier = 0.60;
      } else if (zone.testedCount === 2) {
        freshnessMultiplier = 0.32;
      } else {
        freshnessMultiplier = 0.18;
      }

      // Calculate fill and border alpha with distinctive tiers
      let fillAlpha = 0.22 * velocityMultiplier * freshnessMultiplier;
      let borderAlpha = 0.80 * freshnessMultiplier * Math.min(1.2, velocityMultiplier);

      const isHighConviction = !zone.isMitigated && zone.testedCount === 0 && velocity >= 1.6;
      const isDepleted = !zone.isMitigated && zone.testedCount >= 2;

      if (isHighConviction) {
        fillAlpha = Math.max(0.34, fillAlpha * 1.35);
        borderAlpha = Math.max(0.92, borderAlpha * 1.15);
      } else if (isDepleted) {
        fillAlpha = Math.min(0.08, fillAlpha);
        borderAlpha = Math.min(0.38, borderAlpha);
      }

      if (isSelected) {
        fillAlpha = Math.max(0.42, fillAlpha + 0.18);
        borderAlpha = 1.0;
      } else if (isHovered) {
        fillAlpha = Math.max(0.30, fillAlpha + 0.10);
        borderAlpha = Math.min(1.0, borderAlpha + 0.25);
      }

      if (zone.isMitigated) {
        fillAlpha = 0.04;
        borderAlpha = 0.22;
      }

      fillAlpha = Math.max(0.03, Math.min(0.48, fillAlpha));
      borderAlpha = Math.max(0.18, Math.min(1.0, borderAlpha));

      // Fill style: High conviction zones feature a directional gradient emphasizing the proximal entry line
      if (isHighConviction && !zone.isMitigated) {
        const grad = ctx.createLinearGradient(0, topY, 0, bottomY);
        if (isDemand) {
          // In demand, proximal entry level is topY (high)
          grad.addColorStop(0, `rgba(16, 185, 129, ${Number((fillAlpha * 1.40).toFixed(3))})`);
          grad.addColorStop(1, `rgba(16, 185, 129, ${Number((fillAlpha * 0.65).toFixed(3))})`);
        } else {
          // In supply, proximal entry level is bottomY (low)
          grad.addColorStop(0, `rgba(244, 63, 94, ${Number((fillAlpha * 0.65).toFixed(3))})`);
          grad.addColorStop(1, `rgba(244, 63, 94, ${Number((fillAlpha * 1.40).toFixed(3))})`);
        }
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = isDemand
          ? `rgba(16, 185, 129, ${Number(fillAlpha.toFixed(3))})`
          : `rgba(244, 63, 94, ${Number(fillAlpha.toFixed(3))})`;
      }

      // Border color
      ctx.strokeStyle = isDemand
        ? `rgba(16, 185, 129, ${Number(borderAlpha.toFixed(3))})`
        : `rgba(244, 63, 94, ${Number(borderAlpha.toFixed(3))})`;

      // Draw Zone Box
      ctx.fillRect(drawLeft, topY, drawWidth, zoneH);

      // Border line thickness and dash
      if (zone.isMitigated) {
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
      } else if (isHighConviction) {
        ctx.lineWidth = isSelected ? 2.8 : 2.0;
        ctx.setLineDash([]);
      } else if (isDepleted) {
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
      } else {
        ctx.lineWidth = isSelected ? 2.2 : 1.2;
        ctx.setLineDash([]);
      }

      ctx.strokeRect(drawLeft, topY, drawWidth, zoneH);

      // Proximal edge luminous hairline for high conviction zones
      if (isHighConviction && !zone.isMitigated) {
        const proximalY = isDemand ? topY : bottomY;
        ctx.strokeStyle = isDemand ? 'rgba(52, 211, 153, 0.95)' : 'rgba(251, 113, 133, 0.95)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(drawLeft, proximalY);
        ctx.lineTo(drawRight, proximalY);
        ctx.stroke();
      }

      // Equilibrium Midline (50%)
      const midY = (topY + bottomY) / 2;
      ctx.setLineDash([2, 3]);
      const eqAlpha = Math.max(0.22, borderAlpha * 0.65);
      ctx.strokeStyle = isDemand ? `rgba(16, 185, 129, ${eqAlpha.toFixed(2)})` : `rgba(244, 63, 94, ${eqAlpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(drawLeft, midY);
      ctx.lineTo(drawRight, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Zone Tag / Conviction Badge Label
      let convictionLabel = '';
      if (zone.isMitigated) {
        convictionLabel = 'MITIGATED';
      } else if (isHighConviction) {
        convictionLabel = `★ HIGH CONVICTION · ${velocity.toFixed(1)}x ATR · FRESH (0-TEST)`;
      } else if (zone.testedCount === 0) {
        convictionLabel = `FRESH · ${velocity.toFixed(1)}x ATR`;
      } else if (zone.testedCount === 1) {
        convictionLabel = `TESTED 1X · ${velocity.toFixed(1)}x ATR`;
      } else {
        convictionLabel = `DEPLETED · TESTED ${zone.testedCount}X`;
      }

      const tagText = `${isDemand ? 'DEMAND' : 'SUPPLY'} [${zone.pattern}] · ${convictionLabel}`;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const tagWidth = ctx.measureText(tagText).width + 10;
      const tagX = Math.min(currentChartWidth - tagWidth - 8, Math.max(rawZoneLeft + 6, 8));
      let tagY = topY + 11;

      // Prevent label collision with previously drawn tags
      for (const prev of drawnTags) {
        const xOverlap = tagX < prev.x + prev.w && tagX + tagWidth > prev.x;
        if (xOverlap && Math.abs(tagY - prev.y) < 14) {
          tagY = prev.y + 14;
        }
      }
      drawnTags.push({ x: tagX, y: tagY, w: tagWidth, h: 12 });

      // Tag pill background with conviction styling
      const tagBgAlpha = isHighConviction ? 0.95 : (zone.isMitigated ? 0.60 : (isDepleted ? 0.70 : 0.85));
      ctx.fillStyle = isDemand ? `rgba(6, 78, 59, ${tagBgAlpha})` : `rgba(136, 19, 55, ${tagBgAlpha})`;
      ctx.fillRect(tagX - 2, tagY - 9, tagWidth, 12);
      ctx.fillStyle = isDemand ? (isHighConviction ? '#6EE7B7' : (isDepleted ? '#6EE7B7/60' : '#A7F3D0')) : (isHighConviction ? '#FDA4AF' : (isDepleted ? '#FDA4AF/60' : '#FECDD3'));
      ctx.fillText(tagText, tagX + 3, tagY);

      // Right axis price pills when hovered or selected
      if (isSelected || isHovered) {
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        // High level pill
        ctx.fillStyle = isDemand ? '#059669' : '#DC2626';
        ctx.fillRect(currentChartWidth + 2, topY - 7, priceAxisWidth - 4, 14);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(zone.high.toFixed(2), currentChartWidth + 5, topY + 4);
        // Low level pill
        ctx.fillStyle = isDemand ? '#047857' : '#B91C1C';
        ctx.fillRect(currentChartWidth + 2, bottomY - 7, priceAxisWidth - 4, 14);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(zone.low.toFixed(2), currentChartWidth + 5, bottomY + 4);
      }
    }

    // 4. Volatility ATR Bands / Trailing Bands (if enabled)
    if (showAtrBands && volatilityMetrics.atr > 0) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'; // Cyan hairline
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);

      ctx.beginPath();
      visibleCandles.forEach((c, idxInSlice) => {
        const globalIdx = safeStart + idxInSlice;
        const x = getX(globalIdx);
        const upperAtr = c.close + volatilityMetrics.atr * 1.5;
        const y = getY(upperAtr);
        if (idxInSlice === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.beginPath();
      visibleCandles.forEach((c, idxInSlice) => {
        const globalIdx = safeStart + idxInSlice;
        const x = getX(globalIdx);
        const lowerAtr = c.close - volatilityMetrics.atr * 1.5;
        const y = getY(lowerAtr);
        if (idxInSlice === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4.1. Institutional Session VWAP & Standard Deviation Bands (if enabled)
    if (showVwap && sessionVwap.length > 0) {
      // Shaded Value Area (+1σ to -1σ)
      ctx.fillStyle = 'rgba(245, 158, 11, 0.05)';
      ctx.beginPath();
      let hasStartedFill = false;
      visibleCandles.forEach((_, idxInSlice) => {
        const globalIdx = safeStart + idxInSlice;
        const pt = sessionVwap[globalIdx];
        if (!pt) return;
        const x = getX(globalIdx);
        const yTop = getY(pt.upper1);
        if (!hasStartedFill) {
          ctx.moveTo(x, yTop);
          hasStartedFill = true;
        } else {
          ctx.lineTo(x, yTop);
        }
      });
      for (let idxInSlice = visibleCandles.length - 1; idxInSlice >= 0; idxInSlice--) {
        const globalIdx = safeStart + idxInSlice;
        const pt = sessionVwap[globalIdx];
        if (!pt) continue;
        const x = getX(globalIdx);
        const yBot = getY(pt.lower1);
        ctx.lineTo(x, yBot);
      }
      ctx.closePath();
      ctx.fill();

      // Segmented line drawing respecting session day resets
      const drawVwapSegmentedLine = (
        accessor: (pt: VwapPoint) => number,
        color: string,
        lineWidth: number,
        dash: number[] = []
      ) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dash);
        ctx.beginPath();
        let prevDay = '';

        visibleCandles.forEach((c, idxInSlice) => {
          const globalIdx = safeStart + idxInSlice;
          const pt = sessionVwap[globalIdx];
          if (!pt) return;
          const x = getX(globalIdx);
          const y = getY(accessor(pt));
          const dateStr = new Date(c.time).toLocaleDateString('en-US', { timeZone: 'America/New_York' });

          if (dateStr !== prevDay) {
            prevDay = dateStr;
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      };

      // ±2.0σ Standard Deviation Bands (Institutional Exhaustion boundaries)
      drawVwapSegmentedLine(pt => pt.upper2, 'rgba(234, 179, 8, 0.40)', 1, [4, 4]);
      drawVwapSegmentedLine(pt => pt.lower2, 'rgba(234, 179, 8, 0.40)', 1, [4, 4]);

      // ±1.0σ Standard Deviation Bands (Institutional Value Area boundaries)
      drawVwapSegmentedLine(pt => pt.upper1, 'rgba(245, 158, 11, 0.65)', 1, [2, 2]);
      drawVwapSegmentedLine(pt => pt.lower1, 'rgba(245, 158, 11, 0.65)', 1, [2, 2]);

      // Core Session VWAP Baseline
      drawVwapSegmentedLine(pt => pt.vwap, '#F59E0B', 1.8, []);
      ctx.setLineDash([]);
    }

    // 5. Draw Candlesticks & Volume (Fixed-width Coordinate System)
    visibleCandles.forEach((candle, idxInSlice) => {
      const globalIdx = safeStart + idxInSlice;
      const x = getX(globalIdx);
      if (x < -candleSpacing || x > currentChartWidth + candleSpacing) return;

      const isBullish = candle.close >= candle.open;
      const color = isBullish ? '#10B981' : '#F43F5E';

      // --- Volume Bar ---
      if (showVolume) {
        const volY = height - timeAxisHeight;
        const barH = (candle.volume / maxVolume) * (volumeHeight - 10);
        ctx.fillStyle = isBullish ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)';
        ctx.fillRect(x - candleBarWidth / 2, volY - barH, candleBarWidth, barH);
      }

      // --- Candlestick Wick ---
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, getY(candle.high));
      ctx.lineTo(x, getY(candle.low));
      ctx.stroke();

      // --- Candlestick Body ---
      const bodyTop = getY(Math.max(candle.open, candle.close));
      const bodyBottom = getY(Math.min(candle.open, candle.close));
      const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);

      ctx.fillStyle = color;
      ctx.fillRect(x - candleBarWidth / 2, bodyTop, candleBarWidth, bodyHeight);
    });

    // 6. Draw Selected Trade Setup (Entry, Stop-Loss with Volatility Buffer, Take Profits)
    if (showTradeSetup && selectedRecommendation) {
      const rec = selectedRecommendation;
      const entryY = getY(rec.entry);
      const slY = getY(rec.stopLoss);
      const tp1Y = getY(rec.takeProfit1);
      const tp2Y = getY(rec.takeProfit2);

      // Shaded Risk / Reward Area
      const setupStartX = Math.max(0, currentChartWidth - 280);
      const setupEndX = currentChartWidth;

      // Risk zone (Entry to SL)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.fillRect(setupStartX, Math.min(entryY, slY), setupEndX - setupStartX, Math.abs(entryY - slY));

      // Reward zone (Entry to TP2)
      ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.fillRect(setupStartX, Math.min(entryY, tp2Y), setupEndX - setupStartX, Math.abs(entryY - tp2Y));

      // Entry line (Cyan) - Aggressive Proximal
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(setupStartX, entryY);
      ctx.lineTo(setupEndX, entryY);
      ctx.stroke();

      // Conservative 50% Equilibrium Entry (Amber dashed)
      if (rec.conservativeEntry) {
        const consY = getY(rec.conservativeEntry);
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(setupStartX, consY);
        ctx.lineTo(setupEndX, consY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Hard SL line (Red dotted) - Distal ± 1.35x ATR
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(setupStartX, slY);
      ctx.lineTo(setupEndX, slY);
      ctx.stroke();

      // TP1 line (1:2 R:R De-risk)
      ctx.strokeStyle = '#34D399';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(setupStartX, tp1Y);
      ctx.lineTo(setupEndX, tp1Y);
      ctx.stroke();

      // TP2 line (Opposing Zone Proximal)
      ctx.strokeStyle = '#10B981';
      ctx.setLineDash([]);
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(setupStartX, tp2Y);
      ctx.lineTo(setupEndX, tp2Y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tags on price axis
      ctx.fillStyle = '#0284C7';
      ctx.fillRect(currentChartWidth + 2, entryY - 8, priceAxisWidth - 4, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`E:${rec.entry.toFixed(2)}`, currentChartWidth + 4, entryY + 4);

      if (rec.conservativeEntry) {
        const consY = getY(rec.conservativeEntry);
        ctx.fillStyle = '#B45309';
        ctx.fillRect(currentChartWidth + 2, consY - 7, priceAxisWidth - 4, 14);
        ctx.fillStyle = '#FEF3C7';
        ctx.fillText(`50%:${rec.conservativeEntry.toFixed(2)}`, currentChartWidth + 4, consY + 3);
      }

      ctx.fillStyle = '#DC2626';
      ctx.fillRect(currentChartWidth + 2, slY - 8, priceAxisWidth - 4, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`SL:${rec.stopLoss.toFixed(2)}`, currentChartWidth + 4, slY + 4);

      ctx.fillStyle = '#059669';
      ctx.fillRect(currentChartWidth + 2, tp2Y - 8, priceAxisWidth - 4, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`TP2:${rec.takeProfit2.toFixed(2)}`, currentChartWidth + 4, tp2Y + 4);

      // S.E.T. Annotation labels on chart
      ctx.font = '10px "Cabinet Grotesk", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FCA5A5';
      ctx.fillText(`Hard SL (${rec.bufferAtrMultiplier.toFixed(2)}x ATR Buffer)`, currentChartWidth - 8, slY + (rec.side === 'long' ? 12 : -5));
      ctx.fillStyle = '#6EE7B7';
      ctx.fillText(`TP1 (1:2 R:R De-Risk)`, currentChartWidth - 8, tp1Y + (rec.side === 'long' ? 12 : -5));
      ctx.fillStyle = '#34D399';
      ctx.fillText(`TP2 (Opposing Zone Proximal: 1:${Number(rec.riskRewardRatio).toFixed(1)} R:R)`, currentChartWidth - 8, tp2Y + (rec.side === 'long' ? -5 : 12));
    }

    // 7. Latest Price Banner on Price Axis
    const latestCandle = candles[candles.length - 1];
    if (latestCandle) {
      const curY = getY(latestCandle.close);
      const isUp = latestCandle.close >= latestCandle.open;
      ctx.fillStyle = isUp ? '#10B981' : '#F43F5E';
      ctx.fillRect(currentChartWidth + 1, curY - 9, priceAxisWidth - 2, 18);
      ctx.fillStyle = '#0B0F17';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(latestCandle.close.toFixed(2), currentChartWidth + 6, curY + 4);

      // Current Price Horizontal Guideline
      ctx.strokeStyle = isUp ? 'rgba(16, 185, 129, 0.6)' : 'rgba(244, 63, 94, 0.6)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(0, curY);
      ctx.lineTo(currentChartWidth, curY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Session VWAP Tag on Price Axis (Amber Gold)
    if (showVwap && latestVwapPoint) {
      const vwapY = getY(latestVwapPoint.vwap);
      if (vwapY >= 0 && vwapY <= height - timeAxisHeight) {
        ctx.fillStyle = '#D97706';
        ctx.fillRect(currentChartWidth + 1, vwapY - 7, priceAxisWidth - 2, 14);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`VWAP:${latestVwapPoint.vwap.toFixed(1)}`, currentChartWidth + 3, vwapY + 3.5);
      }
    }

    // 8. Crosshair & Value Pointer (if hovering)
    if (crosshairPos && crosshairPos.x < currentChartWidth && crosshairPos.y < chartHeight + volumeHeight) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([4, 4]);

      // Vertical line snapped to hovered candle center if available
      const hoverGlobalIdx = Math.floor(startIndex + crosshairPos.x / candleSpacing);
      const snappedX = hoverGlobalIdx >= 0 && hoverGlobalIdx < candles.length ? getX(hoverGlobalIdx) : crosshairPos.x;

      ctx.beginPath();
      ctx.moveTo(snappedX, 0);
      ctx.lineTo(snappedX, height - timeAxisHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, crosshairPos.y);
      ctx.lineTo(currentChartWidth, crosshairPos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Floating price pill on right axis
      const hoverPrice = getPriceFromY(crosshairPos.y);
      ctx.fillStyle = '#0284C7';
      ctx.fillRect(currentChartWidth + 2, crosshairPos.y - 9, priceAxisWidth - 4, 18);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1;
      ctx.strokeRect(currentChartWidth + 2, crosshairPos.y - 9, priceAxisWidth - 4, 18);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(hoverPrice.toFixed(2), currentChartWidth + 6, crosshairPos.y + 4);

      // Floating Time Pill on bottom axis
      if (hoveredCandle) {
        const hoverTs = typeof hoveredCandle.time === 'number' && !isNaN(hoveredCandle.time) && hoveredCandle.time > 0
          ? hoveredCandle.time
          : Date.parse(hoveredCandle.dateStr) || Date.now();
        const { axisLabel } = formatTimeWithZone(hoverTs, tzMode, hourShift);
        const pillText = axisLabel;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(pillText).width;
        const pillW = textWidth + 16;
        const pillX = Math.max(2, Math.min(currentChartWidth - pillW - 2, snappedX - pillW / 2));
        const pillY = height - timeAxisHeight + 4;
        const pillH = timeAxisHeight - 8;

        ctx.fillStyle = '#0284C7';
        ctx.fillRect(pillX, pillY, pillW, pillH);
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1;
        ctx.strokeRect(pillX, pillY, pillW, pillH);

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(pillText, pillX + pillW / 2, pillY + pillH / 2 + 3);
      }
    }
  }, [
    candles,
    zones,
    volatilityMetrics,
    selectedRecommendation,
    selectedZoneId,
    candleSpacing,
    startIndex,
    chartWidth,
    crosshairPos,
    hoveredCandle,
    hoveredZone,
    showDemand,
    showSupply,
    showMitigated,
    showVwap,
    sessionVwap,
    latestVwapPoint,
    showAtrBands,
    showTradeSetup,
    showVolume,
    tzMode,
    hourShift,
    recentOnlyZones,
  ]);

  // Identify if a point (x, y) on canvas falls within any active zone
  const findZoneAtPoint = (x: number, y: number): SupplyDemandZone | null => {
    if (!priceBoundsRef.current || candles.length === 0) return null;
    const { maxPrice, priceRange, chartHeight } = priceBoundsRef.current;
    if (chartHeight <= 0 || priceRange <= 0) return null;

    const price = maxPrice - (y / chartHeight) * priceRange;
    const globalIdx = Math.floor(startIndex + x / candleSpacing);

    let active = zones.filter(z => {
      if (z.isMitigated && !showMitigated) return false;
      if (z.type === 'demand' && !showDemand) return false;
      if (z.type === 'supply' && !showSupply) return false;
      return true;
    });

    if (recentOnlyZones) {
      const recentDemand = active.filter(z => z.type === 'demand' && !z.isMitigated).slice(0, 1);
      const recentSupply = active.filter(z => z.type === 'supply' && !z.isMitigated).slice(0, 1);
      const recentMitigated = showMitigated ? active.filter(z => z.isMitigated).slice(0, 1) : [];
      active = [...recentDemand, ...recentSupply, ...recentMitigated];
    }

    return active.find(z => {
      let actualStart = z.startIndex;
      if (z.startTime) {
        const found = candles.findIndex(c => c.time === z.startTime);
        if (found !== -1) actualStart = found;
      }
      let actualEnd = candles.length - 1;
      if (z.isMitigated) {
        if (z.mitigatedTime) {
          const foundM = candles.findIndex(c => c.time === z.mitigatedTime);
          if (foundM !== -1) actualEnd = foundM;
          else if (z.mitigatedIndex !== undefined) actualEnd = z.mitigatedIndex;
        } else if (z.mitigatedIndex !== undefined) {
          actualEnd = z.mitigatedIndex;
        }
      }

      const inX = globalIdx >= actualStart && (z.isMitigated ? globalIdx <= actualEnd : true);
      const inY = price >= Math.min(z.low, z.high) && price <= Math.max(z.low, z.high);
      return inX && inY;
    }) || null;
  };

  // Mouse Handlers for Pan, Zoom & Crosshair Inspection (Fixed-Width System)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartOffset(startIndex);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCrosshairPos({ x, y });

    // Identify hovered candle in fixed-width coordinates
    const globalIdx = Math.floor(startIndex + x / candleSpacing);

    if (globalIdx >= 0 && globalIdx < candles.length) {
      setHoveredCandle(candles[globalIdx]);
    } else {
      setHoveredCandle(null);
    }

    // Check if hovering a zone with accurate 2D coordinate + price hit testing
    const matchedZone = findZoneAtPoint(x, y);
    setHoveredZone(matchedZone);

    // Pan chart if dragging
    if (isDragging) {
      const deltaX = e.clientX - dragStartX;
      const deltaBars = deltaX / candleSpacing;
      const newStart = Math.max(0, Math.min(candles.length - 5, dragStartOffset - deltaBars));
      setStartIndex(newStart);
      const isAtEnd = newStart >= candles.length - visibleBarsCount - 2;
      setIsLiveFollowing(isAtEnd);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Avoid triggering selection when user was panning/dragging
    if (Math.abs(e.clientX - dragStartX) > 4) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const clickedZone = findZoneAtPoint(x, y);
    if (clickedZone) {
      onSelectZone(clickedZone);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setCrosshairPos(null);
    setHoveredCandle(null);
    setHoveredZone(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Zoom factor adjustments
    const zoomFactor = e.deltaY > 0 ? 0.88 : 1.14;
    const newSpacing = Math.max(3, Math.min(48, Math.round(candleSpacing * zoomFactor)));
    if (newSpacing === candleSpacing) return;

    // Anchor zoom around cursor position so cursor stays locked to the same candle
    const cursorGlobalIdx = startIndex + mouseX / candleSpacing;
    const newStart = Math.max(0, Math.min(candles.length - 5, cursorGlobalIdx - mouseX / newSpacing));

    setCandleSpacing(newSpacing);
    setStartIndex(newStart);
  };

  const handleZoom = (inOut: 'in' | 'out') => {
    const factor = inOut === 'in' ? 1.25 : 0.8;
    const newSpacing = Math.max(3, Math.min(48, Math.round(candleSpacing * factor)));
    if (newSpacing === candleSpacing) return;

    const centerGlobalIdx = startIndex + (chartWidth / 2) / candleSpacing;
    const newStart = Math.max(0, Math.min(candles.length - 5, centerGlobalIdx - (chartWidth / 2) / newSpacing));

    setCandleSpacing(newSpacing);
    setStartIndex(newStart);
  };

  const handleResetView = () => {
    const defaultSpacing = 12;
    const visibleBars = Math.floor(chartWidth / defaultSpacing);
    setCandleSpacing(defaultSpacing);
    setStartIndex(Math.max(0, candles.length - visibleBars + 3));
    setIsLiveFollowing(true);
  };

  const handleJumpToLive = () => {
    const visibleBars = Math.floor(chartWidth / candleSpacing);
    setStartIndex(Math.max(0, candles.length - visibleBars + 3));
    setIsLiveFollowing(true);
  };

  const currentCandle = hoveredCandle || candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = currentCandle && prevCandle ? currentCandle.close - prevCandle.close : 0;
  const changePercent = prevCandle ? (priceChange / prevCandle.close) * 100 : 0;

  return (
    <div className="flex flex-col h-full w-full bg-[#0B0F17] rounded-lg border border-slate-800/80 overflow-hidden shadow-2xl relative" ref={containerRef}>
      {/* 1. HUD & Metrics Strip */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-[#0F172A]/70 text-xs backdrop-blur-sm z-10 gap-y-2">
        {/* Left: Asset, Current OHLCV */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-slate-100 text-sm tracking-wide">{symbol}</span>

            {/* Frequency / Timeframe Selector with 1m and 5m Intraday */}
            <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded p-0.5">
              {[
                { freq: 1, label: '1m', badge: '⚡ Scalp' },
                { freq: 5, label: '5m', badge: '🔥 Mom' },
                { freq: 15, label: '15m' },
                { freq: 30, label: '30m' },
                { freq: 60, label: '1H' },
                { freq: 240, label: '4H' },
                { freq: 1440, label: '1D' },
              ].map((item) => {
                const isActive = frequency === item.freq;
                return (
                  <button
                    key={item.freq}
                    onClick={() => onFrequencyChange && onFrequencyChange(item.freq)}
                    className={`px-1.5 py-0.5 text-[10px] font-mono font-medium rounded transition-all cursor-pointer flex items-center gap-1 ${
                      isActive
                        ? 'bg-sky-500 text-white font-bold shadow-sm shadow-sky-500/30'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
                    }`}
                    title={`Switch chart to ${item.label} frequency`}
                  >
                    <span>{item.label}</span>
                    {item.freq === 1 && (
                      <span className={`text-[8px] font-sans ${isActive ? 'text-sky-100' : 'text-emerald-400 font-bold'}`}>
                        ⚡
                      </span>
                    )}
                    {item.freq === 5 && (
                      <span className={`text-[8px] font-sans ${isActive ? 'text-sky-100' : 'text-amber-400 font-bold'}`}>
                        🔥
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Real-Time vs Delay Data Feed Badge */}
            {dataSourceInfo && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border border-slate-800 bg-slate-900/90 ml-1">
                <span className={`w-1.5 h-1.5 rounded-full ${dataSourceInfo.isRealtime ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className={dataSourceInfo.isRealtime ? 'text-emerald-300 font-medium' : 'text-amber-300'}>
                  {dataSourceInfo.isRealtime ? 'Schwab Real-Time' : 'Exchange Feed (15m delay)'}
                </span>
                {dataSourceInfo.lastUpdated && (
                  <span className="text-slate-500 hidden xl:inline">· {dataSourceInfo.lastUpdated}</span>
                )}
                {onRefreshData && (
                  <button
                    onClick={onRefreshData}
                    disabled={isRefreshing}
                    className="text-slate-400 hover:text-white transition-colors cursor-pointer ml-0.5"
                    title="Refresh Live Market Data"
                  >
                    <RotateCcw className={`w-2.5 h-2.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
                  </button>
                )}
              </div>
            )}

            {/* Live Following vs History Inspection Indicator */}
            {isLiveFollowing ? (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border border-emerald-900/60 bg-emerald-950/40 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold">Live Follow</span>
              </div>
            ) : (
              <button
                onClick={handleJumpToLive}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border border-amber-600/80 bg-amber-950/70 hover:bg-amber-900/90 text-amber-200 transition-colors cursor-pointer shadow-sm animate-pulse"
                title="Chart is currently paused on historical candles. Click to jump back to the live real-time bar!"
              >
                <span>⏸ History</span>
                <span className="font-bold underline text-amber-100">Live ➔</span>
              </button>
            )}
          </div>

          {currentCandle && (
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <div>
                <span className="text-slate-500">O </span>
                <span className="text-slate-300">{currentCandle.open.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">H </span>
                <span className="text-slate-300">{currentCandle.high.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">L </span>
                <span className="text-slate-300">{currentCandle.low.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">C </span>
                <span className={currentCandle.close >= currentCandle.open ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                  {currentCandle.close.toFixed(2)}
                </span>
              </div>
              <div className={priceChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({changePercent.toFixed(2)}%)
              </div>
              <div className="hidden md:block text-slate-500">
                Vol <span className="text-slate-300">{currentCandle.volume.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Volatility & Active Zone HUD */}
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded border border-slate-800">
            <span className="text-slate-400">ATR(14):</span>
            <span className="text-sky-400 font-semibold">${volatilityMetrics.atr.toFixed(2)}</span>
            <span className="text-slate-500">({volatilityMetrics.atrPercent.toFixed(2)}%)</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded border border-slate-800">
            <span className="text-slate-400">Regime:</span>
            <span className={`font-medium ${
              volatilityMetrics.regime.includes('Squeeze') ? 'text-amber-400' :
              volatilityMetrics.regime.includes('Expansion') ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              {volatilityMetrics.regime}
            </span>
          </div>

          {latestVwapPoint && (
            <div className="hidden xl:flex items-center gap-1.5 bg-amber-950/40 px-2.5 py-1 rounded border border-amber-800/60 text-amber-300">
              <span className="text-amber-400 font-semibold">VWAP:</span>
              <span className="font-bold">${latestVwapPoint.vwap.toFixed(2)}</span>
              <span className="text-amber-400/80 text-[10px]">(±1σ: ${latestVwapPoint.lower1} - ${latestVwapPoint.upper1})</span>
            </div>
          )}

          {hoveredZone && (
            <div className="hidden lg:flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded border border-slate-800 text-slate-300">
              <span className={hoveredZone.type === 'demand' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                {hoveredZone.type === 'demand' ? 'Demand' : 'Supply'} ({hoveredZone.pattern}):
              </span>
              <span>${hoveredZone.low.toFixed(2)} - ${hoveredZone.high.toFixed(2)}</span>
              <span className="text-slate-500">· Score {hoveredZone.strengthScore}%</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Interactive Chart Canvas Viewport */}
      <div className="flex-1 w-full min-h-0 relative cursor-crosshair">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
        />

        {/* Floating Quick Action Overlay Controls (top-left inside canvas, keeping bottom time axis 100% visible) */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1 rounded-lg backdrop-blur-md z-20 shadow-lg">
          <button
            onClick={() => handleZoom('in')}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Zoom In (Scroll Up)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleZoom('out')}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Zoom Out (Scroll Down)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetView}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Reset to Latest View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-slate-800 mx-0.5" />

          {/* Layer toggles */}
          <button
            onClick={() => setRecentOnlyZones(!recentOnlyZones)}
            className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              recentOnlyZones ? 'bg-sky-950/80 text-sky-300 border border-sky-800/60 font-semibold' : 'text-slate-500 hover:text-slate-300'
            }`}
            title={recentOnlyZones ? "Showing strictly the single most recent active Demand and Supply zone" : "Showing all historical detected zones"}
          >
            {recentOnlyZones ? '⚡ Recent (1 D / 1 S)' : 'All Historical'}
          </button>
          <button
            onClick={() => setShowDemand(!showDemand)}
            className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              showDemand ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Demand Zones
          </button>
          <button
            onClick={() => setShowSupply(!showSupply)}
            className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              showSupply ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Supply Zones
          </button>
          <button
            onClick={() => setShowMitigated(!showMitigated)}
            className={`hidden sm:inline-block px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              showMitigated ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/60' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Mitigated Zones
          </button>
          <button
            onClick={() => setShowVwap(!showVwap)}
            className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              showVwap ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60 font-semibold' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Session VWAP with ±1σ / ±2σ Standard Deviation Bands"
          >
            ⚡ VWAP (±2σ)
          </button>
          <button
            onClick={() => setShowAtrBands(!showAtrBands)}
            className={`hidden md:inline-block px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              showAtrBands ? 'bg-sky-950/80 text-sky-300 border border-sky-800/60' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            ATR Volatility Bands
          </button>
          <button
            onClick={() => setShowTradeSetup(!showTradeSetup)}
            className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              showTradeSetup ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Trade Targets
          </button>
        </div>
      </div>

      {/* 3. Dedicated Persistent Bottom Time & Terminal Bar (ALWAYS VISIBLE AT THE BOTTOM) */}
      <div className="w-full bg-[#080C14] border-t border-slate-800/90 px-3 py-2 flex flex-wrap items-center justify-between gap-y-2 text-xs font-mono z-20 shrink-0 select-none">
        {/* Left: Active / Hovered Candle Datetime & Stats (Always visible!) */}
        <div className="flex items-center gap-3">
          {hoveredCandle ? (
            <div className="flex items-center gap-2 text-slate-300">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
              </span>
              <span className="text-slate-400 font-medium">Bar Time:</span>
              <span className="text-sky-300 font-bold tracking-tight">
                {formatTimeWithZone(hoveredCandle.time || Date.parse(hoveredCandle.dateStr) || Date.now(), tzMode, hourShift).fullDisplay}
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">O: <span className="text-slate-200">{hoveredCandle.open.toFixed(2)}</span></span>
              <span className="text-slate-400">H: <span className="text-slate-200">{hoveredCandle.high.toFixed(2)}</span></span>
              <span className="text-slate-400">L: <span className="text-slate-200">{hoveredCandle.low.toFixed(2)}</span></span>
              <span className="text-slate-400">C: <span className={hoveredCandle.close >= hoveredCandle.open ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>{hoveredCandle.close.toFixed(2)}</span></span>
              <span className="text-slate-500 hidden xl:inline">· Vol {hoveredCandle.volume.toLocaleString()}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-slate-400 font-medium">Latest Bar:</span>
              <span className="text-slate-100 font-bold tracking-tight">
                {currentCandle
                  ? formatTimeWithZone(currentCandle.time || Date.parse(currentCandle.dateStr) || Date.now(), tzMode, hourShift).fullDisplay
                  : 'Awaiting feed...'}
              </span>
              {currentCandle && (
                <>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-400">Close: <span className="text-emerald-400 font-semibold">${currentCandle.close.toFixed(2)}</span></span>
                  <span className="text-slate-500 hidden sm:inline">(Hover canvas for bar time)</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Center: Live Real-Time Wall Clock, Active Frequency & Session */}
        <div className="hidden md:flex items-center gap-2.5 px-2.5 py-1 rounded bg-slate-900/90 border border-slate-800 text-[11px]">
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-950/70 border border-sky-800/60 text-[10px] text-sky-300 font-bold">
            {frequency === 1 ? '⚡ 1m Scalp' : frequency === 5 ? '🔥 5m Intraday' : frequency === 15 ? '15m Day' : frequency === 30 ? '30m Tactical' : frequency === 60 ? '1H Swing' : frequency === 240 ? '4H Trend' : '1D Daily'}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-400">Live Clock:</span>
          <span className="text-emerald-300 font-bold tracking-wider">{liveClockFormatted}</span>
          <span className="text-slate-500 font-medium">({tzMode}{hourShift !== 0 ? (hourShift > 0 ? `+${hourShift}h` : `${hourShift}h`) : ''})</span>
        </div>

        {/* Right: Timezone Mode & Hour Shift Controls */}
        <div className="flex items-center gap-2.5">
          {/* Timezone Selector Buttons */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-[10px]">
            {(['ET', 'CT', 'LOCAL', 'UTC'] as TimezoneMode[]).map(tz => (
              <button
                key={tz}
                onClick={() => handleSetTzMode(tz)}
                className={`px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                  tzMode === tz
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={
                  tz === 'ET' ? 'Eastern Time (US Equities NY 9:30 AM)' :
                  tz === 'CT' ? 'Central Time (Chicago CME Futures 8:30 AM)' :
                  tz === 'LOCAL' ? 'Your Local Timezone' : 'Coordinated Universal Time (UTC)'
                }
              >
                {tz === 'LOCAL' ? 'Local' : tz}
              </button>
            ))}
          </div>

          {/* Hour Shift Adjustment Controls */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-[10px]" title="Shift time scale by ±1 hour to adjust for timezone, futures exchange, or broker difference">
            <button
              onClick={() => handleSetHourShift(-1)}
              className="px-1.5 py-0.5 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded transition-colors font-mono font-bold cursor-pointer"
              title="Shift time scale 1 hour back (-1h)"
            >
              -1h
            </button>
            <span className={`px-1.5 py-0.5 font-mono text-[10px] ${hourShift !== 0 ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
              {hourShift === 0 ? '0h' : hourShift > 0 ? `+${hourShift}h` : `${hourShift}h`}
            </span>
            <button
              onClick={() => handleSetHourShift(1)}
              className="px-1.5 py-0.5 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded transition-colors font-mono font-bold cursor-pointer"
              title="Shift time scale 1 hour forward (+1h)"
            >
              +1h
            </button>
            {hourShift !== 0 && (
              <button
                onClick={() => handleSetHourShift(0, true)}
                className="ml-1 px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 rounded border border-amber-500/30 font-semibold cursor-pointer"
                title="Reset hour offset to 0"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
