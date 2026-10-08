import { Candle, SupplyDemandZone, TradeRecommendation, VolatilityMetrics, BacktestSummary, BacktestTrade, BacktestConfig, EquityPoint } from '../types/trading';

export function generateTradeRecommendations(
  currentPrice: number,
  zones: SupplyDemandZone[],
  volatilityMetrics: VolatilityMetrics,
  symbol: string = 'BTC/USDT'
): TradeRecommendation[] {
  const recommendations: TradeRecommendation[] = [];
  const atr = volatilityMetrics.atr || currentPrice * 0.015;
  const bufferMultiplier = volatilityMetrics.recommendedBufferMultiplier || 1.30;
  const bufferAmount = atr * bufferMultiplier;

  // Filter active, high-edge unmitigated zones (prioritizing fresh zones with quality score >= 55)
  const activeDemandZones = zones
    .filter(z => z.type === 'demand' && !z.isMitigated && z.testedCount <= 2 && z.high <= currentPrice * 1.06)
    .sort((a, b) => {
      // Prioritize proximity, then freshness, then quality score
      const distA = Math.abs(currentPrice - a.high);
      const distB = Math.abs(currentPrice - b.high);
      if (Math.abs(distA - distB) / currentPrice < 0.01) {
        return (b.strengthScore || 50) - (a.strengthScore || 50);
      }
      return distA - distB;
    });

  const activeSupplyZones = zones
    .filter(z => z.type === 'supply' && !z.isMitigated && z.testedCount <= 2 && z.low >= currentPrice * 0.94)
    .sort((a, b) => {
      const distA = Math.abs(a.low - currentPrice);
      const distB = Math.abs(b.low - currentPrice);
      if (Math.abs(distA - distB) / currentPrice < 0.01) {
        return (b.strengthScore || 50) - (a.strengthScore || 50);
      }
      return distA - distB;
    });

  // 1. Long Recommendations for top Demand Zones
  for (const zone of activeDemandZones.slice(0, 3)) {
    const entry = zone.high; // Limit order at top of demand zone (proximal line)
    const stopLoss = Math.max(0.0001, zone.low - bufferAmount);
    const riskPerUnit = entry - stopLoss;

    if (riskPerUnit <= 0) continue;

    // Nearest overhead supply zone floor for target projection
    const overheadSupply = activeSupplyZones.find(s => s.low > entry);
    const tp1 = entry + riskPerUnit * 2.0;
    const tp2 = entry + riskPerUnit * 3.0;
    const rawTp3 = entry + riskPerUnit * 4.5;
    const tp3 = overheadSupply ? Math.min(rawTp3, overheadSupply.low * 0.998) : rawTp3;

    const distancePercent = ((currentPrice - entry) / currentPrice) * 100;
    const tags = zone.confluenceTags && zone.confluenceTags.length > 0 ? zone.confluenceTags.join(' · ') : 'Standard Imbalance';
    const winRateEst = zone.winProbabilityEstimate || 72;

    recommendations.push({
      id: `rec-long-${zone.id}`,
      zoneId: zone.id,
      symbol,
      side: 'long',
      zoneType: 'demand',
      pattern: zone.pattern,
      entry,
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
      riskRewardRatio: 3.0,
      status: 'active',
      qualityScore: zone.strengthScore,
      rationale: `Buy limit placed at ${zone.pattern} Demand Zone ($${zone.low.toFixed(2)} - $${zone.high.toFixed(2)}). [Confluence: ${tags}] · Est. Win Edge: ${winRateEst}%. Stop-loss incorporates ${(bufferMultiplier).toFixed(2)}x ATR ($${bufferAmount.toFixed(2)}) buffer below base low. Conservative 50% equilibrium entry: $${zone.equilibrium.toFixed(2)}.`,
      currentDistancePercent: distancePercent,
    });
  }

  // 2. Short Recommendations for top Supply Zones
  for (const zone of activeSupplyZones.slice(0, 3)) {
    const entry = zone.low; // Limit order at bottom of supply zone (proximal line)
    const stopLoss = zone.high + bufferAmount;
    const riskPerUnit = stopLoss - entry;

    if (riskPerUnit <= 0) continue;

    const lowerDemand = activeDemandZones.find(d => d.high < entry);
    const tp1 = entry - riskPerUnit * 2.0;
    const tp2 = entry - riskPerUnit * 3.0;
    const rawTp3 = entry - riskPerUnit * 4.5;
    const tp3 = lowerDemand ? Math.max(0.0001, Math.max(rawTp3, lowerDemand.high * 1.002)) : Math.max(0.0001, rawTp3);

    const distancePercent = ((entry - currentPrice) / currentPrice) * 100;
    const tags = zone.confluenceTags && zone.confluenceTags.length > 0 ? zone.confluenceTags.join(' · ') : 'Standard Imbalance';
    const winRateEst = zone.winProbabilityEstimate || 72;

    recommendations.push({
      id: `rec-short-${zone.id}`,
      zoneId: zone.id,
      symbol,
      side: 'short',
      zoneType: 'supply',
      pattern: zone.pattern,
      entry,
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
      riskRewardRatio: 3.0,
      status: 'active',
      qualityScore: zone.strengthScore,
      rationale: `Sell limit placed at ${zone.pattern} Supply Zone ($${zone.low.toFixed(2)} - $${zone.high.toFixed(2)}). [Confluence: ${tags}] · Est. Win Edge: ${winRateEst}%. Stop-loss incorporates ${(bufferMultiplier).toFixed(2)}x ATR ($${bufferAmount.toFixed(2)}) buffer above base high. Conservative 50% equilibrium entry: $${zone.equilibrium.toFixed(2)}.`,
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

  // Filter eligible zones based on user parameters and date range
  const eligibleZones = zones.filter(zone => {
    // Quality score filter
    if (zone.strengthScore < config.minQualityScore) return false;

    // Side filter
    if (config.sideFilter === 'long' && zone.type !== 'demand') return false;
    if (config.sideFilter === 'short' && zone.type !== 'supply') return false;

    // Fresh only filter
    if (config.freshOnly && zone.testedCount > 0) return false;

    // Must be formed on or within the date window
    const zoneTime = zone.startTime;
    return zoneTime >= startTime && zoneTime <= endTime;
  });

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

  for (const zone of eligibleZones) {
    const isLong = zone.type === 'demand';
    const atr = zone.volatilityAtCreation || (zone.high * 0.015);
    const buffer = atr * config.atrBufferMultiplier;

    const entryPrice = isLong ? zone.high : zone.low;
    const stopLoss = isLong ? Math.max(0.0001, zone.low - buffer) : zone.high + buffer;
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    if (riskPerUnit <= 0) continue;

    // Take-Profit calculated from risk per unit
    const tpPrice = isLong ? entryPrice + riskPerUnit * targetRMultiple : entryPrice - riskPerUnit * targetRMultiple;

    // Position sizing based on current portfolio equity at the trade execution
    const riskBudget = currentBalance * (config.riskPercent / 100);
    const units = riskBudget / riskPerUnit;

    let orderTriggered = false;
    let entryIndex = -1;
    let entryTime = 0;
    let entryDateStr = '';

    // Simulate subsequent candles within date range
    for (let j = zone.endIndex + 1; j < candles.length; j++) {
      const c = candles[j];

      // Stop simulating if beyond end date
      if (c.time > endTime) {
        break;
      }

      if (!orderTriggered) {
        // Test if price pulled back into the zone entry
        if (isLong && c.low <= entryPrice && c.open > entryPrice * 0.95) {
          orderTriggered = true;
          entryIndex = j;
          entryTime = c.time;
          entryDateStr = c.dateStr;
        } else if (!isLong && c.high >= entryPrice && c.open < entryPrice * 1.05) {
          orderTriggered = true;
          entryIndex = j;
          entryTime = c.time;
          entryDateStr = c.dateStr;
        }
      } else {
        // Trade is open: evaluate outcome
        const barsHeld = j - entryIndex;

        if (isLong) {
          // Check Stop-Loss first
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
              exitIndex: j,
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
              qualityScore: zone.strengthScore,
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
            // Take-Profit hit
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
              exitIndex: j,
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
              qualityScore: zone.strengthScore,
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
          // Short
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
              exitIndex: j,
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
              qualityScore: zone.strengthScore,
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
              exitIndex: j,
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
              qualityScore: zone.strengthScore,
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
    trades: trades.sort((a, b) => b.entryTime - a.entryTime),
    equityCurve,
  };
}

/**
 * Calculates position sizing based on account equity and risk budget
 */
export function calculatePositionSize(
  accountEquity: number,
  riskPercent: number,
  entry: number,
  stopLoss: number
) {
  const riskAmount = (accountEquity * (riskPercent / 100));
  const riskPerUnit = Math.abs(entry - stopLoss);
  if (riskPerUnit <= 0) return { units: 0, notional: 0, riskAmount: 0 };

  const units = riskAmount / riskPerUnit;
  const notional = units * entry;

  return {
    units,
    notional,
    riskAmount,
    riskPerUnit,
  };
}
