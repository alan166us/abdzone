import { TradeRecommendation, VolatilityMetrics } from '../types/trading';
import {
  getContractPointValue,
  isFuturesSymbol,
  isSp500Futures,
  isNasdaqFutures,
  getFuturesRoot,
} from './contractSpecs';

export {
  getContractPointValue,
  isFuturesSymbol,
  isSp500Futures,
  isNasdaqFutures,
  getFuturesRoot,
};

export type ExpirationStyle = 'weekly' | 'swing' | 'monthly';
export type StrikeBias = 'ITM' | 'ATM' | 'OTM';
export type InstrumentType = 'EQUITY_OPTION' | 'FUTURES_OPTION';

export interface SchwabOptionContractRecommendation {
  id: string;
  isModelEstimate: true; // Explicit flag indicating mathematical model price estimate
  estimatedModelLabel: string; // 'Estimated Premium (Black-Scholes/HV Approximation)'
  side: 'long' | 'short';
  optionType: 'CALL' | 'PUT';
  instrumentType: InstrumentType;
  ticker: string;
  underlyingPrice: number;
  strike: number;
  strikeBias: StrikeBias;
  expirationStr: string;
  expirationDisplay: string;
  tosExpirationStr: string;
  occSymbol: string;
  daysToExpiration: number;
  expirationStyle: ExpirationStyle;
  pointMultiplier: number; // e.g. 5.0 for /MES, 100 for equity options

  // 1. ENTRY SPECIFICATIONS
  entry: {
    premium: number;           // $/pt or $/share (e.g. 3.45)
    costPerContract: number;   // $345 for equity, or $5*premium for /MES
    orderType: 'LIMIT';
    underlyingTrigger: number; // e.g. 574.20
    action: 'Buy to Open';
    description: string;
  };

  // 2. STOP-LOSS SPECIFICATIONS
  stopLoss: {
    premium: number;           // $/share (e.g. 2.10)
    lossPerContract: number;   // -$135
    percentLoss: number;       // -39%
    orderType: 'STOP' | 'STOP LIMIT';
    underlyingTrigger: number; // e.g. 571.10 (with ATR buffer)
    action: 'Sell to Close';
    description: string;
  };

  // 3. TARGET SPECIFICATIONS
  target: {
    // Primary Target (TP2 - Zone Target)
    premium: number;           // $/share (e.g. 6.50)
    profitPerContract: number; // +$305
    percentGain: number;       // +88%
    underlyingTrigger: number; // e.g. 578.90
    action: 'Sell to Close';
    orderType: 'LIMIT';
    riskRewardRatio: number;   // e.g. 2.26

    // Multi-milestone targets
    tp1: {
      premium: number;
      profitPerContract: number;
      percentGain: number;
      underlyingTrigger: number;
      label: string;
    };
    tp2: {
      premium: number;
      profitPerContract: number;
      percentGain: number;
      underlyingTrigger: number;
      label: string;
    };
    tp3: {
      premium: number;
      profitPerContract: number;
      percentGain: number;
      underlyingTrigger: number;
      label: string;
    };
  };

  // Greeks & Volatility
  delta: number;
  theta: number;
  gamma: number;
  impliedVolEstimate: number;
  ivRegime: string;

  // Charles Schwab Portal & thinkorswim Command Strings
  schwabPortalSlip: {
    symbol: string;
    strategy: 'Single Option';
    action: 'Buy to Open';
    expiration: string;
    strike: number;
    optionType: 'CALL' | 'PUT';
    orderType: 'Limit';
    limitPrice: number;
    bracketProfitTarget: number;
    bracketStopLoss: number;
    timing: 'Day' | 'GTC';
  };
  tosDotSymbol: string; // e.g. .SPY251017C575
  tosVerifiedSingleCommand: string; // e.g. BUY +1 .SPY251017C575 @3.45 LMT
  tosNaturalCommand: string; // e.g. BUY +1 SPY 100 17 OCT 25 575 CALL @3.45 LMT (Universal TOS parser format)
  schwabOrderCommand: string; // thinkorswim 1-line format
  schwabBracketCommand: string; // thinkorswim 1st triggers OCO format
  schwabWebSummary: string; // Human-readable clipboard string for Schwab.com
  rationale: string;
}

/**
 * Calculates optimal option strike rounding based on underlying share price and ticker specifications
 * e.g. /MES, /ES: 5-point CME strikes; /MNQ, /NQ: 25-point CME strikes; SPY/QQQ: $1 strikes; NVDA: $2.5 strikes
 */
export function getStrikeIncrement(price: number, ticker?: string): number {
  if (ticker) {
    const root = getFuturesRoot(ticker);
    if (root === 'ES' || root === 'MES') return 5.0; // 5-point standard CME listed strike interval
    if (root === 'NQ' || root === 'MNQ') return 25.0; // 25-point standard CME listed strike interval
    if (root === 'RTY' || root === 'M2K') return 10.0;
    if (root === 'CL') return 0.5;
    if (root === 'GC') return 10.0;
    if (root === 'YM' || root === 'MYM') return 25.0;
  }
  if (price > 400) return 1.0; // SPY, QQQ have $1 strikes
  if (price > 100) return 2.5;
  if (price > 50) return 1.0;
  return 0.5;
}

/**
 * CME & OCC Futures Options Symbol Validator
 * Validates symbols and ensures CME futures options strikes snap to listed increments
 * (e.g. 5-point intervals for /MES like 5800, 5805) without non-tradable fractional numbers.
 */
