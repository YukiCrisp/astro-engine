import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import { calculateEphemeris, calculateVocMoon } from '../../src/engine/index.js';
import { signedAspectOrb } from '../../src/engine/calculations/transit-events.js';

beforeAll(() => {
  initSweph('./ephe');
});

// Signed angular difference in [-180, 180).
function angularDiff(a: number, b: number): number {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  return d;
}

describe('calculateEphemeris zodiacSystem threading (ENGA-1261)', () => {
  const year = 2026;
  const month = 2;

  it('defaults to tropical when zodiacSystem is omitted', () => {
    const omitted = calculateEphemeris({ year, month });
    const tropical = calculateEphemeris({ year, month, zodiacSystem: 'tropical' });
    for (let d = 0; d < omitted.days.length; d++) {
      const a = omitted.days[d].planets.find((p) => p.id === 'SUN')!;
      const b = tropical.days[d].planets.find((p) => p.id === 'SUN')!;
      expect(a.longitude).toBeCloseTo(b.longitude, 6);
    }
  });

  it('shifts planet longitudes by the ayanamsha (~24°) under sidereal', () => {
    const tropical = calculateEphemeris({ year, month, zodiacSystem: 'tropical' });
    const sidereal = calculateEphemeris({ year, month, zodiacSystem: 'sidereal' });

    // Same number of days, aligned by index.
    expect(sidereal.days.length).toBe(tropical.days.length);

    // Check every day's Sun: sidereal must trail tropical by the Lahiri
    // ayanamsha for this epoch (~24.2° in 2026), well outside float noise.
    for (let d = 0; d < tropical.days.length; d++) {
      const t = tropical.days[d].planets.find((p) => p.id === 'SUN')!;
      const s = sidereal.days[d].planets.find((p) => p.id === 'SUN')!;
      const diff = Math.abs(angularDiff(t.longitude, s.longitude));
      expect(diff).toBeGreaterThan(20);
      expect(diff).toBeLessThan(27);
    }
  });

  it('produces different INGRESS sign labels under sidereal (boundaries shift)', () => {
    const tropical = calculateEphemeris({ year, month, zodiacSystem: 'tropical' });
    const sidereal = calculateEphemeris({ year, month, zodiacSystem: 'sidereal' });
    // The set of ingress detail strings should not be identical: a ~24° shift
    // moves which sign each planet occupies, so ingress days/signs differ.
    const tKeys = tropical.events.filter((e) => e.type === 'INGRESS').map((e) => `${e.date}:${e.detail}`);
    const sKeys = sidereal.events.filter((e) => e.type === 'INGRESS').map((e) => `${e.date}:${e.detail}`);
    expect(sKeys).not.toEqual(tKeys);
  });
});

