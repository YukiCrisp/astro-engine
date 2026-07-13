import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph, calcPlanets } from '../../src/engine/sweph-adapter.js';
import { calculateEphemeris, calculateVocMoon } from '../../src/engine/index.js';
import { signedAspectOrb } from '../../src/engine/calculations/transit-events.js';
import { toJulianDay } from '../../src/utils/date.js';

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

describe('calculateEphemeris exact event times (ENGA-1944)', () => {
  // Convert a `YYYY-MM-DDTHH:MM:SSZ` UTC instant to a Julian Day.
  function jdOfIso(iso: string): number {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/);
    if (!m) throw new Error(`unexpected time format: ${iso}`);
    const [, y, mo, d, hh, mi, ss] = m.map(Number) as unknown as number[];
    return toJulianDay(y, mo, d, hh + mi / 60 + ss / 3600);
  }

  it('attaches a valid, bracketed UTC time to every event', () => {
    const data = calculateEphemeris({ year: 2025, month: 1 });
    expect(data.events.length).toBeGreaterThan(0);
    for (const event of data.events) {
      // Present and well-formed (Zulu ISO-8601 to the second).
      expect(event.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      // The exact instant lands inside the noon-to-noon bracket that produced
      // the event: at or before noon of `date`, and no earlier than 24h before.
      const [y, mo, d] = event.date.split('-').map(Number);
      const noonOfDate = Date.UTC(y, mo - 1, d, 12);
      const t = new Date(event.time!).getTime();
      expect(t).toBeLessThanOrEqual(noonOfDate);
      expect(t).toBeGreaterThanOrEqual(noonOfDate - 24 * 3600 * 1000);
    }
  });

  it('places EXACT_ASPECT times at a near-zero orb', () => {
    const data = calculateEphemeris({ year: 2025, month: 1 });
    const aspects = data.events.filter((e) => e.type === 'EXACT_ASPECT');
    expect(aspects.length).toBeGreaterThan(0);
    for (const e of aspects) {
      const jd = jdOfIso(e.time!);
      const a = calcPlanets(jd, [e.planet])[0];
      const b = calcPlanets(jd, [e.targetPlanet!])[0];
      // Orb to the nearest exact angle for this aspect type should be ~0 at the
      // refined instant (well under a tenth of a degree).
      const angles: Record<string, number> = {
        CONJUNCTION: 0, OPPOSITION: 180, TRINE: 120, SQUARE: 90, SEXTILE: 60,
      };
      const angle = angles[e.aspectType!];
      const shifted = angle === 0 || angle === 180 ? [angle] : [angle, 360 - angle];
      const bestOrb = Math.min(...shifted.map((s) => Math.abs(signedAspectOrb(a.longitude, b.longitude, s))));
      expect(bestOrb).toBeLessThan(0.1);
    }
  });

  it('places INGRESS times at a sign boundary (0° of a sign)', () => {
    const data = calculateEphemeris({ year: 2025, month: 1 });
    const ingresses = data.events.filter((e) => e.type === 'INGRESS');
    expect(ingresses.length).toBeGreaterThan(0);
    for (const e of ingresses) {
      const jd = jdOfIso(e.time!);
      const lon = calcPlanets(jd, [e.planet])[0].longitude;
      const distToBoundary = Math.abs(((lon % 30) + 30) % 30);
      const dist = Math.min(distToBoundary, 30 - distToBoundary);
      expect(dist).toBeLessThan(0.1);
    }
  });

  it('places STATION times at near-zero speed', () => {
    // Mercury stations retrograde 2025-03-15 and direct 2025-04-07; March has both boundaries.
    const data = calculateEphemeris({ year: 2025, month: 3 });
    const stations = data.events.filter(
      (e) => e.type === 'STATION_RETROGRADE' || e.type === 'STATION_DIRECT',
    );
    expect(stations.length).toBeGreaterThan(0);
    for (const e of stations) {
      const jd = jdOfIso(e.time!);
      const speed = calcPlanets(jd, [e.planet])[0].speed;
      expect(Math.abs(speed)).toBeLessThan(0.01);
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