export function validateTosSymbol(symbol: string, strike?: number): { valid: boolean; reason?: string } {
  if (!symbol || !symbol.trim()) {
    return { valid: false, reason: 'Symbol cannot be empty.' };
  }
  const root = getFuturesRoot(symbol);
  const isFutures = isFuturesSymbol(symbol);

  if (isFutures && strike !== undefined) {
    if (!Number.isFinite(strike) || strike <= 0) {
      return { valid: false, reason: `Invalid strike price: ${strike}` };
    }
    if (root === 'ES' || root === 'MES') {
      if (strike % 5 !== 0 || !Number.isInteger(strike)) {
        return { valid: false, reason: `CME /MES & /ES strikes must snap to 5-point increments (e.g. 5800, 5805). Strike received: ${strike}` };
      }
    } else if (root === 'NQ' || root === 'MNQ') {
      if (strike % 25 !== 0 || !Number.isInteger(strike)) {
        return { valid: false, reason: `CME /MNQ & /NQ strikes must snap to 25-point increments. Strike received: ${strike}` };
      }
    } else if (!Number.isInteger(strike * 10)) {
      return { valid: false, reason: `Futures strike has non-tradable fractional precision: ${strike}` };
    }
  }

  return { valid: true };
}

/**
 * Generate standard Friday expiration dates matching Charles Schwab option cycles
 */
function getExpirationDetails(style: ExpirationStyle = 'swing'): {
  expIso: string;
  expDisplay: string;
  tosStr: string;
  daysToExpiration: number;
} {
  const d = new Date();
  let daysForward = 14;

  if (style === 'weekly') {
    // Nearest upcoming Friday (minimum 2 days ahead)
    const dayOfWeek = d.getDay();
    let diff = (5 - dayOfWeek + 7) % 7;
    if (diff < 2) diff += 7;
    daysForward = diff;
  } else if (style === 'swing') {
    // Standard 2-week swing (~12-16 days forward to Friday)
    const dayOfWeek = d.getDay();
    let diff = (5 - dayOfWeek + 7) % 7;
    daysForward = diff + 7;
    if (daysForward < 9) daysForward += 7;
  } else if (style === 'monthly') {
    // ~30-40 days forward to 3rd Friday of following month
    daysForward = 32;
    const dayOfWeek = d.getDay();
    const diff = (5 - dayOfWeek + 7) % 7;
    daysForward += diff;
  }

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysForward);

  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dd = String(targetDate.getDate()).padStart(2, '0');
  const mmm = months[targetDate.getMonth()];
  const yy = String(targetDate.getFullYear()).slice(-2);
  const yyyy = targetDate.getFullYear();
  const mmNum = String(targetDate.getMonth() + 1).padStart(2, '0');

  return {
    expIso: `${yyyy}-${mmNum}-${dd}`,
    expDisplay: `${mmm} ${dd}, ${yyyy}`,
    tosStr: `${dd} ${mmm} ${yy}`,
    daysToExpiration: daysForward,
  };
}

/**
 * Constructs standard OCC Option Symbol (e.g. SPY   251017C00575000)
 * or CME Futures Option Symbol for /MES (e.g. /MS261023C5800)
 */
function formatOccSymbol(ticker: string, expIso: string, type: 'CALL' | 'PUT', strike: number): string {
  const root = getFuturesRoot(ticker);
  const isFutures = isFuturesSymbol(ticker);
  const [yyyy, mm, dd] = expIso.split('-');
  const yy = yyyy.slice(-2);
  const typeLetter = type === 'CALL' ? 'C' : 'P';

  if (isFutures) {
    // CME Futures Options OCC format: e.g. /MS261023C7865 for /MES or /MS[EXP][C/P][STRIKE]
    let occRoot = '/MS';
    if (root === 'MES') occRoot = '/MS';
    else if (root === 'MNQ') occRoot = '/MQ';
    else if (root === 'ES') occRoot = '/ES';
    else if (root === 'NQ') occRoot = '/NQ';
    else if (root) occRoot = `/${root}`;
    else occRoot = ticker.startsWith('/') ? ticker.toUpperCase() : `/${ticker.toUpperCase()}`;
    return `${occRoot}${yy}${mm}${dd}${typeLetter}${Math.round(strike)}`;
  }

  const clean = ticker.trim().toUpperCase().replace('/', '');
  const cleanTicker = clean.padEnd(6, ' ').slice(0, 6);
  const strikeFormatted = String(Math.round(strike * 1000)).padStart(8, '0');
  return `${cleanTicker}${yy}${mm}${dd}${typeLetter}${strikeFormatted}`;
}

/**
 * Generates institutional Schwab Option trade setups anchored on Supply & Demand zones
 * with strict Entry, Stop-Loss, and Target parameters.
 */
