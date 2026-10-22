import { Candle, SupplyDemandZone, TradeRecommendation, VolatilityMetrics, BacktestSummary, BacktestTrade, BacktestConfig, EquityPoint } from '../types/trading';
import { getContractPointValue, isFuturesSymbol, isSp500Futures, getFuturesRoot } from './contractSpecs';
import { detectSupplyDemandZones } from './zoneDetector';
import { calculateSessionVwap } from './vwapEngine';

export { getContractPointValue, isFuturesSymbol, isSp500Futures, getFuturesRoot };

export function calculateHeuristicQualityScore(
  zone: SupplyDemandZone,
  _volatilityMetrics?: VolatilityMetrics,
  dataSource?: string
): number {
  let score = 0;
  if (zone.testedCount === 0) score += 30;
  else if (zone.testedCount === 1) score += 15;
  if (zone.departureVelocity >= 1.5) score += 25;
  // Gate wholesale volume points strictly to non-synthetic feeds
  if (
    dataSource !== 'synthetic' &&
    zone.volumeImbalanceRatio !== undefined &&
    zone.volumeImbalanceRatio >= 1.5
  ) {
    score += 25;
  }

  const hasVwapConfluence = Boolean(
    zone.vwapConfluence && zone.vwapConfluence.scoreBonus > 0
  );
  if (hasVwapConfluence) score += 20;
  return Math.min(100, Math.max(0, score));
}

