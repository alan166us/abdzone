import { Candle, SupplyDemandZone, ZonePattern, ZoneType } from '../types/trading';
import { calculateATR } from './volatility';
import { calculateSessionVwap, getZoneVwapConfluence } from './vwapEngine';

export interface ZoneDetectorOptions {
  atrPeriod?: number;
  minImpulseMultiplier?: number;
  maxBaseCandles?: number;
  useWickForBoundary?: boolean;
  recentOnly?: boolean;
  maxRecentZonesPerType?: number;
  includeMitigated?: boolean;
  dataSource?: string;
}

function calculateEMA(candles: Candle[], period: number): number[] {
  const k = 2 / (period + 1);
  const emaArray: number[] = new Array(candles.length).fill(0);
  if (candles.length < period) return emaArray;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  let currentEma = sum / period;
  emaArray[period - 1] = currentEma;
  for (let i = period; i < candles.length; i++) {
    currentEma = candles[i].close * k + currentEma * (1 - k);
    emaArray[i] = currentEma;
  }
  return emaArray;
}

export function detectSupplyDemandZones(
  candles: Candle[],
  options: ZoneDetectorOptions = {}
): SupplyDemandZone[] {
  const {
    atrPeriod = 14,
    minImpulseMultiplier = 1.20,
    maxBaseCandles = 5,
    useWickForBoundary = true,
    recentOnly = true,
    maxRecentZonesPerType = 3,
    includeMitigated = false,
    dataSource,
  } = options;

  if (candles.length < 20) return [];

  const atrs = calculateATR(candles, atrPeriod);
  const ema20 = calculateEMA(candles, 20);
  const ema50 = calculateEMA(candles, Math.min(50, Math.floor(candles.length / 2)));
  const sessionVwap = calculateSessionVwap(candles);
  const currentVwapPoint = sessionVwap[sessionVwap.length - 1];
  const rawZones: SupplyDemandZone[] = [];

  for (let i = 6; i < candles.length - 1; i++) {
    const candle = candles[i];
    const atr = atrs[i] || 1;
    const bodySize = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const isErc = bodySize >= atr * minImpulseMultiplier && (range > 0 ? (bodySize / range) >= 0.52 : false);
    if (!isErc) continue;

    const isBullishImpulse = candle.close > candle.open;
    const isBearishImpulse = candle.close < candle.open;

    let impulseStartIdx = i;
    for (let back = 1; back <= 2; back++) {
      const prevIdx = i - back;
      if (prevIdx < 2) break;
      const prevC = candles[prevIdx];
      const prevBody = Math.abs(prevC.close - prevC.open);
      const prevSameDirection = isBullishImpulse ? prevC.close > prevC.open : prevC.close < prevC.open;
      if (prevSameDirection && prevBody >= atr * 0.8) impulseStartIdx = prevIdx;
      else break;
    }

    let baseStartIdx = -1;
    let baseEndIdx = impulseStartIdx - 1;
    const effectiveMaxBaseCandles = Math.min(5, maxBaseCandles);

    for (let k = 0; k < effectiveMaxBaseCandles; k++) {
      const idx = baseEndIdx - k;
      if (idx < 2) break;
      const bCandle = candles[idx];
      const currentAtr = atrs[idx] || atr;
      const bBody = Math.abs(bCandle.close - bCandle.open);
      const bRange = bCandle.high - bCandle.low;
      const isIndecision = bRange > 0 ? (bBody / bRange) <= 0.55 : true;
      const isTightRange = bBody <= (currentAtr * 0.65) && bRange <= (currentAtr * 1.10);
      if (isIndecision || isTightRange) baseStartIdx = idx;
      else break;
    }

    if (baseStartIdx === -1) continue;
    const baseCandles = candles.slice(baseStartIdx, baseEndIdx + 1);
    if (baseCandles.length === 0 || baseCandles.length > effectiveMaxBaseCandles) continue;

    const volLookback = Math.min(20, baseStartIdx);
    let volSum = 0;
    let validVolCount = 0;
    for (let v = baseStartIdx - volLookback; v < baseStartIdx; v++) {
      if (candles[v].volume && candles[v].volume > 0) {
        volSum += candles[v].volume;
        validVolCount++;
      }
    }
    const avgVolume = validVolCount > 0 ? (volSum / validVolCount) : (candle.volume || 1);
    const volumeImbalanceRatio = (candle.volume && avgVolume > 0)
      ? Number((candle.volume / avgVolume).toFixed(2))
      : 1.0;

    const preBaseCandle = candles[Math.max(0, baseStartIdx - 1)];
    const preBase2 = candles[Math.max(0, baseStartIdx - 2)];
    const wasDroppingBeforeBase = preBaseCandle.close < preBase2.close || preBaseCandle.close < preBaseCandle.open;
    const wasRallyingBeforeBase = preBaseCandle.close > preBase2.close || preBaseCandle.close > preBaseCandle.open;

    const baseHighs = baseCandles.map(c => c.high);
    const baseLows = baseCandles.map(c => c.low);
    const baseUpperBodies = baseCandles.map(c => Math.max(c.open, c.close));
    const baseLowerBodies = baseCandles.map(c => Math.min(c.open, c.close));

    let type: ZoneType;
    let pattern: ZonePattern;
    let zoneHigh: number;
    let zoneLow: number;

    if (isBullishImpulse) {
      type = 'demand';
      pattern = wasDroppingBeforeBase ? 'DBR' : 'RBR';
      zoneHigh = Math.max(...baseUpperBodies);
      zoneLow = Math.min(...baseLows);
    } else if (isBearishImpulse) {
      type = 'supply';
      pattern = wasRallyingBeforeBase ? 'RBD' : 'DBD';
      zoneHigh = Math.max(...baseHighs);
      zoneLow = Math.min(...baseLowerBodies);
    } else {
      continue;
    }

    if (zoneHigh <= zoneLow || (zoneHigh - zoneLow) < atr * 0.05) continue;

    const departureMove = isBullishImpulse ? (candle.high - zoneHigh) : (zoneLow - candle.low);
    const departureVelocity = departureMove / Math.max(0.0001, atr);
    const departurePercent = (departureMove / candles[i].open) * 100;
    const baseLength = baseCandles.length;

    let testedCount = 0;
    let isMitigated = false;
    let mitigatedIndex: number | undefined;
    let mitigatedTime: number | undefined;
    let inRetestMode = false;

    for (let j = i + 1; j < candles.length; j++) {
      const futureCandle = candles[j];
      if (type === 'demand') {
        const isTouching = futureCandle.low <= zoneHigh && futureCandle.high >= zoneLow;
        if (isTouching) {
          if (!inRetestMode) { testedCount++; inRetestMode = true; }
        } else if (futureCandle.low > zoneHigh) {
          inRetestMode = false;
        }
        if (futureCandle.close < zoneLow) {
          isMitigated = true;
          mitigatedIndex = j;
          mitigatedTime = futureCandle.time;
          break;
        }
      } else {
        const isTouching = futureCandle.high >= zoneLow && futureCandle.low <= zoneHigh;
        if (isTouching) {
          if (!inRetestMode) { testedCount++; inRetestMode = true; }
        } else if (futureCandle.high < zoneLow) {
          inRetestMode = false;
        }
        if (futureCandle.close > zoneHigh) {
          isMitigated = true;
          mitigatedIndex = j;
          mitigatedTime = futureCandle.time;
          break;
        }
      }
    }

    let trendConfluence: 'pro-trend' | 'counter-trend' | 'neutral' = 'neutral';
    const currentEma20 = ema20[i] || 0;
    const currentEma50 = ema50[i] || 0;
    if (currentEma20 > 0 && currentEma50 > 0) {
      const isBullishTrend = currentEma20 >= currentEma50 && candle.close >= currentEma50;
      const isBearishTrend = currentEma20 <= currentEma50 && candle.close <= currentEma50;
      if (type === 'demand') {
        trendConfluence = isBullishTrend ? 'pro-trend' : isBearishTrend ? 'counter-trend' : 'neutral';
      } else {
        trendConfluence = isBearishTrend ? 'pro-trend' : isBullishTrend ? 'counter-trend' : 'neutral';
      }
    }

    const confluenceTags: string[] = [];
    let score = 50;

    if (testedCount === 0 && !isMitigated) {
      score += 25;
      confluenceTags.push('Fresh Untested (Max Edge)');
    } else if (testedCount === 1 && !isMitigated) {
      score += 8;
      confluenceTags.push('Tested 1x (Viable)');
    } else if (testedCount >= 2) {
      score -= 22;
      confluenceTags.push('Depleted (Multiple Tests)');
    }
    if (isMitigated) score -= 35;

    if (trendConfluence === 'pro-trend') {
      score += 15;
      confluenceTags.push('Pro-Trend Confluence ★');
    } else if (trendConfluence === 'counter-trend') {
      score -= 10;
      confluenceTags.push('Counter-Trend Scalp');
    }

    if (departureVelocity >= 2.0) {
      score += 15;
      confluenceTags.push('Explosive Departure');
    } else if (departureVelocity >= 1.35) {
      score += 8;
    }

    if (baseLength === 1 || baseLength === 2) {
      score += 12;
      confluenceTags.push('Tight Base Compression');
    } else if (baseLength >= 4) {
      score -= 8;
    }

    if (pattern === 'DBR' || pattern === 'RBD') {
      score += 8;
      confluenceTags.push('Reversal Structure');
    }

    // Volume tags only on real feeds (not synthetic)
    if (dataSource !== 'synthetic' && validVolCount >= 5) {
      if (volumeImbalanceRatio >= 1.6) {
        score += 15;
        confluenceTags.push(`Wholesale Order Flow (${volumeImbalanceRatio.toFixed(1)}x)`);
      } else if (volumeImbalanceRatio >= 1.25) {
        score += 8;
        confluenceTags.push('Institutional Imbalance');
      } else if (volumeImbalanceRatio < 0.8) {
        score -= 6;
      }
    }

    const equilibrium = Number(((zoneHigh + zoneLow) / 2).toFixed(2));
    const proximalLine = type === 'demand' ? Number(zoneHigh.toFixed(2)) : Number(zoneLow.toFixed(2));
    const distalLine = type === 'demand' ? Number(zoneLow.toFixed(2)) : Number(zoneHigh.toFixed(2));
    const vwapAtFormation = sessionVwap[baseEndIdx] ? sessionVwap[baseEndIdx].vwap : undefined;
    const vwapConfluence = getZoneVwapConfluence(type, proximalLine, sessionVwap[baseEndIdx] || currentVwapPoint, dataSource);
    if (vwapConfluence.scoreBonus > 0) {
      score += vwapConfluence.scoreBonus;
      confluenceTags.push(vwapConfluence.tag);
    }

    let heuristicScore = 0;
    if (testedCount === 0) heuristicScore += 30;
    else if (testedCount === 1) heuristicScore += 15;
    if (departureVelocity >= 1.5) heuristicScore += 25;
    if (dataSource !== 'synthetic' && volumeImbalanceRatio >= 1.5) heuristicScore += 25;
    if (vwapConfluence.scoreBonus > 0) heuristicScore += 20;

    let heuristicQualityScore = Math.min(100, Math.max(0, heuristicScore));
    score = heuristicQualityScore;

    const barAge = (candles.length - 1) - baseStartIdx;
    const isDepleted = testedCount >= 2;

    // Age decay applies to both strengthScore and heuristicQualityScore
    if (barAge >= 300 && testedCount === 0) {
      score = Math.round(score * 0.5);
      heuristicQualityScore = score;
      confluenceTags.push('Age Decay (>300 bars untested)');
    } else if (barAge >= 300) {
      score = Math.round(score * 0.6);
      heuristicQualityScore = score;
      confluenceTags.push('Age Decay (>300 bars)');
    }

    if (isDepleted) confluenceTags.push('Depleted (Liquidity Exhausted)');

    const lastCandle = candles[candles.length - 1];
    const currentClose = lastCandle?.close || proximalLine;
    const latestAtr = atrs[candles.length - 1] || atr;
    const distanceToProximal = Math.abs(currentClose - proximalLine);
    const distanceInAtr = Number((distanceToProximal / Math.max(0.0001, latestAtr)).toFixed(2));

    let proximityPhase: import('../types/trading').ProximityPhase = 'Dormant (>1.5x ATR)';
    const isInsideZone = currentClose >= zoneLow && currentClose <= zoneHigh;
    if (isInsideZone || distanceInAtr <= 0.8) proximityPhase = 'Phase B: Zone Touch (Execute)';
    else if (distanceInAtr <= 1.5) proximityPhase = 'Phase A: Staging (1.0–1.5x ATR)';

    const volLabel = (dataSource !== 'synthetic' && validVolCount >= 5)
      ? `, Vol: ${volumeImbalanceRatio.toFixed(1)}x`
      : '';

    rawZones.push({
      id: `${type}-${pattern}-${baseStartIdx}-${Math.round(zoneLow * 100)}`,
      type,
      pattern,
      high: Number(zoneHigh.toFixed(2)),
      low: Number(zoneLow.toFixed(2)),
      equilibrium,
      proximalLine,
      distalLine,
      conservativeEntry: equilibrium,
      startIndex: baseStartIdx,
      endIndex: i,
      startTime: candles[baseStartIdx].time,
      departureVelocity: Number(departureVelocity.toFixed(2)),
      departurePercent: Number(departurePercent.toFixed(2)),
      strengthScore: score,
      testedCount,
      isDepleted,
      isMitigated,
      mitigatedIndex,
      mitigatedTime,
      volatilityAtCreation: Number(atr.toFixed(2)),
      baseLength,
      volumeImbalanceRatio,
      trendConfluence,
      confluenceTags,
      vwapConfluence: vwapConfluence.scoreBonus > 0 ? vwapConfluence : undefined,
      vwapAtFormation,
      heuristicQualityScore,
      barAge,
      distanceInAtr,
      proximityPhase,
      notes: `${pattern} (${type === 'demand' ? 'Demand' : 'Supply'}) Base: ${baseLength}c, Departure: ${departureVelocity.toFixed(1)}x ATR${volLabel}`,
    });
  }

  const recentFirst = [...rawZones].sort((a, b) => b.startIndex - a.startIndex);
  const deduplicatedZones: SupplyDemandZone[] = [];
  for (const zone of recentFirst) {
    const isSupersededByRecent = deduplicatedZones.some(existing => {
      if (existing.type !== zone.type) return false;
      const overlapHigh = Math.min(existing.high, zone.high);
      const overlapLow = Math.max(existing.low, zone.low);
      const hasPriceOverlap = overlapHigh > overlapLow;
      const priceDistance = Math.abs(existing.equilibrium - zone.equilibrium);
      const atrAtTime = zone.volatilityAtCreation || 1;
      return hasPriceOverlap || priceDistance < atrAtTime * 0.85;
    });
    if (!isSupersededByRecent) deduplicatedZones.push(zone);
  }

  let primaryDemandMarked = false;
  let primarySupplyMarked = false;
  for (const z of deduplicatedZones) {
    if (!z.isMitigated) {
      if (z.type === 'demand' && !primaryDemandMarked) {
        z.isRecentPrimary = true;
        primaryDemandMarked = true;
      } else if (z.type === 'supply' && !primarySupplyMarked) {
        z.isRecentPrimary = true;
        primarySupplyMarked = true;
      }
    }
  }

  if (recentOnly) {
    const recentDemand = deduplicatedZones.filter(z => z.type === 'demand' && !z.isMitigated).slice(0, maxRecentZonesPerType);
    const recentSupply = deduplicatedZones.filter(z => z.type === 'supply' && !z.isMitigated).slice(0, maxRecentZonesPerType);
    const result = [...recentDemand, ...recentSupply];
    if (includeMitigated) {
      result.push(...deduplicatedZones.filter(z => z.isMitigated).slice(0, 1));
    }
    return result.sort((a, b) => b.startIndex - a.startIndex);
  }

  return deduplicatedZones.sort((a, b) => b.startIndex - a.startIndex);
}
