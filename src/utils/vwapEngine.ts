import { Candle, SessionLiquidityLevels } from '../types/trading';

export interface VwapPoint {
  time: number;
  vwap: number;
  upper1: number;
  lower1: number;
  upper2: number;
  lower2: number;
}

/**
 * Calculates key intraday auction levels from candle series:
 * - PDH (Prior Day High), PDL (Prior Day Low), PDC (Prior Day Close)
 * - ONH (Overnight High), ONL (Overnight Low before 09:30 AM ET)
 * - IB High (Initial Balance High 09:30-10:30 AM ET), IB Low (Initial Balance Low)
 */
export function calculateSessionLiquidityLevels(candles: Candle[]): SessionLiquidityLevels {
  if (candles.length === 0) {
    return { pdh: 0, pdl: 0, pdc: 0, onh: 0, onl: 0, ibHigh: 0, ibLow: 0 };
  }

  // Group candles by calendar date in America/New_York
  const dayMap = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = new Date(c.time);
    const dateStr = d.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    let arr = dayMap.get(dateStr);
    if (!arr) {
      arr = [];
      dayMap.set(dateStr, arr);
    }
    arr.push(c);
  }

  const days = Array.from(dayMap.keys());
  let pdh = 0;
  let pdl = 0;
  let pdc = 0;

  if (days.length >= 2) {
    const priorDayCandles = dayMap.get(days[days.length - 2]) || [];
    if (priorDayCandles.length > 0) {
      pdh = Math.max(...priorDayCandles.map(c => c.high));
      pdl = Math.min(...priorDayCandles.map(c => c.low));
      pdc = priorDayCandles[priorDayCandles.length - 1].close;
    }
  } else {
    // Single session or synthetic slice fallback: use first half as prior auction context
    const half = Math.max(1, Math.floor(candles.length / 2));
    const priorSlice = candles.slice(0, half);
    pdh = Math.max(...priorSlice.map(c => c.high));
    pdl = Math.min(...priorSlice.map(c => c.low));
    pdc = priorSlice[priorSlice.length - 1].close;
  }

  // Current session candles (latest day)
  const currentDayCandles = days.length > 0 ? (dayMap.get(days[days.length - 1]) || candles) : candles;

  // Split into Overnight / Pre-Market (before 09:30 AM ET) and Initial Balance (09:30 - 10:30 AM ET)
  const overnightCandles: Candle[] = [];
  const ibCandles: Candle[] = [];

  for (const c of currentDayCandles) {
    const d = new Date(c.time);
    const timeStr = d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const [hStr, mStr] = timeStr.split(':');
    const hour = parseInt(hStr, 10);
    const minute = parseInt(mStr, 10);
    const minutesOfDay = hour * 60 + minute;

    if (minutesOfDay < 570) {
      // Before 09:30 AM ET
      overnightCandles.push(c);
    } else if (minutesOfDay >= 570 && minutesOfDay <= 630) {
      // 09:30 AM ET to 10:30 AM ET
      ibCandles.push(c);
    }
  }

  let onh = 0;
  let onl = 0;
  if (overnightCandles.length > 0) {
    onh = Math.max(...overnightCandles.map(c => c.high));
    onl = Math.min(...overnightCandles.map(c => c.low));
  } else {
    onh = currentDayCandles[0].high;
    onl = currentDayCandles[0].low;
  }

  let ibHigh = 0;
  let ibLow = 0;
  if (ibCandles.length > 0) {
    ibHigh = Math.max(...ibCandles.map(c => c.high));
    ibLow = Math.min(...ibCandles.map(c => c.low));
  } else {
    const proxyIb = currentDayCandles.slice(0, Math.min(12, currentDayCandles.length));
    ibHigh = Math.max(...proxyIb.map(c => c.high));
    ibLow = Math.min(...proxyIb.map(c => c.low));
  }

  return {
    pdh: Number(pdh.toFixed(2)),
    pdl: Number(pdl.toFixed(2)),
    pdc: Number(pdc.toFixed(2)),
    onh: Number(onh.toFixed(2)),
    onl: Number(onl.toFixed(2)),
    ibHigh: Number(ibHigh.toFixed(2)),
    ibLow: Number(ibLow.toFixed(2)),
  };
}

