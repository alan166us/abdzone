import { Candle } from '../types/trading';

export interface VwapPoint {
  time: number;
  vwap: number;
  upper1: number;
  lower1: number;
  upper2: number;
  lower2: number;
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