export function generateSchwabOptionPlay(
  rec: TradeRecommendation,
  ticker: string,
  volatilityMetrics: VolatilityMetrics,
  options?: {
    expirationStyle?: ExpirationStyle;
    strikeBias?: StrikeBias;
  }
): SchwabOptionContractRecommendation | null {
  const expirationStyle = options?.expirationStyle || 'swing';
  const strikeBias = options?.strikeBias || 'ITM';

  const isCall = rec.side === 'long';
  const rawTicker = ticker || rec.symbol || 'SPY';
  const cleanTicker = rawTicker.replace(/^(SCHWAB:|EXCHANGE:)/, '').trim().toUpperCase();
  const underlying = rec.entry;

  const isIndexFutures = isSp500Futures(cleanTicker);
  const isNqFamily = isNasdaqFutures(cleanTicker);

  const isPolluted =
    (isIndexFutures && (rec.entry < 2000 || underlying < 2000)) ||
    (isNqFamily && (rec.entry < 5000 || underlying < 5000));

  // Never invent prices — refuse to build a ticket
  if (isPolluted) {
    console.warn(
      `[optionsEngine] Refusing option play: polluted coordinates for ${cleanTicker}`,
      { entry: rec.entry, underlying }
    );
    return null;
  }

  const spotPrice = underlying;
  const triggerEntry = rec.entry;
  const triggerStopLoss = rec.stopLoss;
  const triggerTp1 = rec.takeProfit1;
  const triggerTp2 = rec.takeProfit2;
  const triggerTp3 = rec.takeProfit3;

  const increment = getStrikeIncrement(spotPrice, cleanTicker);

  // Expiration calculation
  const expDetails = getExpirationDetails(expirationStyle);
  const { expIso, expDisplay, tosStr, daysToExpiration } = expDetails;

  const isFutures = isFuturesSymbol(cleanTicker);
  const instrumentType: InstrumentType = isFutures ? 'FUTURES_OPTION' : 'EQUITY_OPTION';
  const actualTicker = isFutures ? (cleanTicker.startsWith('/') ? cleanTicker : `/${cleanTicker}`) : cleanTicker;
  const pointMultiplier = getContractPointValue(actualTicker, true);

  // Strike Selection based on bias (ITM / ATM / OTM)
  const atmStrike = isIndexFutures ? Math.round(spotPrice / 5) * 5 : Math.round(spotPrice / increment) * increment;
  let strike = atmStrike;

  if (isCall) {
    if (strikeBias === 'ITM') {
      strike = Math.floor(spotPrice / increment) * increment;
      if (strike === atmStrike && spotPrice > increment) {
        strike = atmStrike - increment;
      }
    } else if (strikeBias === 'OTM') {
      strike = atmStrike + increment;
    } else {
      strike = atmStrike;
    }
  } else {
    // PUT
    if (strikeBias === 'ITM') {
      strike = Math.ceil(spotPrice / increment) * increment;
      if (strike === atmStrike) {
        strike = atmStrike + increment;
      }
    } else if (strikeBias === 'OTM') {
      strike = Math.max(increment, atmStrike - increment);
    } else {
      strike = atmStrike;
    }
  }

  // Snap strike to listed exchange increments before constructing order strings
  if (isFutures) {
    const root = getFuturesRoot(actualTicker);
    if (root === 'ES' || root === 'MES') {
      strike = Math.round(spotPrice / 5) * 5;
      if (strikeBias === 'ITM') strike = isCall ? strike - 5 : strike + 5;
      else if (strikeBias === 'OTM') strike = isCall ? strike + 5 : strike - 5;
    } else if (root === 'NQ' || root === 'MNQ') {
      strike = Math.round(spotPrice / 25) * 25;
      if (strikeBias === 'ITM') strike = isCall ? strike - 25 : strike + 25;
      else if (strikeBias === 'OTM') strike = isCall ? strike + 25 : strike - 25;
    } else if (root === 'RTY' || root === 'M2K') {
      strike = Math.round(spotPrice / 10) * 10;
      if (strikeBias === 'ITM') strike = isCall ? strike - 10 : strike + 10;
      else if (strikeBias === 'OTM') strike = isCall ? strike + 10 : strike - 10;
    } else {
      strike = Math.round(spotPrice);
    }
  } else {
    strike = Number((Math.round(strike / increment) * increment).toFixed(2));
  }

  // Symbol and Strike Validation with snapping fallback
  let validation = validateTosSymbol(actualTicker, strike);
  if (!validation.valid) {
    const root = getFuturesRoot(actualTicker);
    if (root === 'ES' || root === 'MES') {
      strike = Math.round(strike / 5) * 5;
    } else if (root === 'NQ' || root === 'MNQ') {
      strike = Math.round(strike / 25) * 25;
    } else if (root === 'RTY' || root === 'M2K') {
      strike = Math.round(strike / 10) * 10;
    } else {
      strike = Number((Math.round(strike / Math.max(increment, 0.5)) * Math.max(increment, 0.5)).toFixed(2));
    }
    validation = validateTosSymbol(actualTicker, strike);
    if (!validation.valid) {
      console.warn('[optionsEngine] Strike still invalid after snap:', validation.reason);
      return null;
    }
  }

  // Model option premium and Greeks dynamically
  const hv = volatilityMetrics.annualizedHV ? volatilityMetrics.annualizedHV / 100 : 0.26;
  const dteFactor = Math.sqrt(daysToExpiration / 365);
  
  // Base ATM intrinsic/extrinsic ratio
  let approxDelta = isCall ? 0.52 : -0.52;
  if (strikeBias === 'ITM') {
    approxDelta = isCall ? 0.68 : -0.68;
  } else if (strikeBias === 'OTM') {
    approxDelta = isCall ? 0.38 : -0.38;
  }

  // Baseline option price calculation using volatility and time
  const moneynessDistance = isCall ? (spotPrice - strike) : (strike - spotPrice);
  const intrinsicValue = Math.max(0, moneynessDistance);
  const timeValue = Math.max(0.60, spotPrice * hv * dteFactor * 0.40);
  
  // Calculate Entry Premium
  const rawEntry = intrinsicValue + timeValue;
  const entryPremium = Number(Math.max(0.85, Math.min(rawEntry, spotPrice * 0.12)).toFixed(2));
  
  const costPerContract = Math.round(entryPremium * pointMultiplier);

  // Projected stock moves from zone geometry
  const underlyingTargetMove = Math.abs(triggerTp2 - triggerEntry);
  const underlyingStopMove = Math.abs(triggerEntry - triggerStopLoss);

  // Option price movement based on delta + gamma acceleration
  const gammaMultiplier = 1.12;
  const optionTargetGain = underlyingTargetMove * Math.abs(approxDelta) * gammaMultiplier;
  const optionStopDecline = underlyingStopMove * Math.abs(approxDelta) * 0.88;

  // 1. ENTRY
  const entry = {
    premium: entryPremium,
    costPerContract,
    orderType: 'LIMIT' as const,
    underlyingTrigger: triggerEntry,
    action: 'Buy to Open' as const,
    description: `Limit buy order placed at $${entryPremium.toFixed(2)} when ${actualTicker} enters the zone at $${triggerEntry.toFixed(2)}.`,
  };

  // 2. STOP-LOSS
  // Stop is set when underlying hits the buffered zone boundary (SL), modeling contract value at that point
  const calculatedStopPremium = Math.max(0.25, entryPremium - optionStopDecline);
  const stopPremium = Number(calculatedStopPremium.toFixed(2));
  const stopLossPerContract = Number(((entryPremium - stopPremium) * pointMultiplier).toFixed(2));
  const stopPercentLoss = Math.round(((entryPremium - stopPremium) / entryPremium) * 100);

  const stopLoss = {
    premium: stopPremium,
    lossPerContract: -Math.round(stopLossPerContract),
    percentLoss: -Math.min(99, stopPercentLoss),
    orderType: 'STOP' as const,
    underlyingTrigger: triggerStopLoss,
    action: 'Sell to Close' as const,
    description: `Exit contract immediately if option falls to $${stopPremium.toFixed(2)} or ${actualTicker} violates buffered stop at $${triggerStopLoss.toFixed(2)}.`,
  };

  // 3. TARGET (TP)
  const calculatedTargetPremium = Math.max(entryPremium * 1.35, entryPremium + optionTargetGain);
  const targetPremium = Number(calculatedTargetPremium.toFixed(2));
  const profitPerContract = Math.round((targetPremium - entryPremium) * pointMultiplier);
  const targetPercentGain = Math.round(((targetPremium - entryPremium) / entryPremium) * 100);

  // Multi-targets
  const tp1StockMove = Math.abs(triggerTp1 - triggerEntry);
  const tp1Premium = Number(Math.max(entryPremium * 1.25, entryPremium + tp1StockMove * Math.abs(approxDelta)).toFixed(2));
  const tp1Profit = Math.round((tp1Premium - entryPremium) * pointMultiplier);
  const tp1Percent = Math.round(((tp1Premium - entryPremium) / entryPremium) * 100);

  const tp3StockMove = Math.abs(triggerTp3 - triggerEntry);
  const tp3Premium = Number(Math.max(targetPremium * 1.35, entryPremium + tp3StockMove * Math.abs(approxDelta) * 1.25).toFixed(2));
  const tp3Profit = Math.round((tp3Premium - entryPremium) * pointMultiplier);
  const tp3Percent = Math.round(((tp3Premium - entryPremium) / entryPremium) * 100);

  const optionRR = stopLossPerContract > 0 ? Number((profitPerContract / stopLossPerContract).toFixed(1)) : 2.5;

  const target = {
    premium: targetPremium,
    profitPerContract,
    percentGain: targetPercentGain,
    underlyingTrigger: triggerTp2,
    action: 'Sell to Close' as const,
    orderType: 'LIMIT' as const,
    riskRewardRatio: optionRR,
    tp1: {
      premium: tp1Premium,
      profitPerContract: tp1Profit,
      percentGain: tp1Percent,
      underlyingTrigger: triggerTp1,
      label: 'TP1 (Conservative 1:2 R:R)',
    },
    tp2: {
      premium: targetPremium,
      profitPerContract,
      percentGain: targetPercentGain,
      underlyingTrigger: triggerTp2,
      label: 'TP2 (Major Opposing Zone)',
    },
    tp3: {
      premium: tp3Premium,
      profitPerContract: tp3Profit,
      percentGain: tp3Percent,
      underlyingTrigger: triggerTp3,
      label: 'TP3 (Trend Runner)',
    },
  };

  const optionTypeStr = isCall ? 'CALL' : 'PUT';
  const occSymbol = formatOccSymbol(actualTicker, expIso, optionTypeStr, strike);

  const [yyyy, mm, dd] = expIso.split('-');
  const yy = yyyy.slice(-2);
  const typeLetter = optionTypeStr === 'CALL' ? 'C' : 'P';
  const tosDotSymbol = isFutures ? actualTicker : `.${cleanTicker}${yy}${mm}${dd}${typeLetter}${strike}`;

  // thinkorswim Single Limit Order
  const tosVerifiedSingleCommand = isFutures
    ? `BUY +1 ${actualTicker} ${tosStr} ${strike} ${optionTypeStr} @${entryPremium.toFixed(2)} LMT`
    : `BUY +1 ${tosDotSymbol} @${entryPremium.toFixed(2)} LMT`;

  // thinkorswim Natural Language Order Command
  // For futures options: CME format "/MES [EXP] [STRIKE] [CALL/PUT]" without "100" deliverable
  // For equity options: "BUY +1 SINGLE [TICKER] 100 [EXP] [STRIKE] [CALL/PUT]"
  const tosNaturalCommand = formatTosNaturalOptionCommand(
    actualTicker,
    tosStr,
    strike,
    optionTypeStr,
    entryPremium,
    1
  );

  const schwabOrderCommand = tosNaturalCommand;

  // Complete ThinkorSwim 1st Triggers OCO Compound Bracket String (3 legs separated by /)
  const schwabBracketCommand = formatTosCompoundOptionBracketCommand(
    actualTicker,
    tosStr,
    strike,
    optionTypeStr,
    entryPremium,
    stopPremium,
    targetPremium,
    1
  );

  const estimateBanner = [
    '⚠️ MODEL ESTIMATE — NOT LIVE MARKET DATA',
    'Premiums & Greeks are theoretical (HV approximation).',
    'Verify live bid/ask on thinkorswim / Schwab before routing.',
    '-----------------------------------------',
  ].join('\n');

  // Clean Schwab Portal Summary Slip for copy/paste into Schwab.com
  const schwabWebSummary = isFutures
    ? [
        estimateBanner,
        `=== CHARLES SCHWAB / THINKORSWIM FUTURES OPTIONS TICKET ===`,
        `CONTRACT:      ${actualTicker} ${expDisplay} $${strike} ${optionTypeStr}`,
        `ACTION:        Buy to Open`,
        `ORDER TYPE:    Limit with OCO Bracket`,
        `MULTIPLIER:    $${pointMultiplier.toFixed(2)}/point`,
        `-----------------------------------------`,
        `1. ENTRY LIMIT:       $${entryPremium.toFixed(2)} ($${costPerContract}/contract) [Futures Trigger: $${triggerEntry.toFixed(2)}]`,
        `2. STOP-LOSS (SL):    $${stopPremium.toFixed(2)} (-$${Math.abs(stopLoss.lossPerContract)}/contract, ${stopLoss.percentLoss}%) [Futures Trigger: $${triggerStopLoss.toFixed(2)}]`,
        `3. TARGET (TP):       $${targetPremium.toFixed(2)} (+$${profitPerContract}/contract, +${targetPercentGain}%) [Futures Target: $${triggerTp2.toFixed(2)}]`,
        `-----------------------------------------`,
        `RISK / REWARD: 1 : ${optionRR} | DELTA: ${approxDelta}`,
        `CME/OCC SYMBOL: ${occSymbol}`,
      ].join('\n')
    : [
        estimateBanner,
        `=== CHARLES SCHWAB OPTION TRADE ORDER ===`,
        `TICKER:        ${cleanTicker}`,
        `STRATEGY:      Buy Single Option (${strikeBias})`,
        `CONTRACT:      ${cleanTicker} ${expDisplay} $${strike} ${optionTypeStr}`,
        `ACTION:        Buy to Open`,
        `ORDER TYPE:    Limit with OCO Bracket`,
        `MULTIPLIER:    100 shares/contract`,
        `-----------------------------------------`,
        `1. ENTRY LIMIT:       $${entryPremium.toFixed(2)} ($${costPerContract}/contract) [Stock Trigger: $${triggerEntry.toFixed(2)}]`,
        `2. STOP-LOSS (SL):    $${stopPremium.toFixed(2)} (-$${Math.abs(stopLoss.lossPerContract)}/contract, ${stopLoss.percentLoss}%) [Stock Trigger: $${triggerStopLoss.toFixed(2)}]`,
        `3. TARGET (TP):       $${targetPremium.toFixed(2)} (+$${profitPerContract}/contract, +${targetPercentGain}%) [Stock Target: $${triggerTp2.toFixed(2)}]`,
        `-----------------------------------------`,
        `RISK / REWARD: 1 : ${optionRR} | DELTA: ${approxDelta}`,
        `OCC SYMBOL:    ${occSymbol}`,
      ].join('\n');

  return {
    id: `opt-${rec.id}-${expirationStyle}-${strikeBias}`,
    isModelEstimate: true,
    estimatedModelLabel: 'Estimated Premium (Black-Scholes/HV Approximation)',
    side: rec.side,
    optionType: optionTypeStr,
    instrumentType,
    ticker: actualTicker,
    underlyingPrice: spotPrice,
    strike,
    strikeBias,
    expirationStr: expIso,
    expirationDisplay: expDisplay,
    tosExpirationStr: tosStr,
    occSymbol,
    daysToExpiration,
    expirationStyle,
    pointMultiplier,
    entry,
    stopLoss,
    target,
    delta: approxDelta,
    theta: Number((-entryPremium * (0.025 + 0.05 / Math.sqrt(daysToExpiration))).toFixed(2)),
    gamma: Number((0.022 * (100 / underlying)).toFixed(3)),
    impliedVolEstimate: Math.round(hv * 100),
    ivRegime: volatilityMetrics.regime,
    schwabPortalSlip: {
      symbol: cleanTicker,
      strategy: 'Single Option',
      action: 'Buy to Open',
      expiration: expDisplay,
      strike,
      optionType: optionTypeStr,
      orderType: 'Limit',
      limitPrice: entryPremium,
      bracketProfitTarget: targetPremium,
      bracketStopLoss: stopPremium,
      timing: 'Day',
    },
    tosDotSymbol,
    tosVerifiedSingleCommand,
    tosNaturalCommand,
    schwabOrderCommand,
    schwabBracketCommand,
    schwabWebSummary,
    rationale: isCall
      ? `Institutional Demand Zone at $${rec.entry.toFixed(2)} provides strong reversal tailwinds. Buying ${strike} Strike Call ($${entryPremium.toFixed(2)}/sh). Target $${targetPremium.toFixed(2)} (+${targetPercentGain}%) when stock reaches $${rec.takeProfit2.toFixed(2)}. Invalidate at $${stopPremium.toFixed(2)} if stock pierces $${rec.stopLoss.toFixed(2)}.`
      : `Institutional Supply Zone at $${rec.entry.toFixed(2)} defends strong resistance. Buying ${strike} Strike Put ($${entryPremium.toFixed(2)}/sh). Target $${targetPremium.toFixed(2)} (+${targetPercentGain}%) when stock drops to $${rec.takeProfit2.toFixed(2)}. Invalidate at $${stopPremium.toFixed(2)} if stock pierces $${rec.stopLoss.toFixed(2)}.`,
  };
}

