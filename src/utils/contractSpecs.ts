/**
 * Centralized Contract Specifications & Point Values
 * Single source of truth for contract multipliers, point values, and deliverables.
 */

export function getContractPointValue(ticker: string, isOption: boolean = false): number {
  const clean = ticker.trim().toUpperCase().replace(/^\//, '');
  if (clean.startsWith('MES')) return 5.0;   // Micro E-mini S&P 500 ($1.25/tick)
  if (clean.startsWith('MNQ')) return 2.0;   // Micro E-mini Nasdaq 100 ($0.50/tick)
  if (clean.startsWith('M2K')) return 5.0;   // Micro E-mini Russell 2000 ($0.50/tick)
  if (clean.startsWith('MYM')) return 0.5;   // Micro E-mini Dow ($0.50/tick)
  if (clean.startsWith('ES')) return 50.0;   // E-mini S&P 500 ($12.50/tick)
  if (clean.startsWith('NQ')) return 20.0;   // E-mini Nasdaq 100 ($5.00/tick)
  if (clean.startsWith('RTY')) return 50.0;  // E-mini Russell 2000 ($5.00/tick)
  if (clean.startsWith('YM')) return 5.0;    // E-mini Dow ($5.00/tick)
  if (clean.startsWith('CL')) return 1000.0; // Crude Oil ($10.00/cent)
  if (clean.startsWith('GC')) return 100.0;  // Gold ($10.00/0.10)
  
  // Equity options have 100 share deliverables; outright equity shares have 1.0 point value ($1/point)
  return isOption ? 100.0 : 1.0;
}

export interface ContractSpecs {
  assetClass: string;
  pointMultiplier: number;
  tickSize: number;
  tickValue: number;
  tosSymbol: string;
  description: string;
}

export function getContractSpecs(ticker: string): ContractSpecs {
  const clean = ticker.trim().toUpperCase().replace(/^(SCHWAB:|EXCHANGE:)/, '').trim();
  const base = clean.replace(/^\//, '');

  if (base.startsWith('MES')) {
    return {
      assetClass: 'Futures Micro / Index',
      pointMultiplier: 5.0,
      tickSize: 0.25,
      tickValue: 1.25,
      tosSymbol: '/MES',
      description: 'Micro E-mini S&P 500 Index Futures',
    };
  }
  if (base.startsWith('MNQ')) {
    return {
      assetClass: 'Futures Micro / Index',
      pointMultiplier: 2.0,
      tickSize: 0.25,
      tickValue: 0.50,
      tosSymbol: '/MNQ',
      description: 'Micro E-mini Nasdaq-100 Futures',
    };
  }
  if (base.startsWith('M2K')) {
    return {
      assetClass: 'Futures Micro / Index',
      pointMultiplier: 5.0,
      tickSize: 0.10,
      tickValue: 0.50,
      tosSymbol: '/M2K',
      description: 'Micro E-mini Russell 2000 Futures',
    };
  }
  if (base.startsWith('MYM')) {
    return {
      assetClass: 'Futures Micro / Index',
      pointMultiplier: 0.5,
      tickSize: 1.0,
      tickValue: 0.50,
      tosSymbol: '/MYM',
      description: 'Micro E-mini Dow Futures',
    };
  }
  if (base.startsWith('ES')) {
    return {
      assetClass: 'Futures Standard / Index',
      pointMultiplier: 50.0,
      tickSize: 0.25,
      tickValue: 12.50,
      tosSymbol: '/ES',
      description: 'E-mini S&P 500 Index Futures',
    };
  }
  if (base.startsWith('NQ')) {
    return {
      assetClass: 'Futures Standard / Index',
      pointMultiplier: 20.0,
      tickSize: 0.25,
      tickValue: 5.00,
      tosSymbol: '/NQ',
      description: 'E-mini Nasdaq-100 Futures',
    };
  }
  if (base.startsWith('RTY')) {
    return {
      assetClass: 'Futures Standard / Index',
      pointMultiplier: 50.0,
      tickSize: 0.10,
      tickValue: 5.00,
      tosSymbol: '/RTY',
      description: 'E-mini Russell 2000 Futures',
    };
  }
  if (base.startsWith('YM')) {
    return {
      assetClass: 'Futures Standard / Index',
      pointMultiplier: 5.0,
      tickSize: 1.0,
      tickValue: 5.00,
      tosSymbol: '/YM',
      description: 'E-mini Dow Jones Futures',
    };
  }
  if (base.startsWith('CL')) {
    return {
      assetClass: 'Futures Commodity / Energy',
      pointMultiplier: 1000.0,
      tickSize: 0.01,
      tickValue: 10.00,
      tosSymbol: '/CL',
      description: 'Crude Oil Futures ($10/cent)',
    };
  }
  if (base.startsWith('GC')) {
    return {
      assetClass: 'Futures Commodity / Metals',
      pointMultiplier: 100.0,
      tickSize: 0.10,
      tickValue: 10.00,
      tosSymbol: '/GC',
      description: 'Gold Futures ($10/0.10)',
    };
  }

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
