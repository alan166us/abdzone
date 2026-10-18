import { Candle, SupplyDemandZone } from '../types/trading';

/**
 * P0: Failed N-bar high/low breakout → provisional supply/demand (daily/HTF options).
 */
export function detectFailedBreakoutZones(
  candles: Candle[],
  atrs: number[],
): SupplyDemandZone[] {
  const rawZones: SupplyDemandZone[] = [];
  if (candles.length < 20) return rawZones;

  const lookback = Math.min(20, Math.max(10, Math.floor(candles.length / 12)));
  const confirmWindow = 3;
  const failScanStart = Math.max(lookback + 2, candles.length - 100);

  for (let i = failScanStart; i < candles.length; i++) {
    const atrI = atrs[i] || 1;
    let swingHigh = -Infinity;
    let swingLow = Infinity;
    for (let k = i - lookback; k < i; k++) {
      if (candles[k].high > swingHigh) swingHigh = candles[k].high;
      if (candles[k].low < swingLow) swingLow = candles[k].low;
    }
    if (!Number.isFinite(swingHigh) || !Number.isFinite(swingLow)) continue;

    const breakoutBar = candles[i];

    // Failed upside breakout → provisional SUPPLY
    const brokeHigh = breakoutBar.high > swingHigh + atrI * 0.05;
    if (brokeHigh) {
      const endJ = Math.min(candles.length - 1, i + confirmWindow);
      for (let j = i; j <= endJ; j++) {
        const confirm = candles[j];
        if (confirm.close >= swingHigh) continue;

        let excursionHigh = breakoutBar.high;
        for (let t = i; t <= j; t++) {
          if (candles[t].high > excursionHigh) excursionHigh = candles[t].high;
        }

        const zHigh = Number(excursionHigh.toFixed(2));
        const zLow = Number(Math.min(swingHigh, confirm.close + atrI * 0.1).toFixed(2));
        if (zHigh <= zLow || (zHigh - zLow) < atrI * 0.08) continue;

        let testedCount = 0;
        let isMitigated = false;
        let mitigatedIndex: number | undefined;
        let mitigatedTime: number | undefined;
        let inRetest = false;
        for (let m = j + 1; m < candles.length; m++) {
          const fc = candles[m];
          const touching = fc.high >= zLow && fc.low <= zHigh;
          if (touching) {
            if (!inRetest) { testedCount++; inRetest = true; }
          } else if (fc.high < zLow) {
            inRetest = false;
          }
          if (fc.close > zHigh) {
            isMitigated = true;
            mitigatedIndex = m;
            mitigatedTime = fc.time;
            break;
          }
        }

        const lastClose = candles[candles.length - 1]?.close ?? confirm.close;
        const latestAtr = atrs[candles.length - 1] || atrI;
        const proximal = zLow;
        const distInAtr = Number((Math.abs(lastClose - proximal) / Math.max(0.0001, latestAtr)).toFixed(2));
        const barAge = (candles.length - 1) - i;

        let hScore = 70;
        if (testedCount === 0 && !isMitigated) hScore += 15;
        else if (testedCount >= 2) hScore -= 20;
        if (isMitigated) hScore -= 30;
        if (barAge >= 40) hScore = Math.round(hScore * 0.7);
        hScore = Math.min(100, Math.max(0, hScore));

        rawZones.push({
          id: `fail-supply-${i}-${j}-${Math.round(zHigh * 100)}`,
          type: 'supply',
          pattern: 'RBD',
          high: zHigh,
          low: zLow,
          equilibrium: Number(((zHigh + zLow) / 2).toFixed(2)),
          proximalLine: zLow,
          distalLine: zHigh,
          conservativeEntry: Number(((zHigh + zLow) / 2).toFixed(2)),
          startIndex: Math.max(0, i - 1),
          endIndex: j,
          startTime: breakoutBar.time,
          departureVelocity: Number(((zHigh - zLow) / Math.max(0.0001, atrI)).toFixed(2)),
          departurePercent: Number((((zHigh - zLow) / breakoutBar.close) * 100).toFixed(2)),
          strengthScore: hScore,
          heuristicQualityScore: hScore,
          testedCount,
          isDepleted: testedCount >= 2,
          isMitigated,
          mitigatedIndex,
          mitigatedTime,
          volatilityAtCreation: Number(atrI.toFixed(2)),
          baseLength: 1,
          trendConfluence: 'counter-trend',
          confluenceTags: [
            'Failed Breakout (Swing High)',
            'Provisional Swing Supply',
            'Daily/HTF Options Edge',
            testedCount === 0 && !isMitigated ? 'Fresh Untested (Max Edge)' : 'Tested',
          ].filter(Boolean) as string[],
          barAge,
          distanceInAtr: distInAtr,
          proximityPhase: distInAtr <= 0.8
            ? 'Phase B: Zone Touch (Execute)'
            : distInAtr <= 1.5
            ? 'Phase A: Staging (1.0–1.5x ATR)'
            : 'Dormant (>1.5x ATR)',
          notes: `Failed breakout supply: ${lookback}-bar high ${swingHigh.toFixed(2)} taken out then closed back below by bar ${j}`,
        });
        break;
      }
    }

    // Failed downside breakout → provisional DEMAND
    const brokeLow = breakoutBar.low < swingLow - atrI * 0.05;
    if (brokeLow) {
      const endJ = Math.min(candles.length - 1, i + confirmWindow);
      for (let j = i; j <= endJ; j++) {
        const confirm = candles[j];
        if (confirm.close <= swingLow) continue;

        let excursionLow = breakoutBar.low;
        for (let t = i; t <= j; t++) {
          if (candles[t].low < excursionLow) excursionLow = candles[t].low;
        }

        const zLow = Number(excursionLow.toFixed(2));
        const zHigh = Number(Math.max(swingLow, confirm.close - atrI * 0.1).toFixed(2));
        if (zHigh <= zLow || (zHigh - zLow) < atrI * 0.08) continue;

        let testedCount = 0;
        let isMitigated = false;
        let mitigatedIndex: number | undefined;
        let mitigatedTime: number | undefined;
        let inRetest = false;
        for (let m = j + 1; m < candles.length; m++) {
          const fc = candles[m];
          const touching = fc.low <= zHigh && fc.high >= zLow;
          if (touching) {
            if (!inRetest) { testedCount++; inRetest = true; }
          } else if (fc.low > zHigh) {
            inRetest = false;
          }
          if (fc.close < zLow) {
            isMitigated = true;
            mitigatedIndex = m;
            mitigatedTime = fc.time;
            break;
          }
        }

        const lastClose = candles[candles.length - 1]?.close ?? confirm.close;
        const latestAtr = atrs[candles.length - 1] || atrI;
        const proximal = zHigh;
        const distInAtr = Number((Math.abs(lastClose - proximal) / Math.max(0.0001, latestAtr)).toFixed(2));
        const barAge = (candles.length - 1) - i;

        let hScore = 70;
        if (testedCount === 0 && !isMitigated) hScore += 15;
        else if (testedCount >= 2) hScore -= 20;
        if (isMitigated) hScore -= 30;
        if (barAge >= 40) hScore = Math.round(hScore * 0.7);
        hScore = Math.min(100, Math.max(0, hScore));

        rawZones.push({
          id: `fail-demand-${i}-${j}-${Math.round(zLow * 100)}`,
          type: 'demand',
          pattern: 'DBR',
          high: zHigh,
          low: zLow,
          equilibrium: Number(((zHigh + zLow) / 2).toFixed(2)),
          proximalLine: zHigh,
          distalLine: zLow,
          conservativeEntry: Number(((zHigh + zLow) / 2).toFixed(2)),
          startIndex: Math.max(0, i - 1),
          endIndex: j,
          startTime: breakoutBar.time,
          departureVelocity: Number(((zHigh - zLow) / Math.max(0.0001, atrI)).toFixed(2)),
          departurePercent: Number((((zHigh - zLow) / breakoutBar.close) * 100).toFixed(2)),
          strengthScore: hScore,
          heuristicQualityScore: hScore,
          testedCount,
          isDepleted: testedCount >= 2,
          isMitigated,
          mitigatedIndex,
          mitigatedTime,
          volatilityAtCreation: Number(atrI.toFixed(2)),
          baseLength: 1,
          trendConfluence: 'counter-trend',
          confluenceTags: [
            'Failed Breakout (Swing Low)',
            'Provisional Swing Demand',
            'Daily/HTF Options Edge',
            testedCount === 0 && !isMitigated ? 'Fresh Untested (Max Edge)' : 'Tested',
          ].filter(Boolean) as string[],
          barAge,
          distanceInAtr: distInAtr,
          proximityPhase: distInAtr <= 0.8
            ? 'Phase B: Zone Touch (Execute)'
            : distInAtr <= 1.5
            ? 'Phase A: Staging (1.0–1.5x ATR)'
            : 'Dormant (>1.5x ATR)',
          notes: `Failed breakout demand: ${lookback}-bar low ${swingLow.toFixed(2)} taken out then closed back above by bar ${j}`,
        });
        break;
      }
    }
  }

  return rawZones;
}