/**
 * Formats a verified thinkorswim option limit command with custom contract quantity
 */
export function formatTosOptionCommand(tosDotSymbol: string, premium: number, qty: number = 1): string {
  const signQty = qty >= 0 ? `+${qty}` : `${qty}`;
  return `BUY ${signQty} ${tosDotSymbol} @${premium.toFixed(2)} LMT`;
}

/**
 * Formats a universal thinkorswim natural language option order
 * (e.g. BUY +1 SINGLE IREN 100 23 OCT 26 37.5 PUT @3.25 LMT)
 * CRITICAL: Thinkorswim desktop "Paste order from clipboard" requires "SINGLE"
 * immediately after the quantity (+1, +2, etc.) to identify a single-leg option contract.
 * Without "SINGLE", thinkorswim parses the ticker as common stock (BUY +2 IREN),
 * discarding the expiration and strike, and populating the order entry with shares of STOCK!
 */
export function formatTosNaturalOptionCommand(
  ticker: string,
  tosExpirationStr: string,
  strike: number,
  optionType: 'CALL' | 'PUT',
  premium: number,
  qty: number = 1
): string {
  const signQty = qty >= 0 ? `+${qty}` : `${qty}`;
  const cleanTicker = ticker.trim().toUpperCase();
  const isFutures = isFuturesSymbol(cleanTicker);
  const actualSym = isFutures ? (cleanTicker.startsWith('/') ? cleanTicker : `/${cleanTicker}`) : cleanTicker.replace('/', '');
  
  if (isFutures) {
    // CME Futures Options format: /MES [EXP] [STRIKE] [CALL/PUT] (no "100" deliverable, no equity format)
    return `BUY ${signQty} ${actualSym} ${tosExpirationStr} ${strike} ${optionType} @${premium.toFixed(2)} LMT`;
  }

  return `BUY ${signQty} SINGLE ${actualSym} 100 ${tosExpirationStr} ${strike} ${optionType} @${premium.toFixed(2)} LMT`;
}

