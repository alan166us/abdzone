/**
 * Regression tests for core trading logic.
 * Run:  npm test      (uses node:test via tsx; no new dependencies)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from '../src/types/trading';
import { getFuturesRoot, isFuturesSymbol, isSp500Futures, getContractPointValue } from '../src/utils/contractSpecs';
import { calculatePositionSize, generateTradeRecommendations, runHistoricalZoneBacktest } from '../src/utils/tradeEngine';
import { detectSupplyDemandZones } from '../src/utils/zoneDetector';
import { calculateHistoricalVolatility, getLatestVolatilityMetrics } from '../src/utils/volatility';
import { getStrikeIncrement, validateTosSymbol, formatTosNaturalOptionCommand } from '../src/utils/optionsEngine';

// ---------- deterministic synthetic data ----------
function makeRng(seed: number) {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  return { rnd, gauss };
}

function genCandles(n: number, stepMs: number, perBarVol: number, seed = 12345, start = Date.UTC(2026, 0, 5, 14, 30)): Candle[] {
  const { rnd, gauss } = makeRng(seed);
  const out: Candle[] = [];
  let p = 500;
  let t = start;
  for (let i = 0; i < n; i++) {
    const o = p;
    const vol = perBarVol * (1 + (rnd() < 0.08 ? 3 : 0));
    const c = o * (1 + gauss() * vol);
    const h = Math.max(o, c) * (1 + Math.abs(gauss()) * perBarVol * 0.5);
    const l = Math.min(o, c) * (1 - Math.abs(gauss()) * perBarVol * 0.5);
    out.push({ time: t, dateStr: new Date(t).toISOString(), open: o, high: h, low: l, close: c, volume: 1000 + rnd() * 3000 });
    p = c;
    t += stepMs;
  }
  return out;
}

const MIN15 = 15 * 60000;
const DAY = 86400000;

// ---------- futures / ticker classification ----------
test('futures detection: real futures are recognised', () => {
  for (const s of ['/ES', 'ES', 'MES', '/MES', '/MESZ26', 'ESZ6', 'MES=F', 'NQ', '/NQ', 'CL=F', '/GC', 'SCHWAB:/MES']) {
    assert.equal(isFuturesSymbol(s), true, s);
  }
});

test('futures detection: equities that merely contain/start with a futures root are NOT futures', () => {
  for (const s of ['CLF', 'CLX', 'NCLH', 'ESTC', 'AES', 'HES', 'GCI', 'AAPL', 'SPY', 'TSLA', 'NVDA', 'QQQ']) {
    assert.equal(isFuturesSymbol(s), false, s);
    assert.equal(getFuturesRoot(s), null, s);
    assert.equal(getContractPointValue(s), 1, `${s} point value`);
  }
  assert.equal(isSp500Futures('AES'), false);
  assert.equal(isSp500Futures('/MES'), true);
});

test('point values: known contracts', () => {
  assert.equal(getContractPointValue('/MES'), 5);
  assert.equal(getContractPointValue('ES'), 50);
  assert.equal(getContractPointValue('/CL'), 1000);
  assert.equal(getContractPointValue('SPY', true), 100); // equity option deliverable
});

// ---------- position sizing ----------
test('position sizing: equity ticker that looks like a futures root risks only the budget', () => {
  const r = calculatePositionSize(50000, 1, 100, 95, 'CLF');
  assert.equal(r.isFutures, false);
  assert.equal(r.riskAmount, 500);
  assert.equal(r.exceedsRiskBudget, false);
});

test('position sizing: flags when the minimum size exceeds the risk budget', () => {
  const r = calculatePositionSize(5000, 1, 100, 40, 'AAPL'); // budget $50, risk/share $60
  assert.equal(r.units, 1);
  assert.equal(r.exceedsRiskBudget, true);
});

// ---------- volatility ----------
test('HV is annualized by bar spacing (intraday no longer understated ~9x)', () => {
  const sigma = 0.001; // per 5-minute bar
  const intraday = genCandles(400, 5 * 60000, sigma, 7);
  const hv = calculateHistoricalVolatility(intraday, 20, false);
  const avg = hv.slice(40).reduce((a, b) => a + b, 0) / hv.slice(40).length;
  const expected = sigma * Math.sqrt(252 * (390 / 5)); // ~0.14
  assert.ok(avg > expected * 0.7 && avg < expected * 1.5, `avg HV ${avg.toFixed(3)} vs expected ~${expected.toFixed(3)}`);

  const daily = genCandles(400, DAY, 0.01, 9);
  const hvD = calculateHistoricalVolatility(daily, 20, false);
  const avgD = hvD.slice(40).reduce((a, b) => a + b, 0) / hvD.slice(40).length;
  const expectedD = 0.01 * Math.sqrt(252);
  assert.ok(avgD > expectedD * 0.7 && avgD < expectedD * 1.5, `daily HV ${avgD.toFixed(3)} vs ~${expectedD.toFixed(3)}`);
});

test('volatility regime: extremely high HV is classified Extreme Impulse (not Expansion)', () => {
  const wild = genCandles(200, DAY, 0.08, 21);
  const m = getLatestVolatilityMetrics(wild);
  assert.ok(m.annualizedHV > 0.95, `HV ${m.annualizedHV}`);
  assert.equal(m.regime, 'Extreme Impulse');
});

// ---------- recommendations ----------
test('recommendations: zones farther than 1.5 ATR are labelled Dormant, never Phase A', () => {
  const candles = genCandles(360, MIN15, 0.003);
  let far = 0;
  for (let end = 150; end <= 360; end += 10) {
    const slice = candles.slice(0, end);
    const zones = detectSupplyDemandZones(slice, {});
    const vm = getLatestVolatilityMetrics(slice);
    const recs = generateTradeRecommendations(slice[slice.length - 1].close, zones, vm, 'SPY', 'live', 'fresh', slice, 15);
    for (const r of recs) {
      if (r.distanceInAtr !== undefined && r.distanceInAtr > 1.5 && !r.executionMode) {
        far++;
        assert.ok(r.proximityPhase?.includes('Dormant'), `${r.id} phase=${r.proximityPhase} dist=${r.distanceInAtr}`);
      }
    }
  }
  assert.ok(far > 0, 'test data produced no far-away recommendations to check');
});

// ---------- backtest ----------
test('backtest: freshOnly yields trades (entry touch must not count as a zone test)', () => {
  const candles = genCandles(300, MIN15, 0.003);
  const vm = getLatestVolatilityMetrics(candles);
  const base = runHistoricalZoneBacktest(candles, [], vm, {});
  const fresh = runHistoricalZoneBacktest(candles, [], vm, { freshOnly: true } as any);
  assert.ok(base.totalTrades > 0);
  assert.ok(fresh.totalTrades > 0, 'freshOnly produced zero trades');
});

test('backtest: unresolved trades are reported as open, not dropped; stats use closed trades', () => {
  const candles = genCandles(300, MIN15, 0.003);
  const vm = getLatestVolatilityMetrics(candles);
  const r = runHistoricalZoneBacktest(candles, [], vm, {});
  const closed = r.totalTrades - r.openTrades;
  assert.ok(r.openTrades >= 0);
  assert.equal(r.wins + r.losses <= closed, true);
});

// ---------- options engine & symbol formatting ----------
test('options: equities with futures roots in their names do not snap to CME strike intervals', () => {
  assert.equal(getStrikeIncrement(75, 'ESTC'), 1.0);
  assert.equal(getStrikeIncrement(30, 'CLF'), 0.5);
  assert.equal(getStrikeIncrement(25, 'IREN'), 0.5);
  assert.equal(getStrikeIncrement(5800, '/MES'), 5.0);
  assert.equal(getStrikeIncrement(20000, '/MNQ'), 25.0);
});

test('options: symbol validation accepts equity strikes but enforces 5-point CME intervals on /MES', () => {
  assert.equal(validateTosSymbol('ESTC', 72.5).valid, true);
  assert.equal(validateTosSymbol('CLF', 32.5).valid, true);
  assert.equal(validateTosSymbol('/MES', 5800).valid, true);
  assert.equal(validateTosSymbol('/MES', 5802).valid, false);
});

test('options: natural orders format with SINGLE ... 100 for equities and clean CME format for futures', () => {
  const equityOrder = formatTosNaturalOptionCommand('ESTC', '23 OCT 26', 75, 'CALL', 3.5);
  assert.ok(equityOrder.includes('SINGLE ESTC 100 23 OCT 26 75 CALL @3.50 LMT'));

  const futuresOrder = formatTosNaturalOptionCommand('/MES', '23 OCT 26', 5800, 'CALL', 42.5);
  assert.ok(futuresOrder.includes('/MES 23 OCT 26 5800 CALL @42.50 LMT'));
  assert.ok(!futuresOrder.includes('SINGLE'));
  assert.ok(!futuresOrder.includes('100'));
});
