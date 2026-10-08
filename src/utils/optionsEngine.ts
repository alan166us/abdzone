import { TradeRecommendation, VolatilityMetrics } from '../types/trading';

export type ExpirationStyle = 'weekly' | 'swing' | 'monthly';
export type StrikeBias = 'ITM' | 'ATM' | 'OTM';

export interface SchwabOptionContractRecommendation {
  id: string;
  side: 'long' | 'short';
  optionType: 'CALL' | 'PUT';
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

  // 1. ENTRY SPECIFICATIONS
  entry: {
    premium: number;           // $/share (e.g. 3.45)
    costPerContract: number;   // $345
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
  schwabOrderCommand: string; // thinkorswim 1-line format
  schwabBracketCommand: string; // thinkorswim 1st triggers OCO format
  schwabWebSummary: string; // Human-readable clipboard string for Schwab.com
  rationale: string;
}

/**
 * Calculates optimal option strike rounding based on underlying share price
 * e.g. SPY/QQQ: $1 strikes; NVDA/TSLA: $2.5 or $5 strikes; AAPL: $2.5 strikes
 */
function getStrikeIncrement(price: number): number {
  if (price > 400) return 1.0; // SPY, QQQ have $1 strikes
  if (price > 100) return 2.5;
  if (price > 50) return 1.0;
  return 0.5;
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
 */
function formatOccSymbol(ticker: string, expIso: string, type: 'CALL' | 'PUT', strike: number): string {
  const cleanTicker = ticker.padEnd(6, ' ').slice(0, 6);
  const [yyyy, mm, dd] = expIso.split('-');
  const yy = yyyy.slice(-2);
  const typeLetter = type === 'CALL' ? 'C' : 'P';
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
): SchwabOptionContractRecommendation {
  const expirationStyle = options?.expirationStyle || 'swing';
  const strikeBias = options?.strikeBias || 'ITM';

  const isCall = rec.side === 'long';
  const cleanTicker = ticker.replace(/^(SCHWAB:|EXCHANGE:)/, '').trim().toUpperCase();
  const underlying = rec.entry;
  const increment = getStrikeIncrement(underlying);

  // Expiration calculation
  const expDetails = getExpirationDetails(expirationStyle);
  const { expIso, expDisplay, tosStr, daysToExpiration } = expDetails;

  // Strike Selection based on bias (ITM / ATM / OTM)
  const atmStrike = Math.round(underlying / increment) * increment;
  let strike = atmStrike;

  if (isCall) {
    if (strikeBias === 'ITM') {
      strike = Math.floor(underlying / increment) * increment;
      if (strike === atmStrike && underlying > increment) {
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
      strike = Math.ceil(underlying / increment) * increment;
      if (strike === atmStrike) {
        strike = atmStrike + increment;
      }
    } else if (strikeBias === 'OTM') {
      strike = Math.max(increment, atmStrike - increment);
    } else {
      strike = atmStrike;
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
  const moneynessDistance = isCall ? (underlying - strike) : (strike - underlying);
  const intrinsicValue = Math.max(0, moneynessDistance);
  const timeValue = Math.max(0.60, underlying * hv * dteFactor * 0.40);
  
  // Calculate Entry Premium
  const rawEntry = intrinsicValue + timeValue;
  const entryPremium = Number(Math.max(0.85, Math.min(rawEntry, underlying * 0.12)).toFixed(2));
  const costPerContract = Math.round(entryPremium * 100);

  // Projected stock moves from zone geometry
  const underlyingTargetMove = Math.abs(rec.takeProfit2 - rec.entry);
  const underlyingStopMove = Math.abs(rec.entry - rec.stopLoss);

  // Option price movement based on delta + gamma acceleration
  const gammaMultiplier = 1.12;
  const optionTargetGain = underlyingTargetMove * Math.abs(approxDelta) * gammaMultiplier;
  const optionStopDecline = underlyingStopMove * Math.abs(approxDelta) * 0.88;

  // 1. ENTRY
  const entry = {
    premium: entryPremium,
    costPerContract,
    orderType: 'LIMIT' as const,
    underlyingTrigger: rec.entry,
    action: 'Buy to Open' as const,
    description: `Limit buy order placed at $${entryPremium.toFixed(2)} when ${cleanTicker} enters the zone at $${rec.entry.toFixed(2)}.`,
  };

  // 2. STOP-LOSS
  // Stop is set when underlying hits the buffered zone boundary (SL), modeling contract value at that point
  const calculatedStopPremium = Math.max(0.25, entryPremium - optionStopDecline);
  const stopPremium = Number(calculatedStopPremium.toFixed(2));
  const stopLossPerContract = Number((entryPremium - stopPremium).toFixed(2)) * 100;
  const stopPercentLoss = Math.round(((entryPremium - stopPremium) / entryPremium) * 100);

  const stopLoss = {
    premium: stopPremium,
    lossPerContract: -Math.round(stopLossPerContract),
    percentLoss: -Math.min(99, stopPercentLoss),
    orderType: 'STOP' as const,
    underlyingTrigger: rec.stopLoss,
    action: 'Sell to Close' as const,
    description: `Exit contract immediately if option falls to $${stopPremium.toFixed(2)} or ${cleanTicker} violates buffered stop at $${rec.stopLoss.toFixed(2)}.`,
  };

  // 3. TARGET (TP)
  const calculatedTargetPremium = Math.max(entryPremium * 1.35, entryPremium + optionTargetGain);
  const targetPremium = Number(calculatedTargetPremium.toFixed(2));
  const profitPerContract = Math.round((targetPremium - entryPremium) * 100);
  const targetPercentGain = Math.round(((targetPremium - entryPremium) / entryPremium) * 100);

  // Multi-targets
  const tp1StockMove = Math.abs(rec.takeProfit1 - rec.entry);
  const tp1Premium = Number(Math.max(entryPremium * 1.25, entryPremium + tp1StockMove * Math.abs(approxDelta)).toFixed(2));
  const tp1Profit = Math.round((tp1Premium - entryPremium) * 100);
  const tp1Percent = Math.round(((tp1Premium - entryPremium) / entryPremium) * 100);

  const tp3StockMove = Math.abs(rec.takeProfit3 - rec.entry);
  const tp3Premium = Number(Math.max(targetPremium * 1.35, entryPremium + tp3StockMove * Math.abs(approxDelta) * 1.25).toFixed(2));
  const tp3Profit = Math.round((tp3Premium - entryPremium) * 100);
  const tp3Percent = Math.round(((tp3Premium - entryPremium) / entryPremium) * 100);

  const optionRR = stopLossPerContract > 0 ? Number((profitPerContract / stopLossPerContract).toFixed(1)) : 2.5;

  const target = {
    premium: targetPremium,
    profitPerContract,
    percentGain: targetPercentGain,
    underlyingTrigger: rec.takeProfit2,
    action: 'Sell to Close' as const,
    orderType: 'LIMIT' as const,
    riskRewardRatio: optionRR,
    tp1: {
      premium: tp1Premium,
      profitPerContract: tp1Profit,
      percentGain: tp1Percent,
      underlyingTrigger: rec.takeProfit1,
      label: 'TP1 (Conservative 1:2 R:R)',
    },
    tp2: {
      premium: targetPremium,
      profitPerContract,
      percentGain: targetPercentGain,
      underlyingTrigger: rec.takeProfit2,
      label: 'TP2 (Major Opposing Zone)',
    },
    tp3: {
      premium: tp3Premium,
      profitPerContract: tp3Profit,
      percentGain: tp3Percent,
      underlyingTrigger: rec.takeProfit3,
      label: 'TP3 (Trend Runner)',
    },
  };

  const optionTypeStr = isCall ? 'CALL' : 'PUT';
  const occSymbol = formatOccSymbol(cleanTicker, expIso, optionTypeStr, strike);

  const isFutures = cleanTicker.startsWith('/');
  const [yyyy, mm, dd] = expIso.split('-');
  const yy = yyyy.slice(-2);
  const typeLetter = optionTypeStr === 'CALL' ? 'C' : 'P';
  const tosDotSymbol = isFutures ? cleanTicker : `.${cleanTicker}${yy}${mm}${dd}${typeLetter}${strike}`;

  // thinkorswim Single Limit Order (strictly formatted for thinkorswim desktop clipboard parser: no space after @)
  const tosVerifiedSingleCommand = isFutures
    ? (isCall
        ? `BUY +1 ${cleanTicker} @${rec.entry.toFixed(2)} LMT`
        : `SELL +1 ${cleanTicker} @${rec.entry.toFixed(2)} LMT`)
    : `BUY +1 ${tosDotSymbol} @${entryPremium.toFixed(2)} LMT`;

  // Legacy single order string
  const schwabOrderCommand = tosVerifiedSingleCommand;

  // thinkorswim 1st Triggers OCO Bracket Order (Entry -> Stop Loss & Take Profit)
  const schwabBracketCommand = isFutures
    ? (isCall
        ? `BUY 1 ${cleanTicker} @ ${rec.entry.toFixed(2)} LMT; SELL 1 ${cleanTicker} @ ${rec.takeProfit2.toFixed(2)} LMT / @ ${rec.stopLoss.toFixed(2)} STP`
        : `SELL 1 ${cleanTicker} @ ${rec.entry.toFixed(2)} LMT; BUY 1 ${cleanTicker} @ ${rec.takeProfit2.toFixed(2)} LMT / @ ${rec.stopLoss.toFixed(2)} STP`)
    : `BUY +1 ${cleanTicker} 100 ${tosStr} ${strike} ${optionTypeStr} @ ${entryPremium.toFixed(2)} LMT; SELL -1 ${cleanTicker} 100 ${tosStr} ${strike} ${optionTypeStr} @ ${targetPremium.toFixed(2)} LMT / @ ${stopPremium.toFixed(2)} STP`;

  // Clean Schwab Portal Summary Slip for copy/paste into Schwab.com
  const schwabWebSummary = isFutures
    ? [
        `=== CHARLES SCHWAB / THINKORSWIM FUTURES ORDER ===`,
        `CONTRACT: ${cleanTicker}`,
        `ACTION: ${isCall ? 'BUY (Long)' : 'SELL (Short)'}`,
        `ORDER TYPE: Limit with OCO Bracket`,
        `-----------------------------------------`,
        `1. ENTRY LIMIT:       $${rec.entry.toFixed(2)}`,
        `2. STOP-LOSS (SL):    $${rec.stopLoss.toFixed(2)} (with ATR buffer)`,
        `3. TARGET (TP):       $${rec.takeProfit2.toFixed(2)} (Opposing Zone)`,
        `-----------------------------------------`,
        `RISK / REWARD: 1 : ${rec.riskRewardRatio.toFixed(1)}`,
      ].join('\n')
    : [
        `=== CHARLES SCHWAB OPTION TRADE ORDER ===`,
        `TICKER: ${cleanTicker}`,
        `STRATEGY: Buy Single Option (${strikeBias})`,
        `CONTRACT: ${cleanTicker} ${expDisplay} $${strike} ${optionTypeStr}`,
        `ACTION: Buy to Open`,
        `ORDER TYPE: Limit`,
        `-----------------------------------------`,
        `1. ENTRY LIMIT:       $${entryPremium.toFixed(2)} ($${costPerContract}/contract) [Stock Trigger: $${rec.entry.toFixed(2)}]`,
        `2. STOP-LOSS (SL):    $${stopPremium.toFixed(2)} (-$${Math.abs(stopLoss.lossPerContract)}/contract, ${stopLoss.percentLoss}%) [Stock Trigger: $${rec.stopLoss.toFixed(2)}]`,
        `3. TARGET (TP):       $${targetPremium.toFixed(2)} (+$${profitPerContract}/contract, +${targetPercentGain}%) [Stock Target: $${rec.takeProfit2.toFixed(2)}]`,
        `-----------------------------------------`,
        `RISK / REWARD: 1 : ${optionRR} | DELTA: ${approxDelta}`,
        `OCC SYMBOL: ${occSymbol}`,
      ].join('\n');

  return {
    id: `opt-${rec.id}-${expirationStyle}-${strikeBias}`,
    side: rec.side,
    optionType: optionTypeStr,
    ticker: cleanTicker,
    underlyingPrice: underlying,
    strike,
    strikeBias,
    expirationStr: expIso,
    expirationDisplay: expDisplay,
    tosExpirationStr: tosStr,
    occSymbol,
    daysToExpiration,
    expirationStyle,
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
    schwabOrderCommand,
    schwabBracketCommand,
    schwabWebSummary,
    rationale: isCall
      ? `Institutional Demand Zone at $${rec.entry.toFixed(2)} provides strong reversal tailwinds. Buying ${strike} Strike Call ($${entryPremium.toFixed(2)}/sh). Target $${targetPremium.toFixed(2)} (+${targetPercentGain}%) when stock reaches $${rec.takeProfit2.toFixed(2)}. Invalidate at $${stopPremium.toFixed(2)} if stock pierces $${rec.stopLoss.toFixed(2)}.`
      : `Institutional Supply Zone at $${rec.entry.toFixed(2)} defends strong resistance. Buying ${strike} Strike Put ($${entryPremium.toFixed(2)}/sh). Target $${targetPremium.toFixed(2)} (+${targetPercentGain}%) when stock drops to $${rec.takeProfit2.toFixed(2)}. Invalidate at $${stopPremium.toFixed(2)} if stock pierces $${rec.stopLoss.toFixed(2)}.`,
  };
}
