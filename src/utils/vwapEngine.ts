import { Candle } from '../types/trading';

export interface VwapPoint {
  time: number;
  vwap: number;
  upper1: number;
  lower1: number;
  upper2: number;
  lower2: number;
}

export function calculateSessionVwap(candles: Candle[]): VwapPoint[] {
  let cumVolume = 0;
  let cumTypicalVolume = 0;
  let cumVolPriceSq = 0;

  let currentDay = '';
  const result: VwapPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const dateStr = new Date(c.time).toLocaleDateString('en-US', { timeZone: 'America/New_York' });

    // Session reset at start of new day (or 9:30 AM ET open)
    if (dateStr !== currentDay) {
      currentDay = dateStr;
      cumVolume = 0;
      cumTypicalVolume = 0;
      cumVolPriceSq = 0;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;

    cumVolume += vol;
    cumTypicalVolume += typicalPrice * vol;
    cumVolPriceSq += typicalPrice * typicalPrice * vol;

    const vwap = cumTypicalVolume / cumVolume;
    const variance = Math.max(0, (cumVolPriceSq / cumVolume) - (vwap * vwap));
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
  currentVwapPoint?: VwapPoint
): { scoreBonus: number; tag: string } {
  if (!currentVwapPoint) return { scoreBonus: 0, tag: 'No VWAP Data' };

  if (zoneType === 'demand') {
    // Prime: Entry occurs below VWAP at or beyond -2.0 SD (extreme institutional discount)
    if (entryPrice <= currentVwapPoint.lower2) {
      return { scoreBonus: 25, tag: 'High-Value: -2σ VWAP Exhaustion' };
    }
    if (entryPrice <= currentVwapPoint.lower1) {
      return { scoreBonus: 15, tag: 'Discount: -1σ VWAP Band' };
    }
  } else {
    // Prime: Short entry occurs above VWAP at or beyond +2.0 SD (extreme institutional premium)
    if (entryPrice >= currentVwapPoint.upper2) {
      return { scoreBonus: 25, tag: 'High-Value: +2σ VWAP Exhaustion' };
    }
    if (entryPrice >= currentVwapPoint.upper1) {
      return { scoreBonus: 15, tag: 'Premium: +1σ VWAP Band' };
    }
  }

  return { scoreBonus: 0, tag: 'Neutral VWAP Alignment' };
}
