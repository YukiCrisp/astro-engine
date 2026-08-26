import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import * as engine from '../../src/engine/index.js';
import { resolveEnabledBodies } from '../../src/engine/calculations/body-filter.js';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import type { PlanetId } from '../../src/engine/types.js';

const personA = {
  birthDate: '1990-04-15',
  birthTime: '14:30',
  lat: 35.6762,
  lon: 139.6503,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};

const personB = {
  birthDate: '1988-11-02',
  birthTime: '08:15',
  lat: 34.6937,
  lon: 135.5023,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};

const transit = {
  transitDate: '2026-06-15',
  transitTime: '12:00',
  lat: 35.6762,
  lon: 139.6503,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};

beforeAll(() => {
  initSweph('./ephe');
});

function expectAspectBodies(
  aspects: Array<{ planetA: PlanetId; planetB: PlanetId }>,
  expectedIds: PlanetId[],
): void {
  const enabled = new Set(expectedIds);
  for (const aspect of aspects) {
    expect(enabled.has(aspect.planetA)).toBe(true);
    expect(enabled.has(aspect.planetB)).toBe(true);
  }
}

describe('resolveEnabledBodies', () => {
  it('keeps the existing all-bodies default when neither filter is present', () => {
    expect(resolveEnabledBodies()).toBeUndefined();
    expect(engine.calculateNatal(personA).planets).toHaveLength(20);
  });

  it('returns enabledPlanets unchanged when enabledPoints is absent', () => {
    const enabledPlanets: PlanetId[] = ['PLUTO', 'TRUE_NODE'];
    expect(resolveEnabledBodies(enabledPlanets)).toBe(enabledPlanets);
  });

  it('unions enabledPlanets and enabledPoints without duplicates', () => {
    expect(resolveEnabledBodies(
      ['SUN', 'TRUE_NODE'],
      ['TRUE_NODE', 'MEAN_NODE'],
    )).toEqual(['SUN', 'TRUE_NODE', 'MEAN_NODE']);
  });

  it('starts from the 16 non-point bodies when only enabledPoints is present', () => {
    const resolved = resolveEnabledBodies(undefined, ['MEAN_LILITH']);
    expect(resolved).toHaveLength(17);
    expect(new Set(resolved)).toEqual(new Set([
      'SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS',
      'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
      'CHIRON', 'PHOLUS', 'CERES', 'PALLAS', 'JUNO', 'VESTA',
      'MEAN_LILITH',
    ]));
  });
});

describe('enabledPoints chart filtering', () => {
  it('filters natal planets, aspects, and analysis from the resolved body set', () => {
    const result = engine.calculateNatalAnalysis({
      ...personA,
      enabledPlanets: ['SUN', 'MOON'],
      enabledPoints: ['TRUE_NODE'],
    });

    const expectedIds: PlanetId[] = ['SUN', 'MOON', 'TRUE_NODE'];
    expect(result.planets.map((planet) => planet.id)).toEqual(expectedIds);
    expectAspectBodies(result.aspects, expectedIds);

    const distributed = Object.values(result.analysis.distribution.elements).flat();
    expect(new Set(distributed)).toEqual(new Set(['SUN', 'MOON']));
    expect(distributed).not.toContain('PLUTO');
    expect(result.analysis.pattern).toBeDefined();
  });

  it('filters both synastry charts and their cross-aspects', () => {
    const result = engine.calculateSynastry({
      personA,
      personB,
      enabledPlanets: ['SUN'],
      enabledPoints: ['TRUE_NODE'],
    });

    const expectedIds: PlanetId[] = ['SUN', 'TRUE_NODE'];
    expect(result.personA.planets.map((planet) => planet.id)).toEqual(expectedIds);
    expect(result.personB.planets.map((planet) => planet.id)).toEqual(expectedIds);
    expectAspectBodies(result.personA.aspects, expectedIds);
    expectAspectBodies(result.personB.aspects, expectedIds);
    expectAspectBodies(result.crossAspects, expectedIds);
  });

  it('filters transit planets and aspects', () => {
    const result = engine.calculateTransit({
      ...transit,
      enabledPlanets: ['SUN', 'MERCURY'],
      enabledPoints: ['MEAN_NODE'],
    });

    const expectedIds: PlanetId[] = ['SUN', 'MERCURY', 'MEAN_NODE'];
    expect(result.planets.map((planet) => planet.id)).toEqual(expectedIds);
    expect(result.aspects.length).toBeGreaterThan(0);
    expectAspectBodies(result.aspects, expectedIds);
  });
});

describe('enabledPoints request validation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 for a point name outside the canonical four values', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/charts/natal/analysis',
      payload: {
        ...personA,
        enabledPoints: ['ASC'],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });
});