describe('calculateEphemeris EXACT_ASPECT detects both geometries of asymmetric aspects', () => {
  // Asymmetric aspects (sextile/square/trine) are exact at separations of both
  // +angle and 360-angle. January 2025 contains exact hits in both geometries.
  const eph = () => calculateEphemeris({ year: 2025, month: 1 });

  it('detects the forward geometry (A ahead of B by the exact angle)', () => {
    // Mars trine Neptune, exact 2025-01-13, separation ≈ +120°.
    expect(eph().events).toContainEqual(expect.objectContaining({
      type: 'EXACT_ASPECT', date: '2025-01-13',
      planet: 'MARS', targetPlanet: 'NEPTUNE', aspectType: 'TRINE',
    }));
  });

  it('detects the reverse geometry (A behind B, separation 360 - angle)', () => {
    // Sun trine Uranus, exact 2025-01-13, separation ≈ 240° (= 360 - 120).
    expect(eph().events).toContainEqual(expect.objectContaining({
      type: 'EXACT_ASPECT', date: '2025-01-13',
      planet: 'SUN', targetPlanet: 'URANUS', aspectType: 'TRINE',
    }));
  });

  it('reports every zero-crossing derivable from the returned daily positions', () => {
    // Self-consistency: re-derive expected hits from `days` using the
    // both-sides rule and require each one to appear in `events`.
    const data = eph();
    const SLOW = new Set(['SUN', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO']);
    const ANGLES: [string, number][] = [
      ['CONJUNCTION', 0], ['OPPOSITION', 180], ['TRINE', 120], ['SQUARE', 90], ['SEXTILE', 60],
    ];
    let expected = 0;
    for (let i = 0; i < data.days.length - 1; i++) {
      const today = data.days[i].planets;
      const tomorrow = data.days[i + 1].planets;
      for (let a = 0; a < today.length; a++) {
        if (!SLOW.has(today[a].id)) continue;
        for (let b = a + 1; b < today.length; b++) {
          if (!SLOW.has(today[b].id)) continue;
          const tA = tomorrow.find((p) => p.id === today[a].id);
          const tB = tomorrow.find((p) => p.id === today[b].id);
          if (!tA || !tB) continue;
          for (const [aspectType, angle] of ANGLES) {
            const shiftedAngles = angle === 0 || angle === 180 ? [angle] : [angle, 360 - angle];
            for (const shifted of shiftedAngles) {
              const o1 = signedAspectOrb(today[a].longitude, today[b].longitude, shifted);
              const o2 = signedAspectOrb(tA.longitude, tB.longitude, shifted);
              if (Math.abs(o1) <= 1.5 && o1 * o2 < 0) {
                expected++;
                expect(data.events).toContainEqual(expect.objectContaining({
                  type: 'EXACT_ASPECT', date: data.days[i + 1].date,
                  planet: today[a].id, targetPlanet: today[b].id, aspectType,
                }));
              }
            }
          }
        }
      }
    }
    // The month genuinely exercises the detector in both geometries.
    expect(expected).toBeGreaterThan(10);
  });
});

describe('calculateEphemeris detects lunations (new moon / full moon) — GH #235', () => {
  // Minimal angular distance between two longitudes, in [0, 180].
  function separation(a: number, b: number): number {
    const d = ((a - b) % 360 + 360) % 360;
    return d > 180 ? 360 - d : d;
  }

  function lunations(year: number, month: number) {
    const data = calculateEphemeris({ year, month });
    const sunMoon = data.events.filter(
      (e) => e.type === 'EXACT_ASPECT' && e.planet === 'SUN' && e.targetPlanet === 'MOON',
    );
    return { data, sunMoon };
  }

  function dayPositions(data: ReturnType<typeof calculateEphemeris>, date: string) {
    const day = data.days.find((d) => d.date === date)!;
    return {
      sun: day.planets.find((p) => p.id === 'SUN')!,
      moon: day.planets.find((p) => p.id === 'MOON')!,
    };
  }

  it('emits a new moon (Sun conjunct Moon) with Sun≈Moon on the flagged day', () => {
    const { data, sunMoon } = lunations(2026, 2);
    const newMoons = sunMoon.filter((e) => e.aspectType === 'CONJUNCTION');
    expect(newMoons.length).toBeGreaterThanOrEqual(1);
    for (const e of newMoons) {
      const { sun, moon } = dayPositions(data, e.date);
      // Within one day of Moon motion (~15°) of an exact conjunction.
      expect(separation(sun.longitude, moon.longitude)).toBeLessThan(15);
    }
  });

  it('emits a full moon (Sun oppose Moon) with Sun≈Moon+180 on the flagged day', () => {
    const { data, sunMoon } = lunations(2026, 2);
    const fullMoons = sunMoon.filter((e) => e.aspectType === 'OPPOSITION');
    expect(fullMoons.length).toBeGreaterThanOrEqual(1);
    for (const e of fullMoons) {
      const { sun, moon } = dayPositions(data, e.date);
      expect(Math.abs(separation(sun.longitude, moon.longitude) - 180)).toBeLessThan(15);
    }
  });

  it('never mislabels the ±180 orb wrap: conjunctions stay near 0°, oppositions near 180°', () => {
    // Guards the fast-Moon detector against the signedAspectOrb wrap that would
    // otherwise fire a conjunction at opposition time (and vice versa).
    for (const month of [1, 2, 5, 8, 11]) {
      const { data, sunMoon } = lunations(2026, month);
      expect(sunMoon.length).toBeGreaterThan(0);
      for (const e of sunMoon) {
        const { sun, moon } = dayPositions(data, e.date);
        const sep = separation(sun.longitude, moon.longitude);
        if (e.aspectType === 'CONJUNCTION') expect(sep).toBeLessThan(15);
        else expect(Math.abs(sep - 180)).toBeLessThan(15);
      }
    }
  });

  it('dates each lunation on the noon closest to exact (agrees with the client moon-phase marks)', () => {
    // Feb 2026: full moon 2026-02-01, new moon 2026-02-17 (astronomical).
    const { sunMoon } = lunations(2026, 2);
    expect(sunMoon).toContainEqual(expect.objectContaining({
      type: 'EXACT_ASPECT', date: '2026-02-01',
      planet: 'SUN', targetPlanet: 'MOON', aspectType: 'OPPOSITION',
    }));
    expect(sunMoon).toContainEqual(expect.objectContaining({
      type: 'EXACT_ASPECT', date: '2026-02-17',
      planet: 'SUN', targetPlanet: 'MOON', aspectType: 'CONJUNCTION',
    }));
  });

  it('catches both full moons in a blue-moon month (May 2026)', () => {
    const { sunMoon } = lunations(2026, 5);
    const fullMoons = sunMoon.filter((e) => e.aspectType === 'OPPOSITION');
    expect(fullMoons.map((e) => e.date)).toEqual(['2026-05-01', '2026-05-31']);
  });

  it('limits Moon events to conjunction/opposition only (no Moon trine/square/sextile)', () => {
    const { data } = lunations(2026, 2);
    const moonAspects = data.events.filter(
      (e) => e.type === 'EXACT_ASPECT' && (e.planet === 'MOON' || e.targetPlanet === 'MOON'),
    );
    expect(moonAspects.length).toBeGreaterThan(0);
    for (const e of moonAspects) {
      expect(['CONJUNCTION', 'OPPOSITION']).toContain(e.aspectType);
    }
  });
});

describe('calculateVocMoon zodiacSystem threading (ENGA-1261)', () => {
  const year = 2026;
  const month = 2;

  it('accepts sidereal and still returns valid void-of-course periods', () => {
    const sidereal = calculateVocMoon({ year, month, zodiacSystem: 'sidereal' });
    expect(sidereal.periods.length).toBeGreaterThan(0);
    for (const p of sidereal.periods) {
      // A VoC period is well-formed: start precedes end.
      expect(new Date(p.start).getTime()).toBeLessThanOrEqual(new Date(p.end).getTime());
    }
  });

  it('defaults to tropical when zodiacSystem is omitted', () => {
    const omitted = calculateVocMoon({ year, month });
    const tropical = calculateVocMoon({ year, month, zodiacSystem: 'tropical' });
    expect(omitted.periods).toEqual(tropical.periods);
  });
});
