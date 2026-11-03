import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import { calculateSolarReturn, calculateSolarReturnTransit } from '../../src/engine/index.js';

beforeAll(() => {
  initSweph('./ephe');
});

const solarReturn = {
  birthDate: '1990-04-12',
  birthTime: '08:30',
  lat: 35.69,
  lon: 139.69,
  utcOffsetMinutes: 540,
  year: 2026,
  returnLat: 34.69,
  returnLon: 135.5,
  returnUtcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};
const transit = {
  transitDate: '2026-11-02',
  transitTime: '12:00',
  lat: 34.69,
  lon: 135.5,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};

describe('calculateSolarReturnTransit', () => {
  it('lays the transiting sky over the same solar return chart', () => {
    const result = calculateSolarReturnTransit({ solarReturn, transit });
    const plain = calculateSolarReturn(solarReturn);
    expect(result.solarReturn.meta.julianDay).toBeCloseTo(plain.meta.julianDay, 9);
    expect(result.solarReturn.angles!.asc).toBeCloseTo(plain.angles!.asc, 9);
    expect(result.transit.planets.length).toBeGreaterThan(0);
    expect(result.crossAspects.length).toBeGreaterThan(0);
    for (const a of result.crossAspects) {
      expect(result.solarReturn.planets.some((p) => p.id === a.planetA)).toBe(true);
      expect(result.transit.planets.some((p) => p.id === a.planetB)).toBe(true);
    }
  });

  it('answers on the route', async () => {
    const app = await buildApp();
    await app.ready();
    const response = await app.inject({ method: 'POST', url: '/v1/charts/solar-return-transit', payload: { solarReturn, transit } });
    await app.close();
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.solarReturn.houses).toHaveLength(12);
    expect(Array.isArray(body.crossAspects)).toBe(true);
  });
});
