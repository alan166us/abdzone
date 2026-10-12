import { Candle, SupplyDemandZone, TradeRecommendation, VolatilityMetrics, BacktestSummary, BacktestTrade, BacktestConfig, EquityPoint } from '../types/trading';
import { getContractPointValue } from './contractSpecs';
import { detectSupplyDemandZones } from './zoneDetector';

export { getContractPointValue };

/**
 * Transparent Heuristic Quality Score (bounded strictly 0–100):
 * - Freshness: 0 tests = +30, 1 test = +15, >=2 tests = 0
 * - Departure Velocity: ERC >= 1.5x ATR = +25
 * - Volume Ratio: Wholesale Imbalance >= 1.5x = +25
 * - VWAP Band Confluence at formation: At or beyond 1-sigma / 2-sigma = +20
 */
export function calculateHeuristicQualityScore(
  zone: SupplyDemandZone,
  volatilityMetrics?: VolatilityMetrics,
  dataSource?: string
): number {
  let score = 0;

  // 1. Freshness (0 tests = +30, 1 test = +15, >=2 tests = 0)
  if (zone.testedCount === 0) {
    score += 30;
  } else if (zone.testedCount === 1) {
    score += 15;
  }

  // 2. Departure Velocity (ERC >= 1.5x ATR = +25)
  if (zone.departureVelocity >= 1.5) {
    score += 25;
  }

  // Gate volume points strictly on genuine market feeds
  if (
    dataSource !== 'synthetic' &&
    zone.volumeImbalanceRatio !== undefined &&
    zone.volumeImbalanceRatio >= 1.5
  ) {
    score += 25;
  }

  // 4. VWAP Band Confluence at formation (At or beyond 1-sigma / 2-sigma = +20)
  const hasVwapConfluence = Boolean(
    (zone.vwapConfluence && zone.vwapConfluence.scoreBonus > 0) ||
    (zone.confluenceTags && zone.confluenceTags.some(t => t.includes('VWAP') || t.includes('σ')))
  );
  if (hasVwapConfluence) {
    score += 20;
  }

  return Math.min(100, Math.max(0, score));
}

