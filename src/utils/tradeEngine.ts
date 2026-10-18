import { Candle, SupplyDemandZone, TradeRecommendation, VolatilityMetrics, BacktestSummary, BacktestTrade, BacktestConfig, EquityPoint } from '../types/trading';
import { getContractPointValue } from './contractSpecs';
import { detectSupplyDemandZones } from './zoneDetector';
import { calculateSessionVwap } from './vwapEngine';

export { getContractPointValue };

export function calculateHeuristicQualityScore(
  zone: SupplyDemandZone,
  volatilityMetrics?: VolatilityMetrics,
  dataSource?: string
): number {
  let score = 0;
  if (zone.testedCount === 0) score += 30;
  else if (zone.testedCount === 1) score += 15;
  if (zone.departureVelocity >= 1.5) score += 25;
  if (dataSource !== 'synthetic' && zone.volumeImbalanceRatio !== undefined && zone.volumeImbalanceRatio >= 1.5) score += 25;
  const hasVwapConfluence = Boolean(
    (zone.vwapConfluence && zone.vwapConfluence.scoreBonus > 0) ||
    (zone.confluenceTags && zone.confluenceTags.some(t => t.includes('VWAP') || t.includes('\u03c3')))
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

  const activeDemandZones = zones
    .filter(z => {
      if (z.type !== 'demand' || z.isMitigated || z.testedCount > 2) return false;
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
    else proximityPhase = 'Phase A: Staging (1.0\u20131.5x ATR)';
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
      rationale: `S.E.T. Long Plan: [Setup: ${zone.pattern} Demand Zone]. [Entry: $${entry.toFixed(2)}]. [Stop: $${stopLoss.toFixed(2)}]. [TP1: $${tp1.toFixed(2)}].`,
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
    const executionMode = isRejectionMode ? 'Execution Mode: Rejection Confirmation' : undefined;
    let proximityPhase: import('../types/trading').ProximityPhase = zone.proximityPhase || 'Dormant (>1.5x ATR)';
    if (touchesProximal) proximityPhase = 'Phase B: Zone Touch (Execute)';
    else if (distanceInAtr <= 1.5) proximityPhase = 'Phase A: Staging (1.0\u20131.5x ATR)';
    else proximityPhase = 'Phase A: Staging (1.0\u20131.5x ATR)';
    const baseTags = zone.confluenceTags && zone.confluenceTags.length > 0 ? zone.confluenceTags.join(' \u00b7 ') : 'Standard Imbalance';
    const tags = isRejectionMode ? `${baseTags} \u00b7 Execution Mode: Rejection Confirmation` : baseTags;
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
      executionMode,
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
      rationale: `S.E.T. Short Plan: [Setup: ${zone.pattern} Supply Zone]. [Entry: $${entry.toFixed(2)}]. [Stop: $${stopLoss.toFixed(2)}]. [TP1: $${tp1.toFixed(2)}].`,
      currentDistancePercent: distancePercent,
    });
  }

  // VWAP Breakdown Continuation (P0 \u2014 extended beyond 1m/5m)
  const isIndexFutures = symbol.includes('MES') || symbol.includes('ES');
  const is1mOr5m = frequency <= 5;
  const allowContinuation = frequency <= 390 && candles && candles.length >= 3;

  if (allowContinuation) {
    const vwapPoints = calculateSessionVwap(candles!);
    const latestVwapPoint = vwapPoints[vwapPoints.length - 1];
    if (latestVwapPoint) {
      const cLast = candles![candles!.length - 1];
      const cPrev1 = candles![candles!.length - 2];
      const cPrev2 = candles![candles!.length - 3];
      const isBelowVwap = cLast.close < latestVwapPoint.vwap;
      const brokeBelowOrBelow = cPrev1.close >= latestVwapPoint.vwap || cPrev2.close >= latestVwapPoint.vwap || isBelowVwap;
      const consecutiveLowerCloses = cLast.close < cPrev1.close && cPrev1.close <= cPrev2.close;

      if (brokeBelowOrBelow && isBelowVwap && consecutiveLowerCloses) {
        const entry = Number(currentPrice.toFixed(2));
        const stopDistance = Math.max(atr * 0.65, Math.abs(latestVwapPoint.vwap - entry) + 0.25 * atr);
        const stopLoss = Number((entry + stopDistance).toFixed(2));
        const riskPerUnit = Number((stopLoss - entry).toFixed(2));
        const defaultPtTarget = isIndexFutures
          ? Math.max(5, Math.min(15, riskPerUnit * 2.0))
          : Math.max(0.50, Math.min(1.50, riskPerUnit * 2.0));
        const tp1 = Number(Math.min(entry - defaultPtTarget, latestVwapPoint.lower1).toFixed(2));
        const tp2 = Number(Math.min(entry - defaultPtTarget * 1.6, latestVwapPoint.lower2).toFixed(2));
        const tp3 = Number((entry - defaultPtTarget * 2.4).toFixed(2));
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
          executionHorizon: is1mOr5m ? 'Daily Scalp \u00b7 1m-5m' : frequency <= 60 ? 'Swing \u00b7 15m-1h' : 'Swing \u00b7 Daily/HTF',
          targetRangeLabel: is1mOr5m
            ? (isIndexFutures ? 'Target: 5\u201315 pts on /MES' : 'Target: $0.50\u2013$1.50 on SPY')
            : (isIndexFutures ? 'Target: 15\u201340 pts on /MES' : 'Target: $1.50\u2013$5.00 on SPY'),
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
          heuristicQualityScore: 75,
          qualityScore: 75,
          proximityPhase: 'Phase B: Zone Touch (Execute)',
          distanceInAtr: 0.1,
          vwapConfluence: { scoreBonus: 20, tag: 'VWAP Breakdown Momentum' },
          recommendationSource,
          rationale: `VWAP Breakdown Short: Price broke below VWAP ($${latestVwapPoint.vwap.toFixed(2)}) with consecutive lower closes. Staged ${strikeLabel}.`,
          currentDistancePercent: 0,
        });
      }
    }
  }

  const defaultHorizon = is1mOr5m ? 'Daily Scalp \u00b7 1m-5m' : 'Weekly Trend \u00b7 15m-1h';
  const defaultTargetLabel = is1mOr5m
    ? (isIndexFutures ? 'Target: 5\u201315 pts on /MES' : 'Target: $0.50\u2013$1.50 on SPY')
    : (isIndexFutures ? 'Target: 25\u201360 pts on /MES' : 'Target: $3.00\u2013$8.00 on SPY');

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
  zones: SupplyDemandZone[],
  volatilityMetrics: VolatilityMetrics,
  customConfig?: Partial<BacktestConfig>
): BacktestSummary {
  const emptyDisclaimer = 'Walk-forward zone detection \u2014 full backtest temporarily stubbed during repo restore.';
  const emptyConfig: BacktestConfig = {
    startDate: candles[0]?.dateStr || new Date().toISOString(),
    endDate: candles[candles.length - 1]?.dateStr || new Date().toISOString(),
    initialBalance: customConfig?.initialBalance ?? 50000,
    riskPercent: customConfig?.riskPercent ?? 1.0,
    targetMode: customConfig?.targetMode ?? 'tp2',
    atrBufferMultiplier: customConfig?.atrBufferMultiplier ?? 1.35,
    minQualityScore: customConfig?.minQualityScore ?? 50,
    sideFilter: customConfig?.sideFilter ?? 'all',
    freshOnly: customConfig?.freshOnly ?? false,
    dataSource: customConfig?.dataSource,
  };
  return {
    config: emptyConfig,
    totalCandlesInRange: candles.length,
    startDate: emptyConfig.startDate,
    endDate: emptyConfig.endDate,
    initialBalance: emptyConfig.initialBalance,
    endingBalance: emptyConfig.initialBalance,
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
