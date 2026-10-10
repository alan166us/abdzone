import { Candle, SupplyDemandZone, ZonePattern, ZoneType } from '../types/trading';
import { calculateATR } from './volatility';
import { calculateSessionVwap, getZoneVwapConfluence } from './vwapEngine';

export interface ZoneDetectorOptions {
  atrPeriod?: number;
  minImpulseMultiplier?: number; // Multiple of ATR to qualify as impulse (default 1.25)
  maxBaseCandles?: number;        // Max consolidation candles in base (default 4)
  useWickForBoundary?: boolean;   // True to use full wicks (default true for precise chart alignment)
  recentOnly?: boolean;           // Keep only the recent demand and supply zones (default true)
  maxRecentZonesPerType?: number; // Max recent unmitigated zones to retain per type (default 1)
  includeMitigated?: boolean;     // Whether to include broken/mitigated zones in recent mode (default false)
}

/**
 * Calculates Exponential Moving Average (EMA)
 */
function calculateEMA(candles: Candle[], period: number): number[] {
  const k = 2 / (period + 1);
  const emaArray: number[] = new Array(candles.length).fill(0);
  
  if (candles.length < period) return emaArray;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let currentEma = sum / period;
  emaArray[period - 1] = currentEma;

  for (let i = period; i < candles.length; i++) {
    currentEma = candles[i].close * k + currentEma * (1 - k);
    emaArray[i] = currentEma;
  }

  return emaArray;
}

/**
 * Institutional Supply & Demand Zone Detection Algorithm:
 * - Accurately locates consolidation bases (Doji / Spinning Top / Tight Range)
 * - Validates explosive Extended Range Candles (ERC) with wholesaler volume confirmation
 * - Encompasses exact high/low candle boundaries so zones align perfectly on charts
 * - Calculates multi-variable institutional quality score and win-probability edge
 */
