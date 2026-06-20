import { describe, test, expect } from 'vitest';
import { calculateVocPeriods } from '../../src/engine/calculations/voc-moon.js';
import { calcSinglePlanet } from '../../src/engine/sweph-adapter.js';
import { toJulianDay } from '../../src/utils/date.js';
import type { PlanetId } from '../../src/engine/types.js';

// Mirror of the planet set the VoC algorithm aspects the Moon against.
const TARGET_PLANETS: PlanetId[] = [
  'SUN', 'MERCURY', 'VENUS', 'MARS',
  'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
];

const PTOLEMAIC: [string, number][] = [
  ['CONJUNCTION', 0],
  ['SEXTILE', 60],
  ['SQUARE', 90],
  ['TRINE', 120],
  ['OPPOSITION', 180],
];

const STEP_10MIN = 1 / 144; // 10 minutes in Julian-day units
const ONE_MIN = 1 / 1440;

function wrapTo180(x: number): number {
  return (((x % 360) + 540) % 360) - 180;
}

// Signed orb whose zero-crossing marks an exact aspect. Conjunction/opposition
// use the signed separation (so they actually cross zero); the symmetric aspects
// use unsigned-distance-minus-angle, which crosses zero from either side.
function signedOrb(moonLon: number, planetLon: number, angle: number): number {
  if (angle === 0) return wrapTo180(moonLon - planetLon);
  if (angle === 180) return wrapTo180(moonLon - planetLon - 180);
  const dist = Math.abs(wrapTo180(moonLon - planetLon));
  return dist - angle;
}

function jd(iso: string): number {
  const d = new Date(iso);
  return toJulianDay(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600,
  );
}

// Does the Moon make an exact Ptolemaic aspect to any target planet strictly
// inside (jdStart, jdEnd)? Returns a description of the first hit, or null.
function findAspectInside(jdStart: number, jdEnd: number): string | null {
  let prevMoon = calcSinglePlanet(jdStart, 'MOON').longitude;
  const prevPlanet = new Map<PlanetId, number>();
  for (const p of TARGET_PLANETS) prevPlanet.set(p, calcSinglePlanet(jdStart, p).longitude);

  for (let t = jdStart + STEP_10MIN; t <= jdEnd; t += STEP_10MIN) {
    const stepJd = Math.min(t, jdEnd);
    const curMoon = calcSinglePlanet(stepJd, 'MOON').longitude;
    for (const p of TARGET_PLANETS) {
      const curPlanet = calcSinglePlanet(stepJd, p).longitude;
      for (const [name, angle] of PTOLEMAIC) {
        const prevOrb = signedOrb(prevMoon, prevPlanet.get(p)!, angle);
        const curOrb = signedOrb(curMoon, curPlanet, angle);
        // Guard against the 180->-180 wrap of the signed conj/opp orb.
        if (Math.abs(prevOrb) > 10 || Math.abs(curOrb) > 10) continue;
        if (prevOrb * curOrb < 0) {
          return `${name} Moon-${p} at JD ${stepJd.toFixed(4)}`;
        }
      }
      prevPlanet.set(p, curPlanet);
    }
    prevMoon = curMoon;
  }
  return null;
}

describe('calculateVocPeriods', () => {
  test('conjunction and opposition can be the void-ending aspect', () => {
    const seen = new Set<string>();
    for (let month = 1; month <= 12; month++) {
      for (const p of calculateVocPeriods(2026, month)) seen.add(p.lastAspectType);
    }
    // The Moon ends a sign on a conjunction or opposition extremely often;
    // never seeing them means those aspects are not being detected.
    expect(seen.has('CONJUNCTION')).toBe(true);
    expect(seen.has('OPPOSITION')).toBe(true);
  });

  test('no exact aspect occurs strictly inside any reported void period', () => {
    const periods = calculateVocPeriods(2026, 6);
    expect(periods.length).toBeGreaterThan(5);
    for (const period of periods) {
      const start = jd(period.start);
      const end = jd(period.end);
      // Probe from just after the last aspect to just before ingress.
      const hit = findAspectInside(start + ONE_MIN, end - ONE_MIN);
      expect(hit).toBeNull();
    }
  });

  test('the Moon is exactly at the named aspect angle at each void start', () => {
    for (const period of calculateVocPeriods(2026, 6)) {
      const t = jd(period.start);
      const moon = calcSinglePlanet(t, 'MOON').longitude;
      const planet = calcSinglePlanet(t, period.lastAspectPlanet).longitude;
      const angle = { CONJUNCTION: 0, SEXTILE: 60, SQUARE: 90, TRINE: 120, OPPOSITION: 180 }[
        period.lastAspectType as 'CONJUNCTION' | 'SEXTILE' | 'SQUARE' | 'TRINE' | 'OPPOSITION'
      ];
      const dist = Math.abs(wrapTo180(moon - planet));
      const orb = angle === 180 ? 180 - dist : Math.abs(dist - angle);
      expect(orb).toBeLessThan(0.2);
    }
  });
});
