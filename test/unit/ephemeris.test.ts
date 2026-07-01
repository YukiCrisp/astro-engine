import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import { calculateEphemeris, calculateVocMoon } from '../../src/engine/index.js';

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