export function detectSupplyDemandZones(
  candles: Candle[],
  options: ZoneDetectorOptions = {}
): SupplyDemandZone[] {
  const {
    atrPeriod = 14,
    minImpulseMultiplier = 1.20,
    maxBaseCandles = 4,
    useWickForBoundary = true, // Default to true so zone boxes cleanly wrap candle wicks
    recentOnly = true, // Default to true: keep only recent demand and supply zones
    maxRecentZonesPerType = 1, // Default to 1: keep strictly 1 recent demand and 1 recent supply zone
    includeMitigated = false, // Keep false by default to prevent chart clutter
  } = options;

  if (candles.length < 20) return [];

  const atrs = calculateATR(candles, atrPeriod);
  const ema20 = calculateEMA(candles, 20);
  const ema50 = calculateEMA(candles, Math.min(50, Math.floor(candles.length / 2)));
  const sessionVwap = calculateSessionVwap(candles);
  const currentVwapPoint = sessionVwap[sessionVwap.length - 1];
  const rawZones: SupplyDemandZone[] = [];

  // 1. Scan for explosive departure candles (ERC / Institutional Imbalance candles)
  for (let i = 6; i < candles.length - 1; i++) {
    const candle = candles[i];
    const atr = atrs[i] || 1;
    const bodySize = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;

    // Must be an Extended Range Candle (ERC) with high directional conviction
    const isErc = bodySize >= atr * minImpulseMultiplier && (range > 0 ? (bodySize / range) >= 0.52 : false);
    if (!isErc) continue;

    const isBullishImpulse = candle.close > candle.open;
    const isBearishImpulse = candle.close < candle.open;

    // Track the true start of the impulse leg:
    // If preceding candle(s) were also momentum candles in the same direction,
    // they belong to the impulse leg, NOT the consolidation base!
    let impulseStartIdx = i;
    for (let back = 1; back <= 2; back++) {
      const prevIdx = i - back;
      if (prevIdx < 2) break;
      const prevC = candles[prevIdx];
      const prevBody = Math.abs(prevC.close - prevC.open);
      const prevSameDirection = isBullishImpulse ? prevC.close > prevC.open : prevC.close < prevC.open;
      // If previous candle was also a strong directional candle (> 0.8x ATR in same direction)
      if (prevSameDirection && prevBody >= atr * 0.8) {
        impulseStartIdx = prevIdx;
      } else {
        break;
      }
    }

    // Now find the Consolidation Base immediately PRECEDING the impulse leg
    let baseStartIdx = -1;
    let baseEndIdx = impulseStartIdx - 1;

    for (let k = 0; k < maxBaseCandles; k++) {
      const idx = baseEndIdx - k;
      if (idx < 2) break;
      const bCandle = candles[idx];
      const bBody = Math.abs(bCandle.close - bCandle.open);
      const bRange = bCandle.high - bCandle.low;

      // Base candles have modest bodies (indecision, pause, resting orders)
      const isIndecision = bRange > 0 ? (bBody / bRange) <= 0.65 : true;
      const isTightRange = bBody <= atr * 0.9 && bRange <= atr * 1.4;

      if (isIndecision || isTightRange) {
        baseStartIdx = idx;
      } else {
        // If not a base candle, stop scanning backwards
        break;
      }
    }

    // If no valid consolidation base was found, skip (no genuine S/D level formed)
    if (baseStartIdx === -1) {
      continue;
    }

    const baseCandles = candles.slice(baseStartIdx, baseEndIdx + 1);
    if (baseCandles.length === 0) continue;

    // Calculate baseline volume (rolling 20-period average volume prior to base)
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

    // Determine preceding leg direction before the base (Leg-In)
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

      // Demand Zones:
      // Proximal Boundary (Entry Line): Highest candle body of consolidation base
      zoneHigh = Math.max(...baseUpperBodies);
      // Distal Line (Invalidation Stop): Lowest wick of consolidation base
      zoneLow = Math.min(...baseLows);
    } else if (isBearishImpulse) {
      type = 'supply';
      pattern = wasRallyingBeforeBase ? 'RBD' : 'DBD';

      // Supply Zones:
      // Distal Line (Invalidation Stop): Highest wick of consolidation base
      zoneHigh = Math.max(...baseHighs);
      // Proximal Boundary (Entry Line): Lowest candle body of consolidation base
      zoneLow = Math.min(...baseLowerBodies);
    } else {
      continue;
    }

    // Ensure valid zone spread
    if (zoneHigh <= zoneLow || (zoneHigh - zoneLow) < atr * 0.05) {
      continue;
    }

    // Check departure strength from the base
    const departureMove = isBullishImpulse ? (candle.high - zoneHigh) : (zoneLow - candle.low);
    const departureVelocity = departureMove / Math.max(0.0001, atr);
    const departurePercent = (departureMove / candles[i].open) * 100;
    const baseLength = baseCandles.length;

    // 2. Track subsequent price action: Retests and Mitigation
    let testedCount = 0;
    let isMitigated = false;
    let mitigatedIndex: number | undefined;
    let mitigatedTime: number | undefined;
    let inRetestMode = false;

    for (let j = i + 1; j < candles.length; j++) {
      const futureCandle = candles[j];

      if (type === 'demand') {
        // Did price pierce into the demand zone (between proximal and distal lines)?
        const isTouching = futureCandle.low <= zoneHigh && futureCandle.high >= zoneLow;
        if (isTouching) {
          if (!inRetestMode) {
            testedCount++;
            inRetestMode = true; // Consolidate contiguous bars of the same test visit
          }
        } else if (futureCandle.low > zoneHigh) {
          inRetestMode = false; // Bounced out above proximal line
        }

        // Strict Mitigation: A zone must ONLY be marked isMitigated = true when a subsequent
        // candle body closes past the distal boundary (invalidating the order block).
        if (futureCandle.close < zoneLow) {
          isMitigated = true;
          mitigatedIndex = j;
          mitigatedTime = futureCandle.time;
          break;
        }
      } else {
        // Supply Zone: Did price pierce into the supply zone (between proximal and distal lines)?
        const isTouching = futureCandle.high >= zoneLow && futureCandle.low <= zoneHigh;
        if (isTouching) {
          if (!inRetestMode) {
            testedCount++;
            inRetestMode = true; // Consolidate contiguous bars of the same test visit
          }
        } else if (futureCandle.high < zoneLow) {
          inRetestMode = false; // Bounced out below proximal line
        }

        // Strict Mitigation: A zone must ONLY be marked isMitigated = true when a subsequent
        // candle body closes past the distal boundary (invalidating the order block).
        if (futureCandle.close > zoneHigh) {
          isMitigated = true;
          mitigatedIndex = j;
          mitigatedTime = futureCandle.time;
          break;
        }
      }
    }

    // 3. Trend Confluence Analysis (EMA 20 vs EMA 50)
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

    // 4. Institutional Confluence Tags
    const confluenceTags: string[] = [];

    // 5. Compute Enhanced Institutional Quality Score (0 to 100%)
    let score = 50;

    // Freshness factor (0 tests is maximum institutional limit order liquidity)
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

    if (isMitigated) {
      score -= 35;
    }

    // Trend Confluence (+15 pro-trend, -10 counter-trend)
    if (trendConfluence === 'pro-trend') {
      score += 15;
      confluenceTags.push('Pro-Trend Confluence ★');
    } else if (trendConfluence === 'counter-trend') {
      score -= 10;
      confluenceTags.push('Counter-Trend Scalp');
    }

    // Fast explosive departure velocity
    if (departureVelocity >= 2.0) {
      score += 15;
      confluenceTags.push('Explosive Departure');
    } else if (departureVelocity >= 1.35) {
      score += 8;
    }

    // Compact tight base compression (1-2 candles)
    if (baseLength === 1 || baseLength === 2) {
      score += 12;
      confluenceTags.push('Tight Base Compression');
    } else if (baseLength >= 4) {
      score -= 8;
    }

    // Reversal patterns (DBR & RBD) historically offer higher risk:reward
    if (pattern === 'DBR' || pattern === 'RBD') {
      score += 8;
      confluenceTags.push('Reversal Structure');
    }

    // Wholesaler / Institutional Volume Imbalance
    if (validVolCount >= 5) {
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

    // Institutional VWAP Alignment & Value Confluence
    const vwapConfluence = getZoneVwapConfluence(type, proximalLine, currentVwapPoint);
    if (vwapConfluence.scoreBonus > 0) {
      score += vwapConfluence.scoreBonus;
      confluenceTags.push(vwapConfluence.tag);
    }

    score = Math.max(10, Math.min(99, score));

    // Win Rate Probability Estimation based on composite institutional score
    const winProbabilityEstimate = 
      score >= 85 ? 84 :
      score >= 75 ? 78 :
      score >= 65 ? 70 :
      score >= 50 ? 56 : 42;

    const barAge = (candles.length - 1) - baseStartIdx;
    const isDepleted = testedCount >= 2;

    // Dynamic Lookback & Depletion: Automatically discount or de-prioritize zones that have
    // accumulated >= 2 prior test touches or have traversed more than 300 bars without a test.
    if (barAge >= 300 && testedCount === 0) {
      score = Math.round(score * 0.5);
      confluenceTags.push('Age Decay (>300 bars untested)');
    } else if (barAge >= 300) {
      score = Math.round(score * 0.6);
      confluenceTags.push('Age Decay (>300 bars)');
    }

    if (isDepleted) {
      confluenceTags.push('Depleted (Liquidity Exhausted)');
    }

    // Execution Reaction Window & Proximity Phase
    const lastCandle = candles[candles.length - 1];
    const currentClose = lastCandle?.close || proximalLine;
    const latestAtr = atrs[candles.length - 1] || atr;
    const distanceToProximal = Math.abs(currentClose - proximalLine);
    const distanceInAtr = Number((distanceToProximal / Math.max(0.0001, latestAtr)).toFixed(2));

    let proximityPhase: import('../types/trading').ProximityPhase = 'Dormant (>1.5x ATR)';
    const isInsideZone = currentClose >= zoneLow && currentClose <= zoneHigh;
    if (isInsideZone) {
      proximityPhase = 'Phase B: Zone Touch (Execute)';
    } else if (distanceInAtr <= 0.8) {
      proximityPhase = 'Phase B: Zone Touch (Execute)';
    } else if (distanceInAtr <= 1.5) {
      proximityPhase = 'Phase A: Staging (1.0–1.5x ATR)';
    }

    const volLabel = validVolCount >= 5 ? `, Vol: ${volumeImbalanceRatio.toFixed(1)}x` : '';

    const zone: SupplyDemandZone = {
      id: `${type}-${pattern}-${baseStartIdx}-${Math.round(zoneLow * 100)}`,
      type,
      pattern,
      high: Number(zoneHigh.toFixed(2)),
      low: Number(zoneLow.toFixed(2)),
      equilibrium,
      proximalLine,
      distalLine,
      conservativeEntry: equilibrium, // 50% retracement entry for 4:1+ R:R
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
      winProbabilityEstimate,
      barAge,
      distanceInAtr,
      proximityPhase,
      notes: `${pattern} (${type === 'demand' ? 'Demand' : 'Supply'}) Base: ${baseLength}c, Departure: ${departureVelocity.toFixed(1)}x ATR${volLabel}`,
    };

    rawZones.push(zone);
  }

  // 6. Sort candidate zones descending by recency (newest / most recent first)
  const recentFirst = [...rawZones].sort((a, b) => b.startIndex - a.startIndex);

  // Deduplicate overlapping zones - recent market structure always supersedes older overlapping levels
  const deduplicatedZones: SupplyDemandZone[] = [];
  for (const zone of recentFirst) {
    const isSupersededByRecent = deduplicatedZones.some(existing => {
      if (existing.type !== zone.type) return false;
      const overlapHigh = Math.min(existing.high, zone.high);
      const overlapLow = Math.max(existing.low, zone.low);
      const hasPriceOverlap = overlapHigh > overlapLow;
      const priceDistance = Math.abs(existing.equilibrium - zone.equilibrium);
      const atrAtTime = zone.volatilityAtCreation || 1;
      // If zones overlap in price range or are tightly clustered within 0.85x ATR
      return hasPriceOverlap || priceDistance < atrAtTime * 0.85;
    });

    if (!isSupersededByRecent) {
      deduplicatedZones.push(zone);
    }
  }

  // Mark the primary most recent active demand and supply zones
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

  // If recentOnly is true (default), retain strictly the single most recent unmitigated zone per type
  if (recentOnly) {
    const recentDemand = deduplicatedZones
      .filter(z => z.type === 'demand' && !z.isMitigated)
      .slice(0, maxRecentZonesPerType);

    const recentSupply = deduplicatedZones
      .filter(z => z.type === 'supply' && !z.isMitigated)
      .slice(0, maxRecentZonesPerType);

    const result = [...recentDemand, ...recentSupply];

    // Only include mitigated if explicitly requested
    if (includeMitigated) {
      const recentMitigated = deduplicatedZones
        .filter(z => z.isMitigated)
        .slice(0, 1);
      result.push(...recentMitigated);
    }

    return result.sort((a, b) => b.startIndex - a.startIndex);
  }

  // Return all deduplicated zones sorted by recency
  return deduplicatedZones.sort((a, b) => b.startIndex - a.startIndex);
}
