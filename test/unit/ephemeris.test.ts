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

describe('calculateEphemeris month-boundary bracket', () => {
  // Each month samples its own days at noon UTC, so the 24h from the previous
  // month's last noon to day 1's noon straddles two responses. The Moon enters
  // Gemini inside the 2026-09-30 → 10-01 bracket (Taurus at the first noon,
  // Gemini at the second). Events take the later sample's date, so October owns
  // it and it must reach exactly one response.
  const bracketStart = Date.UTC(2026, 8, 30, 12);
  const bracketEnd = Date.UTC(2026, 9, 1, 12);
  const inBracket = (e: { time?: string }) => {
    const t = new Date(e.time!).getTime();
    return t >= bracketStart && t <= bracketEnd;
  };
  const isMoonIngress = (e: { type: string; planet: string }) =>
    e.type === 'INGRESS' && e.planet === 'MOON';

  it('reports the ingress in October, dated day 1, exactly once', () => {
    const october = calculateEphemeris({ year: 2026, month: 10 });
    expect(october.events.filter((e) => isMoonIngress(e) && inBracket(e))).toEqual([
      expect.objectContaining({ date: '2026-10-01', detail: 'MOON enters GEM' }),
    ]);
  });

  it('keeps it out of September, which still ends at its own last noon', () => {
    const september = calculateEphemeris({ year: 2026, month: 9 });
    // Only September's own 30 days; its leading 08-31 sample is not returned.
    expect(september.days.map((d) => d.date)).toEqual(
      Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`),
    );
    // Nothing from the bracket that October owns, nothing dated outside September.
    expect(september.events.filter(inBracket)).toEqual([]);
    expect(september.events.filter((e) => !e.date.startsWith('2026-09-'))).toEqual([]);
    // Its last Moon ingress is still Taurus, in the 09-28 → 09-29 bracket.
    expect(september.events.filter(isMoonIngress).at(-1)).toMatchObject({
      date: '2026-09-29', detail: 'MOON enters TAU',
    });
  });

  it('samples the previous month\'s noon in the requested zodiac', () => {
    // A tropical leading sample under sidereal would fabricate day-1 ingresses
    // (the ~24° ayanamsha puts most bodies in another sign), timed where no
    // sidereal sign boundary is crossed.
    const october = calculateEphemeris({ year: 2026, month: 10, zodiacSystem: 'sidereal' });
    const ingresses = october.events.filter((e) => e.type === 'INGRESS');
    expect(ingresses.length).toBeGreaterThan(0);
    for (const e of ingresses) {
      const jd = 2440587.5 + new Date(e.time!).getTime() / 86_400_000; // Unix epoch = JD 2440587.5
      const lon = calcPlanets(jd, [e.planet], 'sidereal')[0].longitude;
      const intoSign = ((lon % 30) + 30) % 30;
      expect(Math.min(intoSign, 30 - intoSign)).toBeLessThan(0.1);
    }
  });
});

// The noon-to-noon bracket that ends at day 1's noon of (year, month), as a
// predicate over event times.
function seamOf(year: number, month: number) {
  const end = Date.UTC(year, month - 1, 1, 12);
  const start = end - 86_400_000;
  return (e: { time?: string }) => {
    const t = new Date(e.time!).getTime();
    return t >= start && t <= end;
  };
}

describe('calculateEphemeris month-boundary bracket across the year boundary', () => {
  // January's leading sample is noon of the previous year's last day. The Moon
  // enters Scorpio inside 2026-12-31 → 2027-01-01 (10:15Z on day 1), and the
  // Sun–Mars trine is exact two minutes after the first noon, still 12-31 in
  // UTC. Both belong to January 2027 and to no December response.
  const inSeam = seamOf(2027, 1);

  it('reports the Moon ingress in January 2027, dated day 1, exactly once', () => {
    const january = calculateEphemeris({ year: 2027, month: 1 });
    const moonIngresses = january.events.filter(
      (e) => inSeam(e) && e.type === 'INGRESS' && e.planet === 'MOON',
    );
    expect(moonIngresses).toEqual([
      expect.objectContaining({ date: '2027-01-01', detail: 'MOON enters SCO' }),
    ]);
    expect(Math.abs(Date.parse(moonIngresses[0].time!) - Date.UTC(2027, 0, 1, 10, 15, 35)))
      .toBeLessThan(60_000);
  });

  it('keeps the seam out of December 2026 and the previous year out of January', () => {
    const december = calculateEphemeris({ year: 2026, month: 12 });
    const january = calculateEphemeris({ year: 2027, month: 1 });
    expect(december.events.filter(inSeam)).toEqual([]);
    const seamEvents = january.events.filter(inSeam);
    expect(seamEvents.map((e) => e.detail)).toContain('SUN TRINE MARS');
    expect(seamEvents.every((e) => e.date === '2027-01-01')).toBe(true);
    // The leading 2026-12-31 sample is not a returned day.
    expect(january.days.map((d) => d.date)).toEqual(
      Array.from({ length: 31 }, (_, i) => `2027-01-${String(i + 1).padStart(2, '0')}`),
    );
  });
});

describe('calculateEphemeris month-boundary bracket with nothing in it', () => {
  // 2026-06-30 noon → 07-01 noon: no body changes sign or direction, and no
  // slow-planet aspect perfects, so the leading sample must add nothing.
  const inSeam = seamOf(2026, 7);

  it('adds no event and no day to July 2026', () => {
    const before = calcPlanets(toJulianDay(2026, 6, 30, 12));
    const after = calcPlanets(toJulianDay(2026, 7, 1, 12));
    expect(before.map((p) => [p.sign, p.speed < 0])).toEqual(after.map((p) => [p.sign, p.speed < 0]));

    const june = calculateEphemeris({ year: 2026, month: 6 });
    const july = calculateEphemeris({ year: 2026, month: 7 });
    expect([...june.events, ...july.events].filter(inSeam)).toEqual([]);
    expect(july.events.filter((e) => e.date === '2026-07-01')).toEqual([]);
    expect(july.days).toHaveLength(31);
    expect(july.days[0].date).toBe('2026-07-01');
  });
});

describe('calculateEphemeris month-boundary brackets, 2025–2027', () => {
  // Callers merge adjacent months (the app's ICS feed and sky events do). Over
  // 37 responses (2025-01 … 2028-01), every one of the 36 seams between them
  // must reach exactly one response, and no event may appear twice. The
  // expected sign changes and stations come from the two noon samples directly,
  // not from calculateEphemeris.
  const responses: ReturnType<typeof calculateEphemeris>[] = [];
  const eventKey = (e: ReturnType<typeof calculateEphemeris>['events'][number]) =>
    [e.type, e.planet, e.targetPlanet ?? '', e.aspectType ?? '', e.time].join('|');

  beforeAll(() => {
    for (let i = 0; i < 37; i++) {
      responses.push(calculateEphemeris({ year: 2025 + Math.floor(i / 12), month: (i % 12) + 1 }));
    }
  });

  it('reports every sign change and station across each seam exactly once', () => {
    const merged = responses.flatMap((r) => r.events);
    let seamsWithSignChange = 0;
    for (const { year, month } of responses.slice(1)) {
      const inSeam = seamOf(year, month);
      const before = calcPlanets(toJulianDay(year, month, 1, 12) - 1);
      const after = calcPlanets(toJulianDay(year, month, 1, 12));
      if (before.some((p, i) => p.sign !== after[i].sign)) seamsWithSignChange++;
      before.forEach((p, i) => {
        const found = (types: string[]) => merged
          .filter((e) => inSeam(e) && e.planet === p.id && types.includes(e.type));
        const where = `seam before ${year}-${month}, ${p.id}`;
        if (p.sign !== after[i].sign) {
          expect(found(['INGRESS']), `${where} ingress`).toHaveLength(1);
        }
        if ((p.speed < 0) !== (after[i].speed < 0)) {
          expect(found(['STATION_RETROGRADE', 'STATION_DIRECT']), `${where} station`).toHaveLength(1);
        }
      });
    }
    // Most seams carry an ingress (the Moon changes sign every ~2.5 days), so
    // this is not satisfied vacuously.
    expect(seamsWithSignChange).toBeGreaterThanOrEqual(20);
  });

  it('dates each event inside its own month and never repeats one across months', () => {
    for (const r of responses) {
      const prefix = `${r.year}-${String(r.month).padStart(2, '0')}-`;
      expect(r.events.filter((e) => !e.date.startsWith(prefix))).toEqual([]);
    }
    const keys = responses.flatMap((r) => r.events.map(eventKey));
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
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
