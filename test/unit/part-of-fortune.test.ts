import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import { calculateNatal } from '../../src/engine/index.js';
import { isDayChartByAngles, partOfFortuneLongitude } from '../../src/engine/calculations/arabic-parts.js';

/**
 * The wheel's Part of Fortune (`angles.partOfFortune`) must switch formula by
 * sect, using the ASC–DSC axis: Day = ASC + Moon - Sun, Night = ASC + Sun - Moon.
 * It used to apply the day formula to every chart.
 */

describe('isDayChartByAngles', () => {
  it('treats the half from DSC through MC to ASC as above the horizon', () => {
    // ASC 0° Aries → DSC 0° Libra; the upper half is Libra..Pisces.
    expect(isDayChartByAngles(270, 0)).toBe(true);   // MC side
    expect(isDayChartByAngles(180, 0)).toBe(true);   // on the DSC
    expect(isDayChartByAngles(90, 0)).toBe(false);   // IC side
    expect(isDayChartByAngles(0, 0)).toBe(false);    // on the ASC
  });

  it('handles axes that wrap past 0°', () => {
    // ASC 300° → DSC 120°; upper half is 120°..300°.
    expect(isDayChartByAngles(200, 300)).toBe(true);
    expect(isDayChartByAngles(10, 300)).toBe(false);
  });
});

describe('partOfFortuneLongitude', () => {
  it('reverses Sun and Moon for night charts', () => {
    expect(partOfFortuneLongitude(10, 100, 40, true)).toBeCloseTo(310);
    expect(partOfFortuneLongitude(10, 100, 40, false)).toBeCloseTo(70);
  });
});

describe('calculateNatal angles.partOfFortune', () => {
  beforeAll(() => {
    initSweph('./ephe');
  });

  const base = {
    birthDate: '1990-04-15',
    lat: 35.6762,
    lon: 139.6503,
    utcOffsetMinutes: 540,
    houseSystem: 'PLACIDUS' as const,
    enabledArabicParts: ['PART_OF_FORTUNE' as const],
  };

  function lonOf(chart: ReturnType<typeof calculateNatal>, id: string): number {
    return chart.planets.find(p => p.id === id)!.longitude;
  }

  it.each([
    ['day', '12:00', true],
    ['night', '23:00', false],
  ] as const)('%s birth uses its own sect formula', (_label, birthTime, expectDay) => {
    const chart = calculateNatal({ ...base, birthTime });
    const asc = chart.angles!.asc;
    const sun = lonOf(chart, 'SUN');
    const moon = lonOf(chart, 'MOON');

    expect(isDayChartByAngles(sun, asc)).toBe(expectDay);
    const expected = partOfFortuneLongitude(asc, sun, moon, expectDay);
    expect(chart.angles!.partOfFortune).toBeCloseTo(expected, 6);

    // The wheel point and the Arabic Parts list must agree.
    const listed = chart.arabicParts!.find(p => p.id === 'PART_OF_FORTUNE')!;
    expect(listed.longitude).toBeCloseTo(chart.angles!.partOfFortune, 6);
  });

  it('night birth no longer returns the day formula', () => {
    const chart = calculateNatal({ ...base, birthTime: '23:00' });
    const asc = chart.angles!.asc;
    const dayFormula = partOfFortuneLongitude(asc, lonOf(chart, 'SUN'), lonOf(chart, 'MOON'), true);
    expect(chart.angles!.partOfFortune).not.toBeCloseTo(dayFormula, 1);
  });
});