export function generateTradeRecommendations(
  currentPrice: number,
  zones: SupplyDemandZone[],
  volatilityMetrics: VolatilityMetrics,
  symbol: string = 'BTC/USDT',
  dataSource?: string
): TradeRecommendation[] {
  const recommendations: TradeRecommendation[] = [];
  const atr = volatilityMetrics.atr || currentPrice * 0.015;
  const bufferMultiplier = volatilityMetrics.recommendedBufferMultiplier || 1.30;
  const bufferAmount = atr * bufferMultiplier;

  // Directional Pullback Filter:
  // - Demand (Long): Discard if spot price is already below zone.low - (0.2 * ATR)
  // - Supply (Short): Discard if spot price is already above zone.high + (0.2 * ATR)
  const activeDemandZones = zones
    .filter(z => 
      z.type === 'demand' && 
      !z.isMitigated && 
      z.testedCount <= 2 && 
      !(currentPrice < z.low - 0.2 * atr) &&
      z.high <= currentPrice * 1.06
    )
    .sort((a, b) => {
      // Prioritize proximity, then freshness, then quality score
      const distA = Math.abs(currentPrice - a.high);
      const distB = Math.abs(currentPrice - b.high);
      if (Math.abs(distA - distB) / currentPrice < 0.01) {
        return (b.heuristicQualityScore ?? b.strengthScore ?? 50) - (a.heuristicQualityScore ?? a.strengthScore ?? 50);
      }
      return distA - distB;
    });

  const activeSupplyZones = zones
    .filter(z => 
      z.type === 'supply' && 
      !z.isMitigated && 
      z.testedCount <= 2 && 
      !(currentPrice > z.high + 0.2 * atr) &&
      z.low >= currentPrice * 0.94
    )
    .sort((a, b) => {
      const distA = Math.abs(a.low - currentPrice);
      const distB = Math.abs(b.low - currentPrice);
      if (Math.abs(distA - distB) / currentPrice < 0.01) {
        return (b.heuristicQualityScore ?? b.strengthScore ?? 50) - (a.heuristicQualityScore ?? a.strengthScore ?? 50);
      }
      return distA - distB;
    });

  // 1. Long Recommendations for top Demand Zones
  for (const zone of activeDemandZones.slice(0, 3)) {
    // Directional Pullback Guard: Discard if price already breached distal line - 0.2 ATR
    if (currentPrice < zone.low - 0.2 * atr) {
      continue;
    }

    const entry = zone.proximalLine || zone.high; // Aggressive Limit order at Proximal Line
    const conservativeEntry = zone.conservativeEntry || zone.equilibrium; // Conservative 50% Equilibrium Entry
    const stopLoss = Math.max(0.0001, (zone.distalLine || zone.low) - bufferAmount); // Hard SL = Distal - 1.35x ATR
    const riskPerUnit = entry - stopLoss;

    if (riskPerUnit <= 0) continue;

    // Nearest overhead supply zone proximal line for TP2 target projection
    const overheadSupply = activeSupplyZones.find(s => (s.proximalLine || s.low) > entry);
    const tp1 = entry + riskPerUnit * 2.0; // Fixed 1:2 R:R (de-risk / partial profit)
    const tp2 = overheadSupply ? (overheadSupply.proximalLine || overheadSupply.low) : entry + riskPerUnit * 3.2; // Opposing zone proximal
    const tp3 = entry + riskPerUnit * 4.5; // Extended runner

    const distancePercent = ((currentPrice - entry) / currentPrice) * 100;
    const tags = zone.confluenceTags && zone.confluenceTags.length > 0 ? zone.confluenceTags.join(' · ') : 'Standard Imbalance';
    const heuristicQualityScore =
      zone.heuristicQualityScore ??
      calculateHeuristicQualityScore(zone, volatilityMetrics, dataSource);

    recommendations.push({
      id: `rec-long-${zone.id}`,
      zoneId: zone.id,
      symbol,
      side: 'long',
      zoneType: 'demand',
      pattern: zone.pattern,
      entry,
      conservativeEntry,
      entryType: 'Zone Boundary',
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
      proximityPhase: zone.proximityPhase || 'Dormant (>1.5x ATR)',
      distanceInAtr: zone.distanceInAtr,
      opposingZoneId: overheadSupply?.id,
      vwapConfluence: zone.vwapConfluence,
      rationale: `S.E.T. Long Plan: [Setup: ${zone.pattern} Demand Zone ($${zone.low.toFixed(2)} - $${zone.high.toFixed(2)}) · ${tags}]. [Entry: Aggressive at Proximal $${entry.toFixed(2)} / Conservative 50% Midline at $${conservativeEntry.toFixed(2)}]. [Stop: Hard SL at Distal - ${(bufferMultiplier).toFixed(2)}x ATR ($${stopLoss.toFixed(2)})]. [Targets: TP1 at 1:2 R:R ($${tp1.toFixed(2)}) · TP2 at Opposing Supply Proximal ($${tp2.toFixed(2)})]. 3-Bar Rule: If price consolidates inside base for >3-5 bars without rejection, flatten at breakeven.`,
      currentDistancePercent: distancePercent,
    });
  }

  // 2. Short Recommendations for top Supply Zones
  for (const zone of activeSupplyZones.slice(0, 3)) {
    // Directional Pullback Guard: Discard if price already breached distal line + 0.2 ATR
    if (currentPrice > zone.high + 0.2 * atr) {
      continue;
    }

    const entry = zone.proximalLine || zone.low; // Aggressive Limit order at Proximal Line
    const conservativeEntry = zone.conservativeEntry || zone.equilibrium; // Conservative 50% Equilibrium Entry
    const stopLoss = (zone.distalLine || zone.high) + bufferAmount; // Hard SL = Distal + 1.35x ATR
    const riskPerUnit = stopLoss - entry;

    if (riskPerUnit <= 0) continue;

    // Nearest lower demand zone proximal line for TP2 target projection
    const lowerDemand = activeDemandZones.find(d => (d.proximalLine || d.high) < entry);
    const tp1 = entry - riskPerUnit * 2.0; // Fixed 1:2 R:R (de-risk / partial profit)
    const tp2 = lowerDemand ? (lowerDemand.proximalLine || lowerDemand.high) : entry - riskPerUnit * 3.2; // Opposing zone proximal
    const tp3 = entry - riskPerUnit * 4.5; // Extended runner

    const distancePercent = ((entry - currentPrice) / currentPrice) * 100;
    const tags = zone.confluenceTags && zone.confluenceTags.length > 0 ? zone.confluenceTags.join(' · ') : 'Standard Imbalance';
    const heuristicQualityScore =
      zone.heuristicQualityScore ??
      calculateHeuristicQualityScore(zone, volatilityMetrics, dataSource);

    recommendations.push({
      id: `rec-short-${zone.id}`,
      zoneId: zone.id,
      symbol,
      side: 'short',
      zoneType: 'supply',
      pattern: zone.pattern,
      entry,
      conservativeEntry,
      entryType: 'Zone Boundary',
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
      proximityPhase: zone.proximityPhase || 'Dormant (>1.5x ATR)',
      distanceInAtr: zone.distanceInAtr,
      opposingZoneId: lowerDemand?.id,
      vwapConfluence: zone.vwapConfluence,
      rationale: `S.E.T. Short Plan: [Setup: ${zone.pattern} Supply Zone ($${zone.low.toFixed(2)} - $${zone.high.toFixed(2)}) · ${tags}]. [Entry: Aggressive at Proximal $${entry.toFixed(2)} / Conservative 50% Midline at $${conservativeEntry.toFixed(2)}]. [Stop: Hard SL at Distal + ${(bufferMultiplier).toFixed(2)}x ATR ($${stopLoss.toFixed(2)})]. [Targets: TP1 at 1:2 R:R ($${tp1.toFixed(2)}) · TP2 at Opposing Demand Proximal ($${tp2.toFixed(2)})]. 3-Bar Rule: If price consolidates inside base for >3-5 bars without rejection, flatten at breakeven.`,
      currentDistancePercent: distancePercent,
    });
  }

  return recommendations.sort((a, b) => Math.abs(a.currentDistancePercent) - Math.abs(b.currentDistancePercent));
}

