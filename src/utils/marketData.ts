import { AssetPreset, Candle } from '../types/trading';

export const ASSET_PRESETS: AssetPreset[] = [
  {
    id: 'btc',
    symbol: 'BTC/USDT',
    name: 'Bitcoin / Tether USD',
    category: 'Crypto',
    defaultTimeframe: '1h',
    precision: 2,
    tickSize: 0.1,
  },
  {
    id: 'eth',
    symbol: 'ETH/USDT',
    name: 'Ethereum / Tether USD',
    category: 'Crypto',
    defaultTimeframe: '1h',
    precision: 2,
    tickSize: 0.05,
  },
  {
    id: 'spy',
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    category: 'Equity',
    defaultTimeframe: '1h',
    precision: 2,
    tickSize: 0.01,
  },
  {
    id: 'nvda',
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    category: 'Equity',
    defaultTimeframe: '1h',
    precision: 2,
    tickSize: 0.01,
  },
  {
    id: 'eurusd',
    symbol: 'EUR/USD',
    name: 'Euro / US Dollar',
    category: 'Forex',
    defaultTimeframe: '1h',
    precision: 5,
    tickSize: 0.0001,
  },
  {
    id: 'gold',
    symbol: 'XAU/USD',
    name: 'Spot Gold / US Dollar',
    category: 'Commodity',
    defaultTimeframe: '1h',
    precision: 2,
    tickSize: 0.1,
  },
];

export const LIVE_PRICE_ANCHORS: Record<string, number> = {
  'IREN': 25.46,
  'SPY': 767.50,
  'QQQ': 719.00,
  '/MES': 7740.00,
  '/MNQ': 29730.00,
  'MES': 7740.00,
  'MNQ': 29730.00,
  'ES': 7740.00,
  '/ES': 7740.00,
  'NQ': 29730.00,
  '/NQ': 29730.00,
  'NVDA': 217.25,
  'AAPL': 343.50,
  'TSLA': 367.00,
  'PLTR': 194.14,
  'SPCX': 171.92,
  'BTC/USDT': 81800.00,
  'ETH/USDT': 2400.00,
};

