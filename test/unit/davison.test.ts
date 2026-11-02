import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import { calculateDavison, calculateNatal } from '../../src/engine/index.js';
import { midpointGeoLongitude, midpointPlace } from '../../src/engine/calculations/davison.js';
import { buildJulianDay, fromJulianDay } from '../../src/utils/date.js';

beforeAll(() => {
  initSweph('./ephe');
});

const personA = {
  birthDate: '1990-04-12',
  birthTime: '08:30',
  lat: 35.69,
  lon: 139.69,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};
const personB = {
  birthDate: '1992-11-03',
  birthTime: '21:10',
  lat: 34.69,
  lon: 135.5,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};

describe('midpointGeoLongitude', () => {
  it('averages plainly when the two are close', () => {
    expect(midpointGeoLongitude(139.69, 135.5)).toBeCloseTo(137.595, 6);
  });

  it('goes the shorter way across the date line', () => {
    // Tokyo and Los Angeles meet over the Pacific, not off Africa
    expect(midpointGeoLongitude(139.69, -118.24)).toBeCloseTo(-169.275, 6);
    expect(midpointGeoLongitude(-118.24, 139.69)).toBeCloseTo(-169.275, 6);
  });

  it('falls east of person A when exactly 180° apart', () => {
    expect(midpointGeoLongitude(0, 180)).toBeCloseTo(90, 6);
    expect(midpointGeoLongitude(0, -180)).toBeCloseTo(90, 6);
  });

  it('stays within [-180, 180)', () => {
    expect(midpointGeoLongitude(170, -170)).toBeCloseTo(-180, 6);
    expect(midpointGeoLongitude(179, 179)).toBeCloseTo(179, 6);
  });

  it('averages latitude plainly', () => {
    expect(midpointPlace({ lat: 35, lon: 0 }, { lat: -10, lon: 0 }).lat).toBeCloseTo(12.5, 6);
  });
});

describe('calculateDavison', () => {
  it('casts the chart for the midpoint moment (UT) and place', () => {
    const result = calculateDavison({ personA, personB });
    // 1990-04-11 23:30 UT and 1992-11-03 12:10 UT → 1991-07-24 05:50 UT
    expect(fromJulianDay(result.midpoint.julianDay)).toBe('1991-07-24T05:50:00Z');
    expect(result.meta.julianDay).toBe(result.midpoint.julianDay);
    expect(result.midpoint.lat).toBeCloseTo(35.19, 6);
    expect(result.midpoint.lon).toBeCloseTo(137.595, 6);
    expect(result.meta.birthTimeAssumed).toBe(false);
    expect(result.houses).toHaveLength(12);
  });

  it('is the same sky as a natal chart at that moment and place', () => {
    const davison = calculateDavison({ personA, personB });
    const natal = calculateNatal({
      birthDate: '1991-07-24', birthTime: '05:50', utcOffsetMinutes: 0,
      lat: 35.19, lon: 137.595, houseSystem: 'PLACIDUS',
    });
    for (const id of ['SUN', 'MOON', 'MARS'] as const) {
      const d = davison.planets.find((p) => p.id === id)!;
      const n = natal.planets.find((p) => p.id === id)!;
      expect(d.longitude).toBeCloseTo(n.longitude, 6);
    }
    expect(davison.angles!.asc).toBeCloseTo(natal.angles!.asc, 6);
  });

  it('keeps sub-minute precision in the midpoint moment', () => {
    const b = { ...personB, birthTime: '21:11' };
    const result = calculateDavison({ personA, personB: b });
    const jdA = buildJulianDay(personA.birthDate, personA.birthTime, 540);
    const jdB = buildJulianDay(b.birthDate, b.birthTime, 540);
    expect(result.midpoint.julianDay).toBe((jdA + jdB) / 2);
    expect(fromJulianDay(result.midpoint.julianDay)).toBe('1991-07-24T05:50:30Z');
  });

  it('marks the chart as assumed when either birth time is unknown', () => {
    const result = calculateDavison({ personA, personB: { ...personB, birthTime: null } });
    expect(result.meta.birthTimeAssumed).toBe(true);
  });
});

describe('davison route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the midpoint beside the natal-shaped fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/charts/davison',
      payload: { personA, personB },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.midpoint.lon).toBeCloseTo(137.595, 6);
    expect(body.midpoint.julianDay).toBe(body.meta.julianDay);
    expect(Array.isArray(body.aspectPatterns)).toBe(true);
  });
});