/**
 * Historical Backtester: evaluates Supply & Demand zone identification algorithm and
 * volatility-based entry/exit recommendations across a user-specified date range.
 */
export function runHistoricalZoneBacktest(
  candles: Candle[],
  zones: SupplyDemandZone[],
  volatilityMetrics: VolatilityMetrics,
  customConfig?: Partial<BacktestConfig>
): BacktestSummary {
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
      disclaimer: 'Walk-forward zone detection — no lookahead bias.',
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

  // Filter candles that fall into the backtest date range
  const filteredCandles = candles.filter(c => {
    const cTime = c.time;
    return cTime >= startTime && cTime <= endTime;
  });

  const totalCandlesInRange = filteredCandles.length > 0 ? filteredCandles.length : candles.length;

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

  // Target multipliers based on user targetMode
  const targetRMultiple = config.targetMode === 'tp1' ? 2.0 : (config.targetMode === 'tp2' ? 3.0 : 4.5);

  // Strict Walk-Forward Zone Detection & Simulation:
  // Step through candles from index j = 30 to candles.length without lookahead bias.
  // Track traded zone IDs to prevent duplicate trades from the same structural level.
  const tradedZoneIds = new Set<string>();

  for (let j = 30; j < candles.length; j++) {
    const currentBar = candles[j];
    if (currentBar.time < startTime) continue;
    if (currentBar.time > endTime) break;

    // Detect zones strictly on the historical slice candles.slice(0, j + 1)
    const historicalSlice = candles.slice(0, j + 1);
    const walkForwardZones = detectSupplyDemandZones(historicalSlice, {
      recentOnly: false,
      includeMitigated: false,
    });

    // Consider for entry only zones where zone.endIndex < j (formed strictly prior to bar j)
    const eligibleZones = walkForwardZones.filter(zone => {
      if (zone.endIndex >= j) return false;
      if (tradedZoneIds.has(zone.id)) return false;

      // Quality score filter
      const score = zone.heuristicQualityScore ?? zone.strengthScore;
      if (score < config.minQualityScore) return false;

      // Side filter
      if (config.sideFilter === 'long' && zone.type !== 'demand') return false;
      if (config.sideFilter === 'short' && zone.type !== 'supply') return false;

      // Fresh only filter
      if (config.freshOnly && zone.testedCount > 0) return false;

      return true;
    });

    // If an eligible zone is triggered on bar j or immediately adjacent, evaluate the trade
    for (const zone of eligibleZones) {
      const isLong = zone.type === 'demand';
      const atr = zone.volatilityAtCreation || (zone.high * 0.015);
      const buffer = atr * config.atrBufferMultiplier;

      const entryPrice = isLong ? zone.high : zone.low;
      const stopLoss = isLong ? Math.max(0.0001, zone.low - buffer) : zone.high + buffer;
      const riskPerUnit = Math.abs(entryPrice - stopLoss);
      if (riskPerUnit <= 0) continue;

      // Check if current bar triggered entry into the zone
      const triggeredOnCurrentBar = isLong
        ? currentBar.low <= entryPrice && currentBar.open > entryPrice * 0.95
        : currentBar.high >= entryPrice && currentBar.open < entryPrice * 1.05;

      if (!triggeredOnCurrentBar) continue;

      // Mark zone as traded so we don't duplicate
      tradedZoneIds.add(zone.id);

      const tpPrice = isLong ? entryPrice + riskPerUnit * targetRMultiple : entryPrice - riskPerUnit * targetRMultiple;
      const riskBudget = currentBalance * (config.riskPercent / 100);
      const entryIndex = j;
      const entryTime = currentBar.time;
      const entryDateStr = currentBar.dateStr;

      // Evaluate trade triggers and exits strictly on subsequent bars (> j)
      for (let k = j + 1; k < candles.length; k++) {
        const c = candles[k];
        if (c.time > endTime) break;

        const barsHeld = k - entryIndex;

        if (isLong) {
          if (c.low <= stopLoss) {
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

            equityCurve.push({
              time: c.time,
              dateStr: c.dateStr,
              equity: currentBalance,
              drawdownPercent: ddPct,
              tradeIndex: trades.length,
              outcome: 'loss',
            });
            break;
          } else if (c.high >= tpPrice) {
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

            equityCurve.push({
              time: c.time,
              dateStr: c.dateStr,
              equity: currentBalance,
              drawdownPercent: ddPct,
              tradeIndex: trades.length,
              outcome: 'win',
            });
            break;
          }
        } else {
          // Short trade
          if (c.high >= stopLoss) {
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

            equityCurve.push({
              time: c.time,
              dateStr: c.dateStr,
              equity: currentBalance,
              drawdownPercent: ddPct,
              tradeIndex: trades.length,
              outcome: 'loss',
            });
            break;
          } else if (c.low <= tpPrice) {
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

            equityCurve.push({
              time: c.time,
              dateStr: c.dateStr,
              equity: currentBalance,
              drawdownPercent: ddPct,
              tradeIndex: trades.length,
              outcome: 'win',
            });
            break;
          }
        }
      }
    }
  }

  // Calculate Aggregate Performance Statistics
  const wins = trades.filter(t => t.rMultiple > 0).length;
  const losses = trades.filter(t => t.rMultiple < 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  const totalWinDollars = trades.filter(t => t.pnlDollar > 0).reduce((acc, t) => acc + t.pnlDollar, 0);
  const totalLossDollars = Math.abs(trades.filter(t => t.pnlDollar < 0).reduce((acc, t) => acc + t.pnlDollar, 0));
  const profitFactor = totalLossDollars > 0 ? totalWinDollars / totalLossDollars : (totalWinDollars > 0 ? 9.99 : 0);

  const avgWinDollar = wins > 0 ? totalWinDollars / wins : 0;
  const avgLossDollar = losses > 0 ? totalLossDollars / losses : 0;
  const avgRMultiple = trades.length > 0 ? trades.reduce((acc, t) => acc + t.rMultiple, 0) / trades.length : 0;

  const netProfitDollar = currentBalance - config.initialBalance;
  const netProfitPercent = ((currentBalance - config.initialBalance) / config.initialBalance) * 100;

  // Streak calculations
  let currentWinStreak = 0;
  let maxWinStreak = 0;
  let currentLossStreak = 0;
  let maxLossStreak = 0;

  for (const t of trades) {
    if (t.rMultiple > 0) {
      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
    } else {
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
    }
  }

  // Long vs Short Win Rates
  const longTrades = trades.filter(t => t.side === 'long');
  const longWins = longTrades.filter(t => t.rMultiple > 0).length;
  const longWinRate = longTrades.length > 0 ? (longWins / longTrades.length) * 100 : 0;

  const shortTrades = trades.filter(t => t.side === 'short');
  const shortWins = shortTrades.filter(t => t.rMultiple > 0).length;
  const shortWinRate = shortTrades.length > 0 ? (shortWins / shortTrades.length) * 100 : 0;

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
    openTrades: 0,
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
    disclaimer: 'Walk-forward zone detection — no lookahead bias.',
    trades: trades.sort((a, b) => b.entryTime - a.entryTime),
    equityCurve,
  };
}