export function generateTradeRecommendations(
  currentPrice: number,
  zones: SupplyDemandZone[],
  volatilityMetrics: VolatilityMetrics,
  symbol: string = 'BTC/USDT',
  dataSource?: string,
  recommendationSource: 'fresh' | 'historical-fallback' = 'fresh',
  candles?: Candle[],
  frequency: number = 5
): TradeRecommendation[] {
  const recommendations: TradeRecommendation[] = [];
  const atr = volatilityMetrics.atr || currentPrice * 0.015;
  const bufferMultiplier = volatilityMetrics.recommendedBufferMultiplier || 1.30;
  const bufferAmount = atr * bufferMultiplier;

  const is1mOr5m = frequency <= 5;
  const isIndexFutures = isSp500Futures(symbol);

  const activeDemandZones = zones
    .filter(z => {
      if (z.type !== 'demand' || z.isMitigated || z.testedCount > 2) return false;
      // Fast Micro-Continuation Triggers (RBR): for 1m and 5m charts, require minimum 2 base candles
      if (is1mOr5m && z.pattern === 'RBR' && (z.baseLength || 1) < 2) return false;
      if (currentPrice < z.low - 0.2 * atr) return false;
      const proximal = z.proximalLine || z.high;
      const distToProximal = Math.max(0, currentPrice - proximal);
      const distInAtr = distToProximal / Math.max(0.0001, atr);
      const isFailedBreakout = Boolean(z.confluenceTags?.some(t => t.includes('Failed Breakout')));
      return distInAtr <= (isFailedBreakout ? 5.0 : 3.5);
    })
    .sort((a, b) => {
      const distA = Math.abs(currentPrice - a.high);
      const distB = Math.abs(currentPrice - b.high);
      if (Math.abs(distA - distB) / currentPrice < 0.01) {
        return (b.heuristicQualityScore ?? b.strengthScore ?? 50) - (a.heuristicQualityScore ?? a.strengthScore ?? 50);
      }
      return distA - distB;
    });

  const activeSupplyZones = zones
    .filter(z => {
      if (z.type !== 'supply' || z.isMitigated || z.testedCount > 2) return false;
      // Fast Micro-Continuation Triggers (DBD): for 1m and 5m charts, require minimum 2 base candles
      if (is1mOr5m && z.pattern === 'DBD' && (z.baseLength || 1) < 2) return false;
      if (currentPrice > z.high + 0.2 * atr) return false;
      const proximal = z.proximalLine || z.low;
      const distToProximal = Math.max(0, proximal - currentPrice);
      const distInAtr = distToProximal / Math.max(0.0001, atr);
      const isFailedBreakout = Boolean(z.confluenceTags?.some(t => t.includes('Failed Breakout')));
      return distInAtr <= (isFailedBreakout ? 5.0 : 3.5);
    })
    .sort((a, b) => {
      const distA = Math.abs(a.low - currentPrice);
      const distB = Math.abs(b.low - currentPrice);
      if (Math.abs(distA - distB) / currentPrice < 0.01) {
        return (b.heuristicQualityScore ?? b.strengthScore ?? 50) - (a.heuristicQualityScore ?? a.strengthScore ?? 50);
      }
      return distA - distB;
    });

  for (const zone of activeDemandZones.slice(0, 3)) {
    if (currentPrice < zone.low - 0.2 * atr) continue;
    const entry = zone.proximalLine || zone.high;
    const conservativeEntry = zone.conservativeEntry || zone.equilibrium;
    const stopLoss = Math.max(0.0001, (zone.distalLine || zone.low) - bufferAmount);
    const riskPerUnit = entry - stopLoss;
    if (riskPerUnit <= 0) continue;
    const overheadSupply = activeSupplyZones.find(s => (s.proximalLine || s.low) > entry);
    const tp1 = entry + riskPerUnit * 2.0;
    const tp2 = overheadSupply ? (overheadSupply.proximalLine || overheadSupply.low) : entry + riskPerUnit * 3.2;
    const tp3 = entry + riskPerUnit * 4.5;
    const distancePercent = ((currentPrice - entry) / currentPrice) * 100;
    const heuristicQualityScore = zone.heuristicQualityScore ?? calculateHeuristicQualityScore(zone, volatilityMetrics, dataSource);
    const distToProximal = Math.abs(currentPrice - entry);
    const distanceInAtr = Number((distToProximal / Math.max(0.0001, atr)).toFixed(2));
    const touchesProximal = currentPrice <= (entry + 0.15 * atr) && currentPrice >= (zone.low - 0.2 * atr);
    const isQualityEligible = heuristicQualityScore >= 60;
    const isRejectionMode = touchesProximal && isQualityEligible;
    const executionMode = isRejectionMode ? 'Execution Mode: Rejection Confirmation' : undefined;
    let proximityPhase: import('../types/trading').ProximityPhase = zone.proximityPhase || 'Dormant (>1.5x ATR)';
    if (touchesProximal) proximityPhase = 'Phase B: Zone Touch (Execute)';
    else if (distanceInAtr <= 1.5) proximityPhase = 'Phase A: Staging (1.0\u20131.5x ATR)';
    else proximityPhase = 'Dormant (>1.5x ATR)';
    const baseTags = zone.confluenceTags && zone.confluenceTags.length > 0 ? zone.confluenceTags.join(' \u00b7 ') : 'Standard Imbalance';
    const tags = isRejectionMode ? `${baseTags} \u00b7 Execution Mode: Rejection Confirmation` : baseTags;
    recommendations.push({
      id: `rec-long-${zone.id}`,
      zoneId: zone.id,
      symbol,
      side: 'long',
      zoneType: 'demand',
      pattern: zone.pattern,
      entry,
      conservativeEntry,
      entryType: isRejectionMode ? 'Rejection Confirmation' : 'Zone Boundary',
      executionMode,
      stopLoss,
      bufferAtrMultiplier: bufferMultiplier,
      bufferAmount,
      takeProfit1: tp1,
      takeProfit2: tp2,
      takeProfit3: tp3,
      riskPerUnit,
      rewardPerUnit1: tp1 - entry,
      rewardPerUnit2: tp2 - entry,
      rewardPerUnit3: tp3 - entry,
      riskRewardRatio: Number(((tp2 - entry) / riskPerUnit).toFixed(1)),
      status: 'active',
      heuristicQualityScore,
      qualityScore: heuristicQualityScore,
      proximityPhase,
      distanceInAtr,
      opposingZoneId: overheadSupply?.id,
      vwapConfluence: zone.vwapConfluence,
      recommendationSource,
      rationale: `S.E.T. Long Plan: [Setup: ${zone.pattern} Demand Zone · ${tags}]. [Entry: $${entry.toFixed(2)}]. [Stop: $${stopLoss.toFixed(2)}]. [TP1: $${tp1.toFixed(2)}].`,
      currentDistancePercent: distancePercent,
    });
  }

  for (const zone of activeSupplyZones.slice(0, 3)) {
    if (currentPrice > zone.high + 0.2 * atr) continue;
    const entry = zone.proximalLine || zone.low;
    const conservativeEntry = zone.conservativeEntry || zone.equilibrium;
    const stopLoss = (zone.distalLine || zone.high) + bufferAmount;
    const riskPerUnit = stopLoss - entry;
    if (riskPerUnit <= 0) continue;
    const lowerDemand = activeDemandZones.find(d => (d.proximalLine || d.high) < entry);
    const tp1 = entry - riskPerUnit * 2.0;
    const tp2 = lowerDemand ? (lowerDemand.proximalLine || lowerDemand.high) : entry - riskPerUnit * 3.2;
    const tp3 = entry - riskPerUnit * 4.5;
    const distancePercent = ((entry - currentPrice) / currentPrice) * 100;
    const heuristicQualityScore = zone.heuristicQualityScore ?? calculateHeuristicQualityScore(zone, volatilityMetrics, dataSource);
    const distToProximal = Math.abs(entry - currentPrice);
    const distanceInAtr = Number((distToProximal / Math.max(0.0001, atr)).toFixed(2));
    const touchesProximal = currentPrice >= (entry - 0.15 * atr) && currentPrice <= (zone.high + 0.2 * atr);
    const isQualityEligible = heuristicQualityScore >= 60;
    const isRejectionMode = touchesProximal && isQualityEligible;
    let proximityPhase: import('../types/trading').ProximityPhase = zone.proximityPhase || 'Dormant (>1.5x ATR)';
    if (touchesProximal) proximityPhase = 'Phase B: Zone Touch (Execute)';
    else if (distanceInAtr <= 1.5) proximityPhase = 'Phase A: Staging (1.0–1.5x ATR)';
    else proximityPhase = 'Dormant (>1.5x ATR)';
    const isFlippedSupply = Boolean(zone.confluenceTags?.some(t => t.includes('Flipped Supply')));
    const isPullbackBelowVwap = Boolean(candles && candles.length >= 3 && distanceInAtr <= 2.5);

    // CME 5-point snapped strike for Put brackets
    const mesStrike = isIndexFutures ? Math.floor(entry / 5) * 5 : Math.floor(entry);
    const putBracketLabel = isIndexFutures
      ? `CME /MES 5-pt Put (${mesStrike}P Bracket)`
      : `Equity Put (${mesStrike}P Bracket)`;

    let execMode = isRejectionMode ? 'Execution Mode: Rejection Confirmation' : undefined;
    if (isPullbackBelowVwap) {
      execMode = isFlippedSupply
        ? 'Pullback to Flipped Supply (Below VWAP · Staged Put)'
        : 'Pullback to Overhead Supply (Below VWAP · Staged Put)';
    }

    const shortRationale = isPullbackBelowVwap
      ? `Downtrend Pullback (${isFlippedSupply ? 'Flipped Supply' : `${zone.pattern} Supply`}): Entry $${entry.toFixed(2)} (within 2.5x ATR). Staged ${putBracketLabel} targeting lower demand.`
      : `S.E.T. Short Plan: [Setup: ${zone.pattern} Supply Zone]. [Entry: $${entry.toFixed(2)}]. [Stop: $${stopLoss.toFixed(2)}]. [TP1: $${tp1.toFixed(2)}].`;

    recommendations.push({
      id: `rec-short-${zone.id}`,
      zoneId: zone.id,
      symbol,
      side: 'short',
      zoneType: 'supply',
      pattern: zone.pattern,
      entry,
      conservativeEntry,
      entryType: isRejectionMode ? 'Rejection Confirmation' : 'Zone Boundary',
      executionMode: execMode,
      stopLoss,
      bufferAtrMultiplier: bufferMultiplier,
      bufferAmount,
      takeProfit1: tp1,
      takeProfit2: tp2,
      takeProfit3: tp3,
      riskPerUnit,
      rewardPerUnit1: entry - tp1,
      rewardPerUnit2: entry - tp2,
      rewardPerUnit3: entry - tp3,
      riskRewardRatio: Number(((entry - tp2) / riskPerUnit).toFixed(1)),
      status: 'active',
      heuristicQualityScore,
      qualityScore: heuristicQualityScore,
      proximityPhase,
      distanceInAtr,
      opposingZoneId: lowerDemand?.id,
      vwapConfluence: zone.vwapConfluence,
      recommendationSource,
      rationale: shortRationale,
      currentDistancePercent: distancePercent,
    });
  }

  // Fast Micro-Continuation Triggers (DBD / RBR) on VWAP
  // Flag any break below VWAP with consecutive lower closes as an active Short Scalp
  // Flag any break above VWAP with consecutive higher closes as an active Long Scalp
  // Stage CME brackets (/MES 5-pt strike) or Equity brackets with 1:2 R:R targets targeting value bands
  const allowContinuation = frequency <= 390 && Boolean(candles && candles.length >= 3);

  if (allowContinuation && candles) {
    const vwapPoints = calculateSessionVwap(candles);
    const latestVwapPoint = vwapPoints[vwapPoints.length - 1];
    if (latestVwapPoint) {
      const cLast = candles[candles.length - 1];
      const cPrev1 = candles[candles.length - 2];
      const cPrev2 = candles[candles.length - 3];

      // 1. Bearish Breakdown (DBD) -> Active Short Scalp targeting lower value bands (-1σ / -2σ)
      const isBelowVwap = cLast.close < latestVwapPoint.vwap;
      const brokeBelowOrBelow = cPrev1.close >= latestVwapPoint.vwap || cPrev2.close >= latestVwapPoint.vwap || isBelowVwap;
      const consecutiveLowerCloses = cLast.close < cPrev1.close && cPrev1.close <= cPrev2.close;

      if (brokeBelowOrBelow && isBelowVwap && consecutiveLowerCloses) {
        const entry = Number(currentPrice.toFixed(2));
        const stopDistance = Math.max(atr * 0.70, Math.abs(latestVwapPoint.vwap - entry) + 0.25 * atr);
        const stopLoss = Number((entry + stopDistance).toFixed(2));
        const riskPerUnit = Number((stopLoss - entry).toFixed(2));

        // 1:2 R:R target calibrated to daily ATR, targeting lower value bands (-1σ / -2σ)
        const target2R = entry - riskPerUnit * 2.0;
        const tp1 = Number(Math.min(entry - riskPerUnit * 1.5, latestVwapPoint.lower1).toFixed(2));
        const tp2 = Number(Math.min(target2R, latestVwapPoint.lower2).toFixed(2));
        const tp3 = Number((entry - riskPerUnit * 3.0).toFixed(2));

        const mesStrike = isIndexFutures ? Math.floor(entry / 5) * 5 : Math.floor(entry);
        const strikeLabel = isIndexFutures
          ? `CME /MES 5-pt Put (${mesStrike}P Bracket)`
          : `Equity Put (${mesStrike}P Bracket)`;

        recommendations.unshift({
          id: `rec-short-micro-vwap-${cLast.time}`,
          zoneId: `zone-micro-dbd-${cLast.time}`,
          symbol,
          side: 'short',
          zoneType: 'supply',
          pattern: 'DBD',
          entry,
          conservativeEntry: Number((entry + 0.15 * atr).toFixed(2)),
          entryType: 'Zone Boundary',
          executionMode: 'Active Short Scalp (VWAP Breakdown)',
          executionHorizon: is1mOr5m ? 'Daily Scalp · 1m-5m' : 'Weekly Trend · 15m-1h',
          targetRangeLabel: is1mOr5m
            ? (isIndexFutures ? 'Target: 5–15 pts on /MES' : 'Target: $0.50–$1.50 on SPY')
            : (isIndexFutures ? 'Target: 25–60 pts on /MES' : 'Target: $3.00–$8.00 on SPY'),
          isMicroContinuation: true,
          stopLoss,
          bufferAtrMultiplier: bufferMultiplier,
          bufferAmount,
          takeProfit1: tp1,
          takeProfit2: tp2,
          takeProfit3: tp3,
          riskPerUnit,
          rewardPerUnit1: Number((entry - tp1).toFixed(2)),
          rewardPerUnit2: Number((entry - tp2).toFixed(2)),
          rewardPerUnit3: Number((entry - tp3).toFixed(2)),
          riskRewardRatio: 2.0,
          status: 'active',
          heuristicQualityScore: 78,
          qualityScore: 78,
          proximityPhase: 'Phase B: Zone Touch (Execute)',
          distanceInAtr: 0.1,
          vwapConfluence: { scoreBonus: 20, tag: 'VWAP Breakdown Momentum (-1σ/-2σ)' },
          recommendationSource,
          rationale: `VWAP Breakdown Short: Price broke below VWAP ($${latestVwapPoint.vwap.toFixed(2)}) targeting lower band -1σ / -2σ ($${latestVwapPoint.lower2.toFixed(2)}). Staged ${strikeLabel} with 1:2 R:R.`,
          currentDistancePercent: 0,
        });
      }

      // 2. Bullish Breakout (RBR) -> Active Long Scalp targeting upper value bands (+1σ / +2σ)
      const isAboveVwap = cLast.close > latestVwapPoint.vwap;
      const brokeAboveOrAbove = cPrev1.close <= latestVwapPoint.vwap || cPrev2.close <= latestVwapPoint.vwap || isAboveVwap;
      const consecutiveHigherCloses = cLast.close > cPrev1.close && cPrev1.close >= cPrev2.close;

      if (brokeAboveOrAbove && isAboveVwap && consecutiveHigherCloses) {
        const entry = Number(currentPrice.toFixed(2));
        const stopDistance = Math.max(atr * 0.70, Math.abs(entry - latestVwapPoint.vwap) + 0.25 * atr);
        const stopLoss = Number((entry - stopDistance).toFixed(2));
        const riskPerUnit = Number((entry - stopLoss).toFixed(2));

        // 1:2 R:R target calibrated to daily ATR, targeting upper value bands (+1σ / +2σ)
        const target2R = entry + riskPerUnit * 2.0;
        const tp1 = Number(Math.max(entry + riskPerUnit * 1.5, latestVwapPoint.upper1).toFixed(2));
        const tp2 = Number(Math.max(target2R, latestVwapPoint.upper2).toFixed(2));
        const tp3 = Number((entry + riskPerUnit * 3.0).toFixed(2));

        const mesStrike = isIndexFutures ? Math.ceil(entry / 5) * 5 : Math.ceil(entry);
        const strikeLabel = isIndexFutures
          ? `CME /MES 5-pt Call (${mesStrike}C Bracket)`
          : `Equity Call (${mesStrike}C Bracket)`;

        recommendations.unshift({
          id: `rec-long-micro-vwap-${cLast.time}`,
          zoneId: `zone-micro-rbr-${cLast.time}`,
          symbol,
          side: 'long',
          zoneType: 'demand',
          pattern: 'RBR',
          entry,
          conservativeEntry: Number((entry - 0.15 * atr).toFixed(2)),
          entryType: 'Zone Boundary',
          executionMode: 'Active Long Scalp (VWAP Breakout)',
          executionHorizon: is1mOr5m ? 'Daily Scalp · 1m-5m' : 'Weekly Trend · 15m-1h',
          targetRangeLabel: is1mOr5m
            ? (isIndexFutures ? 'Target: 5–15 pts on /MES' : 'Target: $0.50–$1.50 on SPY')
            : (isIndexFutures ? 'Target: 25–60 pts on /MES' : 'Target: $3.00–$8.00 on SPY'),
          isMicroContinuation: true,
          stopLoss,
          bufferAtrMultiplier: bufferMultiplier,
          bufferAmount,
          takeProfit1: tp1,
          takeProfit2: tp2,
          takeProfit3: tp3,
          riskPerUnit,
          rewardPerUnit1: Number((tp1 - entry).toFixed(2)),
          rewardPerUnit2: Number((tp2 - entry).toFixed(2)),
          rewardPerUnit3: Number((tp3 - entry).toFixed(2)),
          riskRewardRatio: 2.0,
          status: 'active',
          heuristicQualityScore: 78,
          qualityScore: 78,
          proximityPhase: 'Phase B: Zone Touch (Execute)',
          distanceInAtr: 0.1,
          vwapConfluence: { scoreBonus: 20, tag: 'VWAP Breakout Momentum (+1σ/+2σ)' },
          recommendationSource,
          rationale: `VWAP Breakout Long: Price broke above VWAP ($${latestVwapPoint.vwap.toFixed(2)}) targeting upper band +1σ / +2σ ($${latestVwapPoint.upper2.toFixed(2)}). Staged ${strikeLabel} with 1:2 R:R.`,
          currentDistancePercent: 0,
        });
      }
    }
  }

  const defaultHorizon = is1mOr5m ? 'Daily Scalp · 1m-5m' : 'Weekly Trend · 15m-1h';
  const defaultTargetLabel = is1mOr5m
    ? (isIndexFutures ? 'Target: 5–15 pts on /MES' : 'Target: $0.50–$1.50 on SPY')
    : (isIndexFutures ? 'Target: 25–60 pts on /MES' : 'Target: $3.00–$8.00 on SPY');

  for (const rec of recommendations) {
    if (!rec.executionHorizon) {
      rec.executionHorizon = defaultHorizon;
      rec.targetRangeLabel = defaultTargetLabel;
    }
  }

  return recommendations.sort((a, b) => Math.abs(a.currentDistancePercent) - Math.abs(b.currentDistancePercent));
}