/**
 * Formats a universal thinkorswim natural language option exit order (Target Limit or Stop-Loss Stop)
 * (e.g. SELL -1 SINGLE TSLA 100 23 OCT 26 541 PUT @3.50 LMT or SELL -2 SINGLE TSLA 100 23 OCT 26 541 PUT @0.45 STP)
 */
export function formatTosNaturalOptionExitCommand(
  ticker: string,
  tosExpirationStr: string,
  strike: number,
  optionType: 'CALL' | 'PUT',
  premium: number,
  orderType: 'LMT' | 'STP' = 'LMT',
  qty: number = 1
): string {
  const signQty = qty > 0 ? `-${qty}` : `${qty}`;
  const cleanTicker = ticker.trim().toUpperCase();
  const isFutures = isFuturesSymbol(cleanTicker);
  const actualSym = isFutures ? (cleanTicker.startsWith('/') ? cleanTicker : `/${cleanTicker}`) : cleanTicker.replace('/', '');

  if (isFutures) {
    // CME Futures Options exit format: /MES [EXP] [STRIKE] [CALL/PUT]
    return `SELL ${signQty} ${actualSym} ${tosExpirationStr} ${strike} ${optionType} @${premium.toFixed(2)} ${orderType}`;
  }

  return `SELL ${signQty} SINGLE ${actualSym} 100 ${tosExpirationStr} ${strike} ${optionType} @${premium.toFixed(2)} ${orderType}`;
}