export function isFuturesSymbol(symbol: string): boolean {
  if (!symbol) return false;
  const clean = symbol.trim().toUpperCase().replace('/', '');
  return symbol.trim().startsWith('/') ||
    clean === 'MES' || clean.startsWith('MES') ||
    clean === 'MNQ' || clean.startsWith('MNQ') ||
    clean === 'ES' || clean.startsWith('ES') ||
    clean === 'NQ' || clean.startsWith('NQ') ||
    clean === 'RTY' || clean.startsWith('RTY') ||
    clean === 'CL' || clean.startsWith('CL') ||
    clean === 'GC' || clean.startsWith('GC');
}

/**
 * Calculates position sizing based on account equity, risk budget, and symbol specifications.
 * For futures like /MES, calculates exact contracts based on point multiplier ($5/pt) and round-turn commissions.
 */
export function calculatePositionSize(
  accountEquity: number,
  riskPercent: number,
  entry: number,
  stopLoss: number,
  symbol: string = 'SPY'
) {
  const riskBudget = (accountEquity * (riskPercent / 100));
  const isFutures = isFuturesSymbol(symbol);
  const cleanSym = (symbol || '').toUpperCase();
  const isMes = cleanSym.includes('MES');

  const pointValue = isFutures ? getContractPointValue(symbol) : 1.0;
  const commission = isFutures ? 5.0 : 0.0; // round-turn commission

  const stopDistance = Math.abs(entry - stopLoss);
  if (stopDistance <= 0) {
    return {
      units: 0,
      contracts: 0,
      notional: 0,
      riskAmount: 0,
      riskBudget,
      riskPerUnit: 0,
      riskPerContract: 0,
      pointValue,
      isFutures,
      isMes,
    };
  }

  const riskPerContract = stopDistance * pointValue + commission;
  const contracts = Math.max(0, Math.floor(riskBudget / riskPerContract));
  const units = isFutures ? contracts : Number((riskBudget / stopDistance).toFixed(2));
  const notional = isFutures ? contracts * entry * pointValue : units * entry;
  const actualRiskAmount = isFutures ? contracts * riskPerContract : riskBudget;

  return {
    units,
    contracts,
    notional,
    riskAmount: actualRiskAmount,
    riskBudget,
    riskPerUnit: stopDistance,
    riskPerContract,
    pointValue,
    commission,
    isFutures,
    isMes,
  };
}