export function runHistoricalZoneBacktest(
  candles: Candle[],
  _zones: SupplyDemandZone[],
  volatilityMetrics: VolatilityMetrics,
  customConfig?: Partial<BacktestConfig>
): BacktestSummary {
  const emptyDisclaimer = 'Walk-forward zone detection — no lookahead bias. Same-bar SL+TP counts as stop (conservative).';

  if (candles.length === 0) {
    const emptyConfig: BacktestConfig = {
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      initialBalance: 50000,
      riskPercent: 1.0,
      targetMode: 'tp2',
      atrBufferMultiplier: 1.35,
      minQualityScore: 50,
      sideFilter: 'all',
      freshOnly: false,
    };
    return {
      config: emptyConfig,
      totalCandlesInRange: 0,
      startDate: '',
      endDate: '',
      initialBalance: 50000,
      endingBalance: 50000,
      netProfitDollar: 0,
      netProfitPercent: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      openTrades: 0,
      winRate: 0,
      profitFactor: 0,
      avgRMultiple: 0,
      maxDrawdownDollar: 0,
      maxDrawdownPercent: 0,
      avgWinDollar: 0,
      avgLossDollar: 0,
      longestWinStreak: 0,
      longestLossStreak: 0,
      longWinRate: 0,
      shortWinRate: 0,
      disclaimer: emptyDisclaimer,
      trades: [],
      equityCurve: [],
    };
  }

  const firstCandleDate = candles[0].dateStr;
  const lastCandleDate = candles[candles.length - 1].dateStr;

  const config: BacktestConfig = {
    startDate: customConfig?.startDate || firstCandleDate,
    endDate: customConfig?.endDate || lastCandleDate,
    initialBalance: customConfig?.initialBalance ?? 50000,
    riskPercent: customConfig?.riskPercent ?? 1.0,
    targetMode: customConfig?.targetMode ?? 'tp2',
    atrBufferMultiplier: customConfig?.atrBufferMultiplier ?? volatilityMetrics.recommendedBufferMultiplier ?? 1.35,
    minQualityScore: customConfig?.minQualityScore ?? 50,
    sideFilter: customConfig?.sideFilter ?? 'all',
    freshOnly: customConfig?.freshOnly ?? false,
    dataSource: customConfig?.dataSource,
  };

  const parseSafeDate = (dStr: string, isEnd = false): number => {
    if (!dStr) return isEnd ? Infinity : 0;
    const cleanDate = dStr.split(' ')[0].split('T')[0];
    const timeStr = isEnd ? 'T23:59:59.999' : 'T00:00:00.000';
    const parsed = new Date(`${cleanDate}${timeStr}`).getTime();
    if (!isNaN(parsed)) return parsed;
    const fallback = new Date(dStr).getTime();
    return isNaN(fallback) ? (isEnd ? Infinity : 0) : fallback;
  };

  const startTime = parseSafeDate(config.startDate, false);
  const endTime = parseSafeDate(config.endDate, true);

  const trades: BacktestTrade[] = [];
  let currentBalance = config.initialBalance;
  let peakBalance = currentBalance;
  let maxDrawdownDollar = 0;
  let maxDrawdownPercent = 0;

  const equityCurve: EquityPoint[] = [
    {
      time: startTime,
      dateStr: config.startDate,
      equity: currentBalance,
      drawdownPercent: 0,
      outcome: 'neutral',
    },
  ];

  const targetRMultiple = config.targetMode === 'tp1' ? 2.0 : (config.targetMode === 'tp2' ? 3.0 : 4.5);
  const tradedZoneIds = new Set<string>();

  for (let j = 30; j < candles.length; j++) {
    const currentBar = candles[j];
    if (currentBar.time < startTime) continue;
    if (currentBar.time > endTime) break;

    const historicalSlice = candles.slice(0, j);
    const walkForwardZones = detectSupplyDemandZones(historicalSlice, {
      recentOnly: false,
      includeMitigated: false,
      dataSource: config.dataSource,
    });

    const eligibleZones = walkForwardZones.filter(zone => {
      if (zone.endIndex >= j) return false;
      if (tradedZoneIds.has(zone.id)) return false;
      const score = zone.heuristicQualityScore ?? zone.strengthScore;
      if (score < config.minQualityScore) return false;
      if (config.sideFilter === 'long' && zone.type !== 'demand') return false;
      if (config.sideFilter === 'short' && zone.type !== 'supply') return false;
      if (config.freshOnly && zone.testedCount > 0) return false;
      return true;
    });

    for (const zone of eligibleZones) {
      const isLong = zone.type === 'demand';
      const atr = zone.volatilityAtCreation || (zone.high * 0.015);
      const buffer = atr * config.atrBufferMultiplier;

      const entryPrice = isLong ? zone.high : zone.low;
      const stopLoss = isLong ? Math.max(0.0001, zone.low - buffer) : zone.high + buffer;
      const riskPerUnit = Math.abs(entryPrice - stopLoss);
      if (riskPerUnit <= 0) continue;

      const triggeredOnCurrentBar = isLong
        ? currentBar.low <= entryPrice && currentBar.open > entryPrice * 0.95
        : currentBar.high >= entryPrice && currentBar.open < entryPrice * 1.05;

      if (!triggeredOnCurrentBar) continue;

      tradedZoneIds.add(zone.id);

      const tpPrice = isLong ? entryPrice + riskPerUnit * targetRMultiple : entryPrice - riskPerUnit * targetRMultiple;
      const riskBudget = currentBalance * (config.riskPercent / 100);
      const entryIndex = j;
      const entryTime = currentBar.time;
      const entryDateStr = currentBar.dateStr;

      let resolved = false;
      for (let k = j + 1; k < candles.length; k++) {
        const c = candles[k];
        if (c.time > endTime) break;
        const barsHeld = k - entryIndex;

        if (isLong) {
          if (c.low <= stopLoss) {
            resolved = true;
            const lossDollar = -riskBudget;
            currentBalance += lossDollar;
            const pnlPercent = -((entryPrice - stopLoss) / entryPrice) * 100;
            if (currentBalance > peakBalance) peakBalance = currentBalance;
            const ddDollar = peakBalance - currentBalance;
            const ddPct = (ddDollar / peakBalance) * 100;
            if (ddDollar > maxDrawdownDollar) maxDrawdownDollar = ddDollar;
            if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;
            trades.push({
              id: `trade-${zone.id}-${trades.length + 1}`,
              zoneId: zone.id,
              zoneType: zone.type,
              pattern: zone.pattern,
              entryIndex,
              entryTime,
              entryDateStr,
              entryPrice,
              exitIndex: k,
              exitTime: c.time,
              exitDateStr: c.dateStr,
              exitPrice: stopLoss,
              stopLossPrice: stopLoss,
              takeProfitPrice: tpPrice,
              bufferAmount: buffer,
              side: 'long',
              outcome: 'sl',
              rMultiple: -1.0,
              pnlPercent,
              pnlDollar: lossDollar,
              balanceAfter: currentBalance,
              barsHeld,
              qualityScore: zone.heuristicQualityScore ?? zone.strengthScore,
            });
            equityCurve.push({ time: c.time, dateStr: c.dateStr, equity: currentBalance, drawdownPercent: ddPct, tradeIndex: trades.length, outcome: 'loss' });
            break;
          } else if (c.high >= tpPrice) {
            resolved = true;
            const gainDollar = riskBudget * targetRMultiple;
            currentBalance += gainDollar;
            const pnlPercent = ((tpPrice - entryPrice) / entryPrice) * 100;
            if (currentBalance > peakBalance) peakBalance = currentBalance;
            const ddPct = ((peakBalance - currentBalance) / peakBalance) * 100;
            trades.push({
              id: `trade-${zone.id}-${trades.length + 1}`,
              zoneId: zone.id,
              zoneType: zone.type,
              pattern: zone.pattern,
              entryIndex,
              entryTime,
              entryDateStr,
              entryPrice,
              exitIndex: k,
              exitTime: c.time,
              exitDateStr: c.dateStr,
              exitPrice: tpPrice,
              stopLossPrice: stopLoss,
              takeProfitPrice: tpPrice,
              bufferAmount: buffer,
              side: 'long',
              outcome: config.targetMode,
              rMultiple: targetRMultiple,
              pnlPercent,
              pnlDollar: gainDollar,
              balanceAfter: currentBalance,
              barsHeld,
              qualityScore: zone.heuristicQualityScore ?? zone.strengthScore,
            });
            equityCurve.push({ time: c.time, dateStr: c.dateStr, equity: currentBalance, drawdownPercent: ddPct, tradeIndex: trades.length, outcome: 'win' });
            break;
          }
        } else {
          if (c.high >= stopLoss) {
            resolved = true;
            const lossDollar = -riskBudget;
            currentBalance += lossDollar;
            const pnlPercent = -((stopLoss - entryPrice) / entryPrice) * 100;
            if (currentBalance > peakBalance) peakBalance = currentBalance;
            const ddDollar = peakBalance - currentBalance;
            const ddPct = (ddDollar / peakBalance) * 100;
            if (ddDollar > maxDrawdownDollar) maxDrawdownDollar = ddDollar;
            if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;
            trades.push({
              id: `trade-${zone.id}-${trades.length + 1}`,
              zoneId: zone.id,
              zoneType: zone.type,
              pattern: zone.pattern,
              entryIndex,
              entryTime,
              entryDateStr,
              entryPrice,
              exitIndex: k,
              exitTime: c.time,
              exitDateStr: c.dateStr,
              exitPrice: stopLoss,
              stopLossPrice: stopLoss,
              takeProfitPrice: tpPrice,
              bufferAmount: buffer,
              side: 'short',
              outcome: 'sl',
              rMultiple: -1.0,
              pnlPercent,
              pnlDollar: lossDollar,
              balanceAfter: currentBalance,
              barsHeld,
              qualityScore: zone.heuristicQualityScore ?? zone.strengthScore,
            });
            equityCurve.push({ time: c.time, dateStr: c.dateStr, equity: currentBalance, drawdownPercent: ddPct, tradeIndex: trades.length, outcome: 'loss' });
            break;
          } else if (c.low <= tpPrice) {
            resolved = true;
            const gainDollar = riskBudget * targetRMultiple;
            currentBalance += gainDollar;
            const pnlPercent = ((entryPrice - tpPrice) / entryPrice) * 100;
            if (currentBalance > peakBalance) peakBalance = currentBalance;
            const ddPct = ((peakBalance - currentBalance) / peakBalance) * 100;
            trades.push({
              id: `trade-${zone.id}-${trades.length + 1}`,
              zoneId: zone.id,
              zoneType: zone.type,
              pattern: zone.pattern,
              entryIndex,
              entryTime,
              entryDateStr,
              entryPrice,
              exitIndex: k,
              exitTime: c.time,
              exitDateStr: c.dateStr,
              exitPrice: tpPrice,
              stopLossPrice: stopLoss,
              takeProfitPrice: tpPrice,
              bufferAmount: buffer,
              side: 'short',
              outcome: config.targetMode,
              rMultiple: targetRMultiple,
              pnlPercent,
              pnlDollar: gainDollar,
              balanceAfter: currentBalance,
              barsHeld,
              qualityScore: zone.heuristicQualityScore ?? zone.strengthScore,
            });
            equityCurve.push({ time: c.time, dateStr: c.dateStr, equity: currentBalance, drawdownPercent: ddPct, tradeIndex: trades.length, outcome: 'win' });
            break;
          }
        }
      }

      if (!resolved) {
        const lastCandle = candles[candles.length - 1];
        const markPrice = lastCandle ? lastCandle.close : entryPrice;
        const unrealizedPnlDollar = isLong
          ? (markPrice - entryPrice) * (riskBudget / riskPerUnit)
          : (entryPrice - markPrice) * (riskBudget / riskPerUnit);
        const unrealizedPnlPercent = isLong
          ? ((markPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - markPrice) / entryPrice) * 100;
        trades.push({
          id: `trade-${zone.id}-${trades.length + 1}`,
          zoneId: zone.id,
          zoneType: zone.type,
          pattern: zone.pattern,
          entryIndex,
          entryTime,
          entryDateStr,
          entryPrice,
          exitIndex: candles.length - 1,
          exitTime: lastCandle?.time || entryTime,
          exitDateStr: lastCandle?.dateStr || entryDateStr,
          exitPrice: markPrice,
          stopLossPrice: stopLoss,
          takeProfitPrice: tpPrice,
          bufferAmount: buffer,
          side: isLong ? 'long' : 'short',
          outcome: 'open',
          rMultiple: 0,
          pnlPercent: unrealizedPnlPercent,
          pnlDollar: unrealizedPnlDollar,
          balanceAfter: currentBalance,
          barsHeld: candles.length - 1 - entryIndex,
          qualityScore: zone.heuristicQualityScore ?? zone.strengthScore,
        });
      }
    }
  }

  const closedTrades = trades.filter(t => t.outcome !== 'open');
  const wins = closedTrades.filter(t => t.rMultiple > 0).length;
  const losses = closedTrades.filter(t => t.rMultiple < 0).length;
  const openTrades = trades.length - closedTrades.length;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const totalWinDollars = closedTrades.filter(t => t.pnlDollar > 0).reduce((acc, t) => acc + t.pnlDollar, 0);
  const totalLossDollars = Math.abs(closedTrades.filter(t => t.pnlDollar < 0).reduce((acc, t) => acc + t.pnlDollar, 0));
  const profitFactor = totalLossDollars > 0 ? totalWinDollars / totalLossDollars : (totalWinDollars > 0 ? 9.99 : 0);
  const avgWinDollar = wins > 0 ? totalWinDollars / wins : 0;
  const avgLossDollar = losses > 0 ? totalLossDollars / losses : 0;
  const avgRMultiple = closedTrades.length > 0 ? closedTrades.reduce((acc, t) => acc + t.rMultiple, 0) / closedTrades.length : 0;
  const netProfitDollar = currentBalance - config.initialBalance;
  const netProfitPercent = ((currentBalance - config.initialBalance) / config.initialBalance) * 100;

  let currentWinStreak = 0, maxWinStreak = 0, currentLossStreak = 0, maxLossStreak = 0;
  for (const t of closedTrades) {
    if (t.rMultiple > 0) {
      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
    } else if (t.rMultiple < 0) {
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
    }
  }

  const longTrades = closedTrades.filter(t => t.side === 'long');
  const longWins = longTrades.filter(t => t.rMultiple > 0).length;
  const longWinRate = longTrades.length > 0 ? (longWins / longTrades.length) * 100 : 0;
  const shortTrades = closedTrades.filter(t => t.side === 'short');
  const shortWins = shortTrades.filter(t => t.rMultiple > 0).length;
  const shortWinRate = shortTrades.length > 0 ? (shortWins / shortTrades.length) * 100 : 0;

  const totalCandlesInRange = candles.filter(c => c.time >= startTime && c.time <= endTime).length;

  return {
    config,
    totalCandlesInRange,
    startDate: config.startDate,
    endDate: config.endDate,
    initialBalance: config.initialBalance,
    endingBalance: currentBalance,
    netProfitDollar,
    netProfitPercent,
    totalTrades: trades.length,
    wins,
    losses,
    openTrades,
    winRate,
    profitFactor,
    avgRMultiple,
    maxDrawdownDollar,
    maxDrawdownPercent,
    avgWinDollar,
    avgLossDollar,
    longestWinStreak: maxWinStreak,
    longestLossStreak: maxLossStreak,
    longWinRate,
    shortWinRate,
    disclaimer: emptyDisclaimer,
    trades: trades.sort((a, b) => b.entryTime - a.entryTime),
    equityCurve,
  };
}

