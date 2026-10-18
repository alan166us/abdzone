import { Candle, VolatilityMetrics } from '../types/trading';
import { calculateSessionLiquidityLevels } from './vwapEngine';

/**
 * Calculates True Range for each candle
 */
export function calculateTrueRange(candles: Candle[]): number[] {
  if (candles.length === 0) return [];
  const tr: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const trCurrent = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trCurrent);
  }

  return tr;
}

/**
 * Calculates 14-period Wilder's Smoothed Average True Range (ATR)
 * Clamped with a floor of currentPrice * 0.0005 to prevent zero-division and invalid stop multipliers
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  const tr = calculateTrueRange(candles);
  if (tr.length === 0) return [];

  const atr: number[] = new Array(candles.length).fill(0);

  if (tr.length < period) {
    const avg = tr.reduce((a, b) => a + b, 0) / tr.length;
    return candles.map(c => Math.max(c.close * 0.0005, avg));
  }

  // Initial SMA of TR for the first 'period' candles
  let firstSum = 0;
  for (let i = 0; i < period; i++) {
    firstSum += tr[i];
  }
  let currentAtr = firstSum / period;
  atr[period - 1] = Math.max(candles[period - 1].close * 0.0005, currentAtr);

  // Wilder smoothing: ATR[i] = (ATR[i-1] * (period - 1) + TR[i]) / period
  for (let i = period; i < candles.length; i++) {
    currentAtr = (currentAtr * (period - 1) + tr[i]) / period;
    const currentPrice = candles[i].close;
    atr[i] = Math.max(currentPrice * 0.0005, currentAtr);
  }

  // Fill in beginning for clean look with floor protection
  for (let i = 0; i < period - 1; i++) {
    atr[i] = Math.max(candles[i].close * 0.0005, atr[period - 1]);
  }

  return atr;
}

/**
 * Calculates rolling 20-period Annualized Historical Volatility (HV)
 */
export function calculateHistoricalVolatility(candles: Candle[], period: number = 20, isCrypto: boolean = false): number[] {
  const n = candles.length;
  if (n < 2) return new Array(n).fill(0.2);

  // 1. Calculate log returns: ln(Close_t / Close_t-1)
  const logReturns: number[] = [0];
  for (let i = 1; i < n; i++) {
    const prev = candles[i - 1].close;
    const curr = candles[i].close;
    logReturns.push(prev > 0 ? Math.log(curr / prev) : 0);
  }

  const hv: number[] = new Array(n).fill(0);
  const annualFactor = Math.sqrt(isCrypto ? 365 : 252);

  for (let i = 0; i < n; i++) {
    if (i < period) {
      // Approximate with available
      const slice = logReturns.slice(0, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / Math.max(1, slice.length - 1);
      hv[i] = Math.sqrt(variance) * annualFactor;
    } else {
      const slice = logReturns.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (period - 1);
      hv[i] = Math.sqrt(variance) * annualFactor;
    }
  }

  return hv;
}

/**
 * Calculates Bollinger Bands (20 period, 2 std dev)
 */
export function calculateBollingerBands(candles: Candle[], period: number = 20, multiplier: number = 2) {
  const n = candles.length;
  const upper: number[] = new Array(n).fill(0);
  const middle: number[] = new Array(n).fill(0);
  const lower: number[] = new Array(n).fill(0);
  const width: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const startIdx = Math.max(0, i - period + 1);
    const window = candles.slice(startIdx, i + 1);
    const sum = window.reduce((acc, c) => acc + c.close, 0);
    const sma = sum / window.length;

    const variance = window.reduce((acc, c) => acc + Math.pow(c.close - sma, 2), 0) / window.length;
    const stdDev = Math.sqrt(variance);

    middle[i] = sma;
    upper[i] = sma + multiplier * stdDev;
    lower[i] = sma - multiplier * stdDev;
    width[i] = sma > 0 ? ((upper[i] - lower[i]) / sma) * 100 : 0;
  }

  return { upper, middle, lower, width };
}

/**
 * Computes latest Volatility Metrics and determines the market regime
 */
export function getLatestVolatilityMetrics(candles: Candle[], isCrypto: boolean = false): VolatilityMetrics {
  const sessionLevels = calculateSessionLiquidityLevels(candles);

  if (candles.length === 0) {
    return {
      atr: 1,
      atrPercent: 1,
      annualizedHV: 0.25,
      bbUpper: 100,
      bbMiddle: 100,
      bbLower: 100,
      bbWidth: 5,
      regime: 'Normal',
      recommendedBufferMultiplier: 1.35,
      sessionLevels,
    };
  }

  const atrs = calculateATR(candles, 14);
  const hvs = calculateHistoricalVolatility(candles, 20, isCrypto);
  const bb = calculateBollingerBands(candles, 20, 2);

  const lastIdx = candles.length - 1;
  const currentAtr = atrs[lastIdx] || 1;
  const currentPrice = candles[lastIdx].close || 1;
  const atrPercent = (currentAtr / currentPrice) * 100;
  const currentHV = hvs[lastIdx] || 0.3;
  const currentBbWidth = bb.width[lastIdx] || 5;

  // Determine Volatility Regime
  // Compare current BB width against 50-candle average width
  const recentWidths = bb.width.slice(Math.max(0, lastIdx - 50));
  const avgWidth = recentWidths.reduce((a, b) => a + b, 0) / recentWidths.length;

  let regime: VolatilityMetrics['regime'] = 'Normal';
  let recommendedBufferMultiplier = 1.35;

  if (currentBbWidth < avgWidth * 0.7) {
    regime = 'Compression (Squeeze)';
    recommendedBufferMultiplier = 1.25; // Tight base, breakout pending
  } else if (currentBbWidth > avgWidth * 1.5 || currentHV > 0.65) {
    regime = 'Expansion (High Volatility)';
    recommendedBufferMultiplier = 1.6; // High volatility: needs wider buffer against stop runs
  } else if (currentHV > 0.95 || atrPercent > 6.0) {
    regime = 'Extreme Impulse';
    recommendedBufferMultiplier = 1.85;
  }

  return {
    atr: currentAtr,
    atrPercent,
    annualizedHV: currentHV,
    bbUpper: bb.upper[lastIdx],
    bbMiddle: bb.middle[lastIdx],
    bbLower: bb.lower[lastIdx],
    bbWidth: currentBbWidth,
    regime,
    recommendedBufferMultiplier,
    sessionLevels,
  };
}
