import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph, calcSinglePlanet } from '../../src/engine/sweph-adapter.js';
import { calculateNatal, calculateTransitEvents } from '../../src/engine/index.js';
import { signedAspectOrb } from '../../src/engine/calculations/transit-events.js';
import { toJulianDay, parseDateString } from '../../src/utils/date.js';
import type { PlanetId } from '../../src/engine/types.js';

// Self-consistency accuracy check: every reported slow-planet NATAL_ASPECT
// date must be a local minimum of the signed-orb magnitude — smaller than the
// same orb sampled 2 days before and 2 days after. This validates the
// bracketing detector against the engine's own fine-grained positions without
// hardcoding external dates.

const base = {
  birthDate: '1990-04-15',
  birthTime: '14:30',
  lat: 35.6762,
  lon: 139.6503,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};

const ASPECT_ANGLES: Record<string, number> = {
  CONJUNCTION: 0, OPPOSITION: 180, TRINE: 120, SQUARE: 90, SEXTILE: 60,
};

const SLOW: Set<PlanetId> = new Set(['SATURN', 'URANUS', 'NEPTUNE', 'PLUTO']);

beforeAll(() => {
  initSweph('./ephe');
});

function noonJd(date: string): number {
  const { year, month, day } = parseDateString(date);
  return toJulianDay(year, month, day, 12);
}

/** Smallest |signed orb| across both exact-angle directions of the aspect. */
function orbMagnitude(transiting: PlanetId, jd: number, natalLon: number, exactAngle: number): number {
  const lon = calcSinglePlanet(jd, transiting).longitude;
  const angles = exactAngle === 0 || exactAngle === 180 ? [exactAngle] : [exactAngle, 360 - exactAngle];
  return Math.min(...angles.map((a) => Math.abs(signedAspectOrb(lon, natalLon, a))));
}

describe('transit-events NATAL_ASPECT dates are exact within ±1 day (self-consistency)', () => {
  it('reported slow-planet hits are local orb minima vs ±2-day neighbors', () => {
    const natal = calculateNatal(base);
    const targetLons = new Map<string, number>(natal.planets.map((p) => [p.id as string, p.longitude]));
    if (natal.angles) {
      targetLons.set('ASC', natal.angles.asc);
      targetLons.set('MC', natal.angles.mc);
    }

    const result = calculateTransitEvents({
      ...base,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });

    const slowHits = result.events.filter(
      (e) => e.kind === 'NATAL_ASPECT' && SLOW.has(e.transiting),
    );
    // A full year of Saturn..Pluto transits over a 20-body natal chart must
    // produce exact hits — otherwise the detector is broken.
    expect(slowHits.length).toBeGreaterThan(0);

    for (const e of slowHits) {
      if (e.kind !== 'NATAL_ASPECT') continue;
      const natalLon = targetLons.get(e.natal);
      expect(natalLon, `unknown natal target ${e.natal}`).toBeDefined();
      const exactAngle = ASPECT_ANGLES[e.aspectType];
      const jd = noonJd(e.date);

      const orbAtDate = orbMagnitude(e.transiting, jd, natalLon!, exactAngle);
      const orbBefore = orbMagnitude(e.transiting, jd - 2, natalLon!, exactAngle);
      const orbAfter = orbMagnitude(e.transiting, jd + 2, natalLon!, exactAngle);

      // The crossing happens inside [date-1, date]; at the reported date the
      // orb is at most one day of motion, while ±2 days is strictly farther.
      expect(orbAtDate, `${e.detail} @ ${e.date}: orb should be < ±2d neighbors`).toBeLessThan(orbBefore);
      expect(orbAtDate, `${e.detail} @ ${e.date}: orb should be < ±2d neighbors`).toBeLessThan(orbAfter);
      // And the hit itself is genuinely exact-ish (Saturn moves ≤ ~0.13°/day).
      expect(orbAtDate).toBeLessThan(0.5);
    }
  });
});