/**
 * Formats a complete thinkorswim 1st Triggers OCO Compound Bracket Order for Outright Futures or Stock
 * e.g. BUY +1 /MES @5800.00 LMT [1st Triggers OCO: SELL -1 /MES @5825.00 LMT, SELL -1 /MES @5790.00 STP]
 */
export function formatTosCompoundStockOrFuturesBracketCommand(
  symbol: string,
  side: 'long' | 'short',
  qty: number,
  entryPrice: number,
  stopPrice: number,
  targetPrice: number
): string {
  const cleanSym = symbol.trim().toUpperCase();
  const isFutures = isFuturesSymbol(cleanSym);
  const actualSym = isFutures ? (cleanSym.startsWith('/') ? cleanSym : `/${cleanSym}`) : cleanSym;
  const isLong = side === 'long';
  const entryAction = isLong ? 'BUY' : 'SELL';
  const exitAction = isLong ? 'SELL' : 'BUY';
  return `${entryAction} +${qty} ${actualSym} @${entryPrice.toFixed(2)} LMT [1st Triggers OCO: ${exitAction} -${qty} ${actualSym} @${targetPrice.toFixed(2)} LMT, ${exitAction} -${qty} ${actualSym} @${stopPrice.toFixed(2)} STP]`;
}

/**
 * Formats a complete thinkorswim 1st Triggers OCO Compound Bracket Order for Options
 * BUY +Qty [Symbol] @Entry LMT [1st Triggers OCO: SELL -Qty [Symbol] @TP LMT, SELL -Qty [Symbol] @SL STP]
 * For Futures Options (/MES): BUY +1 /MES 23 OCT 26 5800 CALL @42.50 LMT [1st Triggers OCO: SELL -1 /MES 23 OCT 26 5800 CALL @65.00 LMT, SELL -1 /MES 23 OCT 26 5800 CALL @25.00 STP]
 * For Equity Options (SPY):  BUY +1 SINGLE SPY 100 23 OCT 26 575 CALL @3.45 LMT [1st Triggers OCO: SELL -1 SINGLE SPY 100 23 OCT 26 575 CALL @6.50 LMT, SELL -1 SINGLE SPY 100 23 OCT 26 575 CALL @2.10 STP]
 */
