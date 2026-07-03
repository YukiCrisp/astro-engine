import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import { calculateNatal, calculateTransitEvents } from '../../src/engine/index.js';
import { computeTransitEvents } from '../../src/engine/calculations/transit-events.js';
import { TransitEventsRequestSchema } from '../../src/schemas/transit-events.js';
import type { TransitEventsData } from '../../src/engine/types.js';

const base = {
  birthDate: '1990-04-15',
  birthTime: '14:30' as string | null,
  lat: 35.6762,
  lon: 139.6503,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};

let yearResult: TransitEventsData;

beforeAll(() => {
  initSweph('./ephe');
  yearResult = calculateTransitEvents({
    ...base,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });
});

describe('calculateTransitEvents — 365-day window', () => {
  it('reports the correct window', () => {
    expect(yearResult.window.startDate).toBe('2026-01-01');
    expect(yearResult.window.endDate).toBe('2026-12-31');
    expect(yearResult.window.days).toBe(365);
  });

  it('returns events sorted ascending by date, all within the window', () => {
    expect(yearResult.events.length).toBeGreaterThan(0);
    const dates = yearResult.events.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
    for (const d of dates) {
      expect(d >= '2026-01-01' && d <= '2026-12-31').toBe(true);
    }
  });

  it('detects all event kinds over a full year', () => {
    const kinds = new Set(yearResult.events.map((e) => e.kind));
    expect(kinds.has('NATAL_ASPECT')).toBe(true);
    expect(kinds.has('STATION_RETROGRADE')).toBe(true);
    expect(kinds.has('STATION_DIRECT')).toBe(true);
    expect(kinds.has('SIGN_INGRESS')).toBe(true);
    expect(kinds.has('HOUSE_INGRESS')).toBe(true);
  });

  it('carries per-kind payload fields and detail strings', () => {
    for (const e of yearResult.events) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.detail.length).toBeGreaterThan(0);
      if (e.kind === 'NATAL_ASPECT') {
        expect(e.detail).toBe(`${e.transiting} ${e.aspectType} natal ${e.natal}`);
      }
      if (e.kind === 'SIGN_INGRESS') expect(e.sign).toMatch(/^[A-Z]{3}$/);
      if (e.kind === 'HOUSE_INGRESS') {
        expect(e.house).toBeGreaterThanOrEqual(1);
        expect(e.house).toBeLessThanOrEqual(12);
      }
    }
  });

  it('meta reflects truncation state consistently', () => {
    expect(yearResult.meta.schemaVersion).toBe(1);
    expect(yearResult.meta.totalDetected).toBeGreaterThanOrEqual(yearResult.events.length);
    if (!yearResult.meta.truncated) {
      expect(yearResult.meta.totalDetected).toBe(yearResult.events.length);
    } else {
      expect(yearResult.meta.totalDetected).toBeGreaterThan(yearResult.events.length);
    }
  });

  it('never samples SUN or MOON as transiting bodies', () => {
    for (const e of yearResult.events) {
      expect(e.transiting).not.toBe('SUN');
      expect(e.transiting).not.toBe('MOON');
    }
  });
});

describe('TransitEventsRequestSchema window validation', () => {
  const body = {
    ...base,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  };

  it('accepts a 365-day window', () => {
    expect(TransitEventsRequestSchema.safeParse(body).success).toBe(true);
  });

  it('accepts a 366-day window (inclusive count)', () => {
    const r = TransitEventsRequestSchema.safeParse({ ...body, endDate: '2027-01-01' });
    expect(r.success).toBe(true);
  });

  it('rejects a window longer than 366 days', () => {
    const r = TransitEventsRequestSchema.safeParse({ ...body, endDate: '2027-01-15' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Window must be 1-366 days');
  });

  it('rejects endDate not after startDate', () => {
    const r = TransitEventsRequestSchema.safeParse({ ...body, endDate: '2026-01-01' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Window must be 1-366 days');
  });
});

describe('computeTransitEvents — noise cap', () => {
  it('truncates NATAL_ASPECT events above 250 but keeps all structural events', () => {
    const natal = calculateNatal(base);
    // Synthetic natal chart with densely packed aspect targets (every 2°)
    // to force far more than 250 exact hits over a year.
    const dense = {
      ...natal,
      planets: Array.from({ length: 180 }, (_, i) => ({
        ...natal.planets[0],
        longitude: (i * 2) % 360,
      })),
    };
    const window = { startDate: '2026-01-01', endDate: '2026-12-31' };
    const truncatedRun = computeTransitEvents({ natal: dense, ...window });
    const normalRun = computeTransitEvents({ natal, ...window });

    expect(truncatedRun.meta.truncated).toBe(true);
    expect(truncatedRun.meta.totalDetected).toBeGreaterThan(250);
    expect(truncatedRun.events.length).toBe(250);

    // Still sorted ascending after truncation.
    const dates = truncatedRun.events.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);

    // Structural events (stations, sign/house ingresses) are never dropped;
    // they only depend on the sampled transiters + natal houses, which are
    // identical between the two runs.
    const structural = (r: TransitEventsData) =>
      r.events.filter((e) => e.kind !== 'NATAL_ASPECT').map((e) => `${e.date}:${e.detail}`);
    expect(structural(truncatedRun)).toEqual(structural(normalRun));

    // Slower transiters are kept in preference to Jupiter: if any JUPITER
    // aspect survived, no slower planet's aspect can have been dropped, so
    // the kept set must contain every non-Jupiter aspect count implied by
    // the slot arithmetic. Cheap proxy: kept aspects must not be all-Jupiter.
    const keptAspectPlanets = new Set(
      truncatedRun.events.filter((e) => e.kind === 'NATAL_ASPECT').map((e) => e.transiting),
    );
    expect(keptAspectPlanets.has('PLUTO') || keptAspectPlanets.has('NEPTUNE')).toBe(true);
  });
});

describe('calculateTransitEvents — unknown birth time', () => {
  it('skips HOUSE_INGRESS and ASC/MC targets but still succeeds', () => {
    const result = calculateTransitEvents({
      ...base,
      birthTime: null,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(result.events.length).toBeGreaterThan(0);
    for (const e of result.events) {
      expect(e.kind).not.toBe('HOUSE_INGRESS');
      if (e.kind === 'NATAL_ASPECT') {
        expect(e.natal).not.toBe('ASC');
        expect(e.natal).not.toBe('MC');
      }
    }
  });
});
