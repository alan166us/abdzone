/**
 * Centralized Contract Specifications & Point Values
 * Single source of truth for contract multipliers, point values, and deliverables.
 *
 * Futures detection is done here ONCE. Do not use startsWith()/includes() on raw
 * tickers elsewhere: 'CLF', 'CLX', 'NCLH', 'ESTC', 'AES' etc. are equities, not futures.
 */

export interface ContractSpecs {
  assetClass: string;
  pointMultiplier: number;
  tickSize: number;
  tickValue: number;
  tosSymbol: string;
  description: string;
}

const FUTURES_TABLE: Record<string, ContractSpecs> = {
  MES: { assetClass: 'Futures Micro / Index', pointMultiplier: 5.0, tickSize: 0.25, tickValue: 1.25, tosSymbol: '/MES', description: 'Micro E-mini S&P 500 Index Futures' },
  MNQ: { assetClass: 'Futures Micro / Index', pointMultiplier: 2.0, tickSize: 0.25, tickValue: 0.5, tosSymbol: '/MNQ', description: 'Micro E-mini Nasdaq-100 Futures' },
  M2K: { assetClass: 'Futures Micro / Index', pointMultiplier: 5.0, tickSize: 0.1, tickValue: 0.5, tosSymbol: '/M2K', description: 'Micro E-mini Russell 2000 Futures' },
  MYM: { assetClass: 'Futures Micro / Index', pointMultiplier: 0.5, tickSize: 1.0, tickValue: 0.5, tosSymbol: '/MYM', description: 'Micro E-mini Dow Futures' },
  ES: { assetClass: 'Futures Standard / Index', pointMultiplier: 50.0, tickSize: 0.25, tickValue: 12.5, tosSymbol: '/ES', description: 'E-mini S&P 500 Index Futures' },
  NQ: { assetClass: 'Futures Standard / Index', pointMultiplier: 20.0, tickSize: 0.25, tickValue: 5.0, tosSymbol: '/NQ', description: 'E-mini Nasdaq-100 Futures' },
  RTY: { assetClass: 'Futures Standard / Index', pointMultiplier: 50.0, tickSize: 0.1, tickValue: 5.0, tosSymbol: '/RTY', description: 'E-mini Russell 2000 Futures' },
  YM: { assetClass: 'Futures Standard / Index', pointMultiplier: 5.0, tickSize: 1.0, tickValue: 5.0, tosSymbol: '/YM', description: 'E-mini Dow Jones Futures' },
  CL: { assetClass: 'Futures Commodity / Energy', pointMultiplier: 1000.0, tickSize: 0.01, tickValue: 10.0, tosSymbol: '/CL', description: 'Crude Oil Futures ($10/cent)' },
  GC: { assetClass: 'Futures Commodity / Metals', pointMultiplier: 100.0, tickSize: 0.1, tickValue: 10.0, tosSymbol: '/GC', description: 'Gold Futures ($10/0.10)' },
};

// Root, optionally followed by a contract-month code + year ("ESZ6", "MESH26"),
// a Yahoo-style "=F", or a TradingView-style continuous "1!". A leading "/" is optional.
const FUTURES_REGEX = /^\/?(MES|MNQ|M2K|MYM|ES|NQ|RTY|YM|CL|GC)(?:[FGHJKMNQUVXZ]\d{1,4}|=F|\d!)?$/;

function cleanTicker(ticker: string): string {
  return (ticker || '').trim().toUpperCase().replace(/^(SCHWAB:|EXCHANGE:)/, '').trim();
}

/**
 * Returns the futures root ('MES', 'ES', 'CL', ...) or null if the ticker is not a known future.
 * Known limitation: bare 'ES' (Eversource) and 'CL' (Colgate-Palmolive) are real equity tickers too and
 * are treated as futures. Always use the slash form ('/ES', '/CL') for futures to stay unambiguous.
 */
export function getFuturesRoot(ticker: string): string | null {
  const m = FUTURES_REGEX.exec(cleanTicker(ticker));
  return m ? m[1] : null;
}

export function isFuturesSymbol(symbol: string): boolean {
  if (!symbol) return false;
  return cleanTicker(symbol).startsWith('/') || getFuturesRoot(symbol) !== null;
}

/** S&P 500 family (ES / MES): used for 5-point strike snapping and price-scale sanity checks. */
export function isSp500Futures(symbol: string): boolean {
  const root = getFuturesRoot(symbol);
  return root === 'ES' || root === 'MES';
}

/** Nasdaq-100 family (NQ / MNQ). */
export function isNasdaqFutures(symbol: string): boolean {
  const root = getFuturesRoot(symbol);
  return root === 'NQ' || root === 'MNQ';
}

export function getContractPointValue(ticker: string, isOption: boolean = false): number {
  const root = getFuturesRoot(ticker);
  if (root) return FUTURES_TABLE[root].pointMultiplier;

  // Equity options have 100 share deliverables; outright equity shares have 1.0 point value ($1/point)
  return isOption ? 100.0 : 1.0;
}

export function getContractSpecs(ticker: string): ContractSpecs {
  const clean = cleanTicker(ticker);
  const root = getFuturesRoot(clean);
  if (root) return FUTURES_TABLE[root];

  const base = clean.replace(/^\//, '');
  const isEtf = ['SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLF', 'XLE', 'SMH', 'SPCX'].includes(base);
  return {
    assetClass: isEtf ? 'Index ETF / Equity' : 'US Equity',
    pointMultiplier: 1.0,
    tickSize: 0.01,
    tickValue: 0.01,
    tosSymbol: base,
    description: isEtf ? `${base} Exchange Traded Fund` : `${base} Equity Shares`,
  };
}
