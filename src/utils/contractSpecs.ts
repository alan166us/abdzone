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