export function getLivePriceAnchor(symbol: string): number | undefined {
  const clean = symbol.replace(/^(SCHWAB:|EXCHANGE:)/, '').trim().toUpperCase();
  return (
    LIVE_PRICE_ANCHORS[clean] ??
    LIVE_PRICE_ANCHORS[`/${clean}`] ??
    LIVE_PRICE_ANCHORS[clean.replace(/^\//, '')]
  );
}

/**
 * Procedurally generates realistic, authentic market price action with genuine
 * institutional liquidity runs, base consolidations, explosive impulses (ERC candles),
 * and pullbacks to create distinct Supply and Demand zones.
 * Clamps price drift strictly within ±2.5% of reference anchors.
 */
export function generateSyntheticMarketData(
  symbol: string = 'BTC/USDT',
  count: number = 360,
  startPrice: number = 63500,
  frequencyMinutes: number = 60
): Candle[] {
  const candles: Candle[] = [];
  const intervalMs = Math.max(1, frequencyMinutes) * 60 * 1000;
  const baseTime = Date.now() - count * intervalMs;
  
  const cleanTicker = symbol.replace(/^(SCHWAB:|EXCHANGE:)/, '').trim().toUpperCase();
  const anchor = getLivePriceAnchor(cleanTicker);
  let currentPrice = anchor !== undefined ? anchor : startPrice;
  const minClampedPrice = anchor !== undefined ? anchor * 0.975 : currentPrice * 0.70;
  const maxClampedPrice = anchor !== undefined ? anchor * 1.025 : currentPrice * 1.30;

  // Parameters based on asset
  let baseVol = 0.007; // standard bar volatility
  if (symbol.includes('BTC')) baseVol = 0.009;
  if (symbol.includes('ETH')) baseVol = 0.012;
  if (symbol.includes('EUR')) baseVol = 0.0018;
  if (symbol.includes('SPY')) baseVol = 0.0035;
  if (symbol.includes('NVDA')) baseVol = 0.008;
  if (symbol.includes('XAU')) baseVol = 0.004;

  let trend = 0.0003;
  let regimeState = 'normal'; // 'normal', 'base', 'impulse', 'retest'
  let stateCounter = 0;
  let currentImpulseDirection = 1;

  for (let i = 0; i < count; i++) {
    const timestamp = baseTime + i * intervalMs;
    const date = new Date(timestamp);
    const dateStr = date.toISOString().replace('T', ' ').substring(0, 16);

    stateCounter++;

    // Switch regimes periodically to create clear SMC patterns: Drop-Base-Rally, Rally-Base-Drop
    if (stateCounter > 18 && Math.random() < 0.25) {
      const pick = Math.random();
      if (pick < 0.45) {
        regimeState = 'base'; // Tight consolidation base
        stateCounter = 0;
      } else if (pick < 0.8) {
        regimeState = 'impulse'; // Explosive ERC departure
        currentImpulseDirection = Math.random() > 0.5 ? 1 : -1;
        stateCounter = 0;
      } else {
        regimeState = 'normal';
        trend = (Math.random() - 0.5) * 0.001;
        stateCounter = 0;
      }
    }

    let barVol = baseVol;
    let expectedDelta = trend * currentPrice;

    if (regimeState === 'base') {
      // Extremely tight body (consolidation before explosive move)
      barVol = baseVol * 0.45;
      expectedDelta = (Math.random() - 0.5) * barVol * currentPrice;
      if (stateCounter >= 3) {
        // Break out into explosive impulse
        regimeState = 'impulse';
        currentImpulseDirection = Math.random() > 0.48 ? 1 : -1;
        stateCounter = 0;
      }
    } else if (regimeState === 'impulse') {
      // Extended Range Candle (ERC)
      barVol = baseVol * 2.3;
      expectedDelta = currentImpulseDirection * barVol * currentPrice * 1.5;
      if (stateCounter >= 2) {
        regimeState = 'normal';
        // After impulse, price slows down
        trend = -currentImpulseDirection * 0.0008; // Slight pullback toward zone
        stateCounter = 0;
      }
    }

    // Mean reversion toward anchor when drifting near ±2.5% boundary
    if (anchor !== undefined) {
      const distFromAnchor = (currentPrice - anchor) / anchor;
      if (distFromAnchor > 0.015) {
        expectedDelta -= barVol * currentPrice * 0.5;
      } else if (distFromAnchor < -0.015) {
        expectedDelta += barVol * currentPrice * 0.5;
      }
    }

    const open = Math.max(minClampedPrice, Math.min(maxClampedPrice, currentPrice));
    const change = expectedDelta + (Math.random() - 0.5) * barVol * currentPrice;
    const rawClose = open + change;
    const close = Math.max(minClampedPrice, Math.min(maxClampedPrice, rawClose));

    // Wick generation with clamp
    const upperWickDelta = Math.random() * barVol * currentPrice * 0.6;
    const lowerWickDelta = Math.random() * barVol * currentPrice * 0.6;

    const rawHigh = Math.max(open, close) + upperWickDelta;
    const rawLow = Math.min(open, close) - lowerWickDelta;
    const high = Math.max(open, close, Math.min(maxClampedPrice, rawHigh));
    const low = Math.min(open, close, Math.max(minClampedPrice, rawLow));

    const volumeBase = symbol.includes('BTC') ? 1200 : (symbol.includes('SPY') ? 450000 : 15000);
    const volumeMultiplier = regimeState === 'impulse' ? 2.8 : (regimeState === 'base' ? 0.6 : 1.0);
    const volume = Math.round(volumeBase * volumeMultiplier * (0.8 + Math.random() * 0.5));

    candles.push({
      time: timestamp,
      dateStr,
      open: Number(open.toFixed(symbol.includes('EUR') ? 5 : 2)),
      high: Number(high.toFixed(symbol.includes('EUR') ? 5 : 2)),
      low: Number(low.toFixed(symbol.includes('EUR') ? 5 : 2)),
      close: Number(close.toFixed(symbol.includes('EUR') ? 5 : 2)),
      volume,
    });

    currentPrice = close;
  }

  return candles;
}

/**
 * Appends the next simulated real-time candle
 */
export function generateNextSimulatedCandle(
  lastCandle: Candle,
  isCrypto: boolean = false,
  frequencyMinutes: number = 60,
  symbol?: string
): Candle {
  const intervalMs = Math.max(1, frequencyMinutes) * 60 * 1000;
  const nextTime = lastCandle.time + intervalMs;
  const date = new Date(nextTime);
  const dateStr = date.toISOString().replace('T', ' ').substring(0, 16);

  const anchor = symbol ? getLivePriceAnchor(symbol) : undefined;
  const minClamped = anchor !== undefined ? anchor * 0.975 : lastCandle.close * 0.70;
  const maxClamped = anchor !== undefined ? anchor * 1.025 : lastCandle.close * 1.30;

  const baseVol = isCrypto ? 0.008 : 0.004;
  let drift = (Math.random() - 0.495) * baseVol;
  if (anchor !== undefined) {
    const dist = (lastCandle.close - anchor) / anchor;
    if (dist > 0.015) drift -= baseVol * 0.4;
    else if (dist < -0.015) drift += baseVol * 0.4;
  }
  
  const open = Math.max(minClamped, Math.min(maxClamped, lastCandle.close));
  const change = open * drift;
  const close = Math.max(minClamped, Math.min(maxClamped, open + change));

  const wickFactor = Math.random() * baseVol * open * 0.6;
  const high = Math.max(open, close, Math.min(maxClamped, Math.max(open, close) + wickFactor));
  const low = Math.min(open, close, Math.max(minClamped, Math.min(open, close) - Math.random() * baseVol * open * 0.6));

  return {
    time: nextTime,
    dateStr,
    open: Number(open.toFixed(2)),
    high: Number(high.toFixed(2)),
    low: Number(low.toFixed(2)),
    close: Number(close.toFixed(2)),
    volume: Math.round(lastCandle.volume * (0.8 + Math.random() * 0.4)),
  };
}

/**
 * Parses user-uploaded CSV into typed Candle array with auto-detection for
 * Charles Schwab, thinkorswim, TradingView, Binance, MetaTrader, and Investing.com formats.
 */
export function parseCandleCSV(csvText: string): Candle[] {
  const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV must contain a header and at least 1 candlestick data row');

  // Detect delimiter: comma, semicolon, or tab
  const headerLine = lines[0];
  let delimiter = ',';
  if (headerLine.includes('\t')) delimiter = '\t';
  else if (headerLine.includes(';') && !headerLine.includes(',')) delimiter = ';';

  // Helper to split row respecting quotes
  const splitRow = (rowStr: string): string[] => {
    if (delimiter === '\t') return rowStr.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (delimiter === ';') return rowStr.split(';').map(c => c.trim().replace(/^["']|["']$/g, ''));
    
    // Regular CSV split that handles quotes like "64,250.50"
    const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
    const items: string[] = [];
    let match;
    while ((match = regex.exec(rowStr)) !== null) {
      if (match.index === regex.lastIndex) regex.lastIndex++;
      let val = match[1] ?? '';
      val = val.trim().replace(/^["']|["']$/g, '').replace(/""/g, '"');
      items.push(val);
      if (regex.lastIndex >= rowStr.length) break;
    }
    return items.length > 1 ? items : rowStr.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
  };

  const headers = splitRow(lines[0]).map(h => h.toLowerCase());

  // Find column indices
  let dateIdx = headers.findIndex(h => h.includes('time') || h.includes('date') || h === 't' || h.includes('timestamp'));
  let openIdx = headers.findIndex(h => h.includes('open') || h === 'o');
  let highIdx = headers.findIndex(h => h.includes('high') || h === 'h');
  let lowIdx = headers.findIndex(h => h.includes('low') || h === 'l');
  let closeIdx = headers.findIndex(h => h === 'close' || h.includes('close') || h === 'c' || h === 'price');
  let volIdx = headers.findIndex(h => h.includes('vol') || h === 'v');

  // Fallback for MetaTrader: Date is col 0, Time is col 1, Open is col 2, High is col 3, Low is col 4, Close is col 5
  let hasSeparateTimeCol = false;
  let timeColIdx = -1;
  const timeWordIdx = headers.findIndex((h, idx) => idx !== dateIdx && (h === 'time' || h === '<time>'));
  if (timeWordIdx !== -1 && dateIdx !== -1) {
    hasSeparateTimeCol = true;
    timeColIdx = timeWordIdx;
  }

  // If header not found by name, check if row 0 is actually data without header
  if (openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1) {
    // Try standard order: Date, Open, High, Low, Close, Volume
    if (headers.length >= 5 && !isNaN(parseFloat(headers[1].replace(/,/g, '')))) {
      dateIdx = 0;
      openIdx = 1;
      highIdx = 2;
      lowIdx = 3;
      closeIdx = 4;
      volIdx = headers.length > 5 ? 5 : -1;
    } else {
      throw new Error(`CSV header must contain Open, High, Low, Close columns. Found headers: [${headers.join(', ')}]`);
    }
  }

  const candles: Candle[] = [];
  const baseTime = Date.now() - (lines.length - 1) * 3600 * 1000;

  const startLineIdx = (openIdx === 1 && !isNaN(parseFloat(headers[1]))) ? 0 : 1;

  for (let i = startLineIdx; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const row = splitRow(rawLine);
    if (row.length < 4) continue;

    // Clean numeric values (strip commas, dollar signs, percent signs)
    const cleanNum = (str: string) => {
      if (!str) return NaN;
      return parseFloat(str.replace(/[\$,]/g, '').trim());
    };

    const open = cleanNum(row[openIdx]);
    const high = cleanNum(row[highIdx]);
    const low = cleanNum(row[lowIdx]);
    const close = cleanNum(row[closeIdx]);
    const volume = volIdx !== -1 && row[volIdx] ? (cleanNum(row[volIdx]) || 1000) : 1000;

    if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;

    let time = baseTime + i * 3600 * 1000;
    let dateStr = new Date(time).toISOString().replace('T', ' ').substring(0, 16);

    if (dateIdx !== -1 && row[dateIdx]) {
      let rawDate = row[dateIdx].trim();
      if (hasSeparateTimeCol && timeColIdx !== -1 && row[timeColIdx]) {
        rawDate = `${rawDate} ${row[timeColIdx].trim()}`;
      }

      // Check if unix timestamp (seconds or milliseconds)
      const numDate = Number(rawDate);
      if (!isNaN(numDate) && numDate > 100000000) {
        time = numDate > 10000000000 ? numDate : numDate * 1000;
        dateStr = new Date(time).toISOString().replace('T', ' ').substring(0, 16);
      } else {
        const parsedTime = Date.parse(rawDate);
        if (!isNaN(parsedTime)) {
          time = parsedTime;
          dateStr = new Date(time).toISOString().replace('T', ' ').substring(0, 16);
        } else {
          dateStr = rawDate;
        }
      }
    }

    candles.push({
      time,
      dateStr,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  if (candles.length < 3) {
    throw new Error('Not enough valid candlestick rows found in CSV (minimum 3 rows required)');
  }

  return candles.sort((a, b) => a.time - b.time);
}
