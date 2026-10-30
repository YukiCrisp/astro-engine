import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import { calculateNatal, calculateSolarArc } from '../../src/engine/index.js';
import { buildApp } from '../../src/app.js';

/**
 * Solar arc moves every natal point by the same arc (progressed Sun − natal
 * Sun). The response keeps its old shape — directed `planets` over the natal
 * `houses` / `angles` — and adds `arc` and `directedAngles`, so a bi-wheel can
 * put the directed MC / ASC over the natal chart.
 */

const person = {
  birthDate: '1990-04-15',
  birthTime: '14:30',
  lat: 35.6762,
  lon: 139.6503,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};

const norm = (lon: number) => ((lon % 360) + 360) % 360;

describe('solar arc — arc and directed angles', () => {
  beforeAll(() => {
    initSweph('./ephe');
  });

  it('arc is the distance between the directed and natal Sun', () => {
    const natal = calculateNatal(person);
    const chart = calculateSolarArc({ ...person, progressedDate: '2026-10-30' });
    const natalSun = natal.planets.find((p) => p.id === 'SUN')!;
    const directedSun = chart.planets.find((p) => p.id === 'SUN')!;
    expect(chart.arc).toBeCloseTo(norm(directedSun.longitude - natalSun.longitude), 9);
    // about one degree per year of life
    expect(chart.arc).toBeGreaterThan(35);
    expect(chart.arc).toBeLessThan(37);
  });

  it('directed angles are the natal angles moved by the arc', () => {
    const natal = calculateNatal(person);
    const chart = calculateSolarArc({ ...person, progressedDate: '2026-10-30' });
    const directed = chart.directedAngles!;
    for (const key of ['asc', 'mc', 'dsc', 'ic', 'vertex', 'eastPoint'] as const) {
      expect(directed[key]).toBeCloseTo(norm(natal.angles![key] + chart.arc), 9);
    }
    expect(directed.partOfFortune).toBeCloseTo(norm(chart.angles!.partOfFortune + chart.arc), 9);
  });

  it('keeps the existing fields: angles and houses stay natal, planets are directed', () => {
    const natal = calculateNatal(person);
    const chart = calculateSolarArc({ ...person, progressedDate: '2026-10-30' });
    expect(chart.angles!.asc).toBeCloseTo(natal.angles!.asc, 9);
    expect(chart.angles!.mc).toBeCloseTo(natal.angles!.mc, 9);
    expect(chart.houses!.map((h) => h.longitude)).toEqual(natal.houses!.map((h) => h.longitude));
    const natalMoon = natal.planets.find((p) => p.id === 'MOON')!;
    const directedMoon = chart.planets.find((p) => p.id === 'MOON')!;
    expect(directedMoon.longitude).toBeCloseTo(norm(natalMoon.longitude + chart.arc), 9);
  });

  it('ten years later the directed MC has moved about ten degrees', () => {
    const now = calculateSolarArc({ ...person, progressedDate: '2026-10-30' });
    const later = calculateSolarArc({ ...person, progressedDate: '2036-10-30' });
    const moved = norm(later.directedAngles!.mc - now.directedAngles!.mc);
    expect(moved).toBeGreaterThan(9);
    expect(moved).toBeLessThan(11);
    expect(later.angles!.mc).toBeCloseTo(now.angles!.mc, 9);
  });
});

describe('solar arc route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns arc and directedAngles beside the natal-shaped fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/charts/solar-arc',
      payload: { ...person, progressedDate: '2026-10-30' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.arc).toBe('number');
    expect(Object.keys(body.directedAngles).sort()).toEqual(
      ['asc', 'dsc', 'eastPoint', 'ic', 'mc', 'partOfFortune', 'vertex'],
    );
    expect(body.angles.mc).not.toBeCloseTo(body.directedAngles.mc, 3);
    expect(Array.isArray(body.aspectPatterns)).toBe(true);
    expect(body.meta.schemaVersion).toBe(1);
  });
});