export function formatTosCompoundOptionBracketCommand(
  ticker: string,
  tosExpirationStr: string,
  strike: number,
  optionType: 'CALL' | 'PUT',
  entryPremium: number,
  stopPremium: number,
  targetPremium: number,
  qty: number = 1
): string {
  const cleanTicker = ticker.trim().toUpperCase();
  const isFutures = isFuturesSymbol(cleanTicker);
  const actualSym = isFutures ? (cleanTicker.startsWith('/') ? cleanTicker : `/${cleanTicker}`) : cleanTicker.replace('/', '');
  const signQty = qty >= 0 ? `+${qty}` : `${qty}`;
  const exitSignQty = qty > 0 ? `-${qty}` : `${qty}`;

  // Validate and sanitize strike to prevent non-tradable fractional numbers
  const valResult = validateTosSymbol(actualSym, strike);
  let tradableStrike = strike;
  if (!valResult.valid && isSp500Futures(actualSym)) {
    tradableStrike = Math.round(strike / 5) * 5;
  } else if (!valResult.valid && isNasdaqFutures(actualSym)) {
    tradableStrike = Math.round(strike / 25) * 25;
  }

  if (isFutures) {
    // CME Futures Options Bracket (no '100' share deliverable)
    const symbolStr = `${actualSym} ${tosExpirationStr} ${tradableStrike} ${optionType}`;
    return `BUY ${signQty} ${symbolStr} @${entryPremium.toFixed(2)} LMT [1st Triggers OCO: SELL ${exitSignQty} ${symbolStr} @${targetPremium.toFixed(2)} LMT, SELL ${exitSignQty} ${symbolStr} @${stopPremium.toFixed(2)} STP]`;
  }

  // Equity Options Bracket (standard 100 multiplier and single option format)
  const symbolStr = `SINGLE ${cleanTicker} 100 ${tosExpirationStr} ${tradableStrike} ${optionType}`;
  return `BUY ${signQty} ${symbolStr} @${entryPremium.toFixed(2)} LMT [1st Triggers OCO: SELL ${exitSignQty} ${symbolStr} @${targetPremium.toFixed(2)} LMT, SELL ${exitSignQty} ${symbolStr} @${stopPremium.toFixed(2)} STP]`;
}

/**
 * Formats thinkorswim Stock or Futures Limit Order Command
 * For Stocks: BUY +100 IREN @36.93 LMT or SELL -100 IREN @36.93 LMT
 * For Futures (/MES): BUY +1 /MES @5800.25 LMT or SELL -1 /MES @5800.25 LMT
 */
export function formatTosStockOrFuturesCommand(
  symbol: string,
  side: 'long' | 'short',
  qty: number,
  entryPrice: number
): string {
  const cleanSym = symbol.trim().toUpperCase();
  const isFutures = isFuturesSymbol(cleanSym);
  const actualSym = isFutures && !cleanSym.startsWith('/') ? `/${cleanSym}` : cleanSym;
  const action = side === 'long' ? 'BUY' : 'SELL';
  const signQty = side === 'long' ? `+${qty}` : `-${qty}`;
  return `${action} ${signQty} ${actualSym} @${entryPrice.toFixed(2)} LMT`;
}

/**
 * Human-readable Charles Schwab Equity or Futures Order Slip
 */