export function calculatePositionSize(
  equity: number,
  riskPercent: number,
  entry: number,
  stopLoss: number,
  symbol: string
): {
  units: number;
  contracts: number;
  riskAmount: number;
  notional: number;
  riskPerUnit: number;
  riskBudget: number;
  riskPerContract: number;
  pointValue: number;
  commission: number;
  isFutures: boolean;
  isMes: boolean;
  exceedsRiskBudget: boolean;
} {
  const riskBudget = equity * (riskPercent / 100);
  const riskPerUnit = Math.abs(entry - stopLoss);
  const isFutures = isFuturesSymbol(symbol);
  const pointValue = getContractPointValue(symbol);
  const riskPerContract = riskPerUnit * pointValue;
  const units = riskPerContract > 0 ? Math.max(1, Math.floor(riskBudget / riskPerContract)) : 1;
  const contracts = isFutures ? units : 0;
  const riskAmount = isFutures ? (units * riskPerContract) : (units * riskPerUnit);
  const notional = isFutures ? (units * entry * pointValue) : (units * entry);
  const commission = isFutures ? 2.5 : 0;
  const isMes = isSp500Futures(symbol);
  const exceedsRiskBudget = riskAmount > riskBudget;
  return {
    units,
    contracts,
    riskAmount,
    notional,
    riskPerUnit,
    riskBudget,
    riskPerContract,
    pointValue,
    commission,
    isFutures,
    isMes,
    exceedsRiskBudget,
  };
}