export function calculateSessionVwap(
  candles: Candle[],
  options?: { useRthReset?: boolean }
): VwapPoint[] {
  const useRthReset = options?.useRthReset !== false;
  let cumVolume = 0;
  let cumTypicalVolume = 0;
  let cumVolPriceSq = 0;

  let currentDay = '';
  let rthResetDoneForDay = false;
  const result: VwapPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const d = new Date(c.time);
    const dateStr = d.toLocaleDateString('en-US', { timeZone: 'America/New_York' });

    // Session reset at start of new day
    if (dateStr !== currentDay) {
      currentDay = dateStr;
      rthResetDoneForDay = false;
      cumVolume = 0;
      cumTypicalVolume = 0;
      cumVolPriceSq = 0;
    }

    // US Regular Trading Hours (09:30 AM ET) session reset so overnight/Globex drift does not distort the daytime value area
    if (useRthReset && !rthResetDoneForDay) {
      const timeStr = d.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      const [hStr, mStr] = timeStr.split(':');
      const hour = parseInt(hStr, 10);
      const minute = parseInt(mStr, 10);

      // Check if candle reaches or enters 09:30 AM ET
      if (hour > 9 || (hour === 9 && minute >= 30)) {
        rthResetDoneForDay = true;
        cumVolume = 0;
        cumTypicalVolume = 0;
        cumVolPriceSq = 0;
      }
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;

    cumVolume += vol;
    cumTypicalVolume += typicalPrice * vol;
    cumVolPriceSq += typicalPrice * typicalPrice * vol;

    const vwap = cumTypicalVolume / Math.max(1, cumVolume);
    const variance = Math.max(0, (cumVolPriceSq / Math.max(1, cumVolume)) - (vwap * vwap));
    const stdDev = Math.sqrt(variance);

    result.push({
      time: c.time,
      vwap: Number(vwap.toFixed(2)),
      upper1: Number((vwap + stdDev).toFixed(2)),
      lower1: Number((vwap - stdDev).toFixed(2)),
      upper2: Number((vwap + stdDev * 2.0).toFixed(2)),
      lower2: Number((vwap - stdDev * 2.0).toFixed(2)),
    });
  }

  return result;
}

/**
 * Validates a zone against institutional VWAP alignment
 */
export function getZoneVwapConfluence(
  zoneType: 'demand' | 'supply',
  entryPrice: number,
  currentVwapPoint?: VwapPoint,
  dataSource?: string
): { scoreBonus: number; tag: string } {
  // If active market data source is 'synthetic', set VWAP confluence score to 0 to prevent synthetic volume from biasing recommendations
  if (dataSource === 'synthetic') {
    return { scoreBonus: 0, tag: 'Synthetic Mode (VWAP Neutral)' };
  }

  if (!currentVwapPoint) return { scoreBonus: 0, tag: 'No VWAP Data' };

  if (zoneType === 'demand') {
    // Prime: Entry occurs below VWAP at or beyond -2.0 SD (extreme institutional discount)
    if (entryPrice <= currentVwapPoint.lower2) {
      return { scoreBonus: 20, tag: 'High-Value: -2σ VWAP Exhaustion (+20)' };
    }
    if (entryPrice <= currentVwapPoint.lower1) {
      return { scoreBonus: 20, tag: 'Discount: -1σ VWAP Band (+20)' };
    }
  } else {
    // Prime: Short entry occurs above VWAP at or beyond +2.0 SD (extreme institutional premium)
    if (entryPrice >= currentVwapPoint.upper2) {
      return { scoreBonus: 20, tag: 'High-Value: +2σ VWAP Exhaustion (+20)' };
    }
    if (entryPrice >= currentVwapPoint.upper1) {
      return { scoreBonus: 20, tag: 'Premium: +1σ VWAP Band (+20)' };
    }
  }

  return { scoreBonus: 0, tag: 'Neutral VWAP Alignment' };
}