export function formatSchwabStockSummary(
  symbol: string,
  side: 'long' | 'short',
  shares: number,
  entry: number,
  stopLoss: number,
  takeProfit: number,
  rrRatio: number
): string {
  const cleanSym = symbol.trim().toUpperCase();
  const isFutures = isFuturesSymbol(cleanSym);
  const actualSym = isFutures ? (cleanSym.startsWith('/') ? cleanSym : `/${cleanSym}`) : cleanSym;
  const action = side === 'long' ? 'BUY (Long)' : 'SELL SHORT (Bearish)';
  const pointMultiplier = getContractPointValue(actualSym);

  return [
    `=== CHARLES SCHWAB ${isFutures ? 'FUTURES' : 'EQUITY'} ORDER TICKET ===`,
    `SYMBOL:       ${actualSym}`,
    `ACTION:       ${action}`,
    `QUANTITY:     ${shares} ${isFutures ? 'Contracts' : 'Shares'}`,
    `ORDER TYPE:   Limit with OCO Bracket`,
    ...(isFutures ? [`MULTIPLIER:   $${pointMultiplier.toFixed(2)}/point`] : []),
    `-----------------------------------------`,
    `1. ENTRY LIMIT:       $${entry.toFixed(2)}`,
    `2. STOP-LOSS (SL):    $${stopLoss.toFixed(2)} (with ATR buffer)`,
    `3. TARGET (TP):       $${takeProfit.toFixed(2)} (Opposing Zone)`,
    `-----------------------------------------`,
    `RISK / REWARD: 1 : ${rrRatio.toFixed(1)}`,
  ].join('\n');
}

/**
 * Generates a complete ThinkorSwim Order Blueprint Summary text block for clipboard or notes
 */
export function generateTosFullOrderSetSummary(
  optionPlay: SchwabOptionContractRecommendation,
  quantity: number = 2
): string {
  const safeQty = Math.max(1, Math.round(quantity));
  const entryLine = formatTosNaturalOptionCommand(
    optionPlay.ticker,
    optionPlay.tosExpirationStr,
    optionPlay.strike,
    optionPlay.optionType,
    optionPlay.entry.premium,
    safeQty
  );
  
  const compoundString = formatTosCompoundOptionBracketCommand(
    optionPlay.ticker,
    optionPlay.tosExpirationStr,
    optionPlay.strike,
    optionPlay.optionType,
    optionPlay.entry.premium,
    optionPlay.stopLoss.premium,
    optionPlay.target.tp2.premium,
    safeQty
  );

  if (quantity < 2) {
    const tpLine = formatTosNaturalOptionExitCommand(
      optionPlay.ticker,
      optionPlay.tosExpirationStr,
      optionPlay.strike,
      optionPlay.optionType,
      optionPlay.target.tp2.premium,
      'LMT',
      1
    );
    const slLine = formatTosNaturalOptionExitCommand(
      optionPlay.ticker,
      optionPlay.tosExpirationStr,
      optionPlay.strike,
      optionPlay.optionType,
      optionPlay.stopLoss.premium,
      'STP',
      1
    );
    return [
      `=== THINKORSWIM 1ST TRIGGERS OCO ORDER SET (1 CONTRACT) ===`,
      `[COMPOUND STRING]:  ${compoundString}`,
      `-------------------------------------------------------------`,
      `[ROW 1 - ENTRY]:   ${entryLine}`,
      `[ROW 2 - TP LMT]:  ${tpLine}`,
      `[ROW 3 - SL STP]:  ${slLine}`,
    ].join('\n');
  }

  // Multi-target tranches: Ensure q1 and q2 never evaluate to 0
  const q1 = Math.max(1, Math.floor(safeQty / 2));
  const q2 = Math.max(1, safeQty - q1);

  const tp1Line = formatTosNaturalOptionExitCommand(
    optionPlay.ticker,
    optionPlay.tosExpirationStr,
    optionPlay.strike,
    optionPlay.optionType,
    optionPlay.target.tp1.premium,
    'LMT',
    q1
  );
  const sl1Line = formatTosNaturalOptionExitCommand(
    optionPlay.ticker,
    optionPlay.tosExpirationStr,
    optionPlay.strike,
    optionPlay.optionType,
    optionPlay.stopLoss.premium,
    'STP',
    q1
  );
  const tp2Line = formatTosNaturalOptionExitCommand(
    optionPlay.ticker,
    optionPlay.tosExpirationStr,
    optionPlay.strike,
    optionPlay.optionType,
    optionPlay.target.tp2.premium,
    'LMT',
    q2
  );
  const sl2Line = formatTosNaturalOptionExitCommand(
    optionPlay.ticker,
    optionPlay.tosExpirationStr,
    optionPlay.strike,
    optionPlay.optionType,
    optionPlay.stopLoss.premium,
    'STP',
    q2
  );

  return [
    `=== THINKORSWIM 1ST TRIGGERS 2 OCO ORDER SET (${safeQty} CONTRACTS) ===`,
    `[COMPOUND STRING]:  ${compoundString}`,
    `------------------------------------------------------------------------`,
    `[ROW 1 - ENTRY]:    ${entryLine}`,
    `[ROW 2 - TP1 LMT]:  ${tp1Line}`,
    `[ROW 3 - SL1 STP]:  ${sl1Line}  <-- (Order type MUST be STP)`,
    `[ROW 4 - TP2 LMT]:  ${tp2Line}`,
    `[ROW 5 - SL2 STP]:  ${sl2Line}  <-- (Order type MUST be STP)`,
    `========================================================================`,
    `HOW TO EXECUTE IN THINKORSWIM:`,
    `1. Paste the [COMPOUND STRING] directly via clipboard icon (📋) in Order Entry Tools.`,
    `2. Or paste ROW 1, set Advanced Order to '1st Triggers 2 OCO', and verify Stop rows are 'STP'.`,
    `3. Confirm and send! Un-triggered stops will rest safely under 'Waiting Trigger'.`,
  ].join('\n');
}
