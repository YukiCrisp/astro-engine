import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph, calcHouses, calcSinglePlanet } from '../../src/engine/sweph-adapter.js';
import {
  computeAstromapLines,
  angularDiff,
  normalizeLon,
  gmstDeg,
} from '../../src/engine/calculations/astrocartography.js';
import { buildJulianDay } from '../../src/utils/date.js';

beforeAll(() => {
  initSweph('./ephe');
});

/**
 * Right ascension from ecliptic longitude/latitude (degrees), mirroring the
 * transform inside the calc module. Used as a reference implementation here.
 */
function eclipticToRA(eclLonDeg: number, eclLatDeg: number): number {
  const OBLIQUITY_RAD = (23.4393 * Math.PI) / 180;
  const lonRad = (eclLonDeg * Math.PI) / 180;
  const latRad = (eclLatDeg * Math.PI) / 180;
  const sinRA = Math.sin(lonRad) * Math.cos(OBLIQUITY_RAD) - Math.tan(latRad) * Math.sin(OBLIQUITY_RAD);
  const cosRA = Math.cos(lonRad);
  const raDeg = (Math.atan2(sinRA, cosRA) * 180) / Math.PI;
  return ((raDeg % 360) + 360) % 360;
}

describe('Astromap MC line — internal consistency', () => {
  // Einstein: 1879-03-14 11:30 LMT Ulm, UTC+0:40
  const jd = buildJulianDay('1879-03-14', '11:30', 40);

  it('Sun MC line longitude matches RA(Sun) − GMST(jd)', () => {
    const sun = calcSinglePlanet(jd, 'SUN');
    const expected = normalizeLon(eclipticToRA(sun.longitude, sun.latitude) - gmstDeg(jd));
    const lines = computeAstromapLines(jd, ['SUN']);
    const mc = lines.find((l) => l.lineType === 'MC')!;
    expect(Math.abs(angularDiff(mc.points[0].lon, expected))).toBeLessThan(0.01);
  });

  it('Sun IC line longitude is exactly 180° from MC', () => {
    const lines = computeAstromapLines(jd, ['SUN']);
    const mc = lines.find((l) => l.lineType === 'MC')!;
    const ic = lines.find((l) => l.lineType === 'IC')!;
    expect(Math.abs(angularDiff(mc.points[0].lon, ic.points[0].lon))).toBeCloseTo(180, 5);
  });

  it('is zodiac-independent: MC line uses physical (tropical) longitude, not sidereal', () => {
    // Astrocartography plots each planet's physical angularity, a real
    // sky-position fact independent of the zodiac's ecliptic labeling. The
    // Sun's MC line must be built from the equinox-referenced (tropical)
    // longitude. Feeding the sidereal longitude (tropical − ayanamsha) into the
    // equinox-referenced RA transform would rotate the line by the ayanamsha
    // (~24°) and place the planet at the wrong terrestrial longitude. This test
    // locks the correct behaviour so a future "add sidereal support" change
    // cannot silently corrupt the map. See ENGA-1255.
    const tropical = calcSinglePlanet(jd, 'SUN');
    const sidereal = calcSinglePlanet(jd, 'SUN', 'sidereal');
    // Sanity: the two systems really do differ by the ayanamsha (~24°).
    expect(Math.abs(angularDiff(tropical.longitude, sidereal.longitude))).toBeGreaterThan(20);

    const lines = computeAstromapLines(jd, ['SUN']);
    const mcLon = lines.find((l) => l.lineType === 'MC')!.points[0].lon;

    // The real MC line matches the TROPICAL-derived RA...
    const expectedTropical = normalizeLon(eclipticToRA(tropical.longitude, tropical.latitude) - gmstDeg(jd));
    expect(Math.abs(angularDiff(mcLon, expectedTropical))).toBeLessThan(0.01);

    // ...and is far (>15°) from the line a (wrong) sidereal longitude would give.
    const wrongSidereal = normalizeLon(eclipticToRA(sidereal.longitude, sidereal.latitude) - gmstDeg(jd));
    expect(Math.abs(angularDiff(mcLon, wrongSidereal))).toBeGreaterThan(15);
  });

  it('all 10 planets have an MC line', () => {
    const lines = computeAstromapLines(jd, [
      'SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS',
      'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
    ]);
    const mcLines = lines.filter((l) => l.lineType === 'MC');
    expect(mcLines).toHaveLength(10);
    for (const line of mcLines) {
      expect(line.points.length).toBeGreaterThan(0);
    }
  });
});

describe('Astromap AC line — round-trip via calcHouses', () => {
  const jd = buildJulianDay('1879-03-14', '11:30', 40);

  it('at every AC point, calcHouses returns asc ≈ Sun ecliptic longitude', () => {
    const sun = calcSinglePlanet(jd, 'SUN');
    const lines = computeAstromapLines(jd, ['SUN']);
    const ac = lines.find((l) => l.lineType === 'AC')!;
    expect(ac.points.length).toBeGreaterThan(0);

    // Sample several points across the AC line.
    const sampleIndices = [
      Math.floor(ac.points.length * 0.25),
      Math.floor(ac.points.length * 0.5),
      Math.floor(ac.points.length * 0.75),
    ];
    for (const idx of sampleIndices) {
      const { lon, lat } = ac.points[idx];
      const { angles } = calcHouses(jd, lat, lon, 'WHOLE_SIGN');
      // Bisection tolerance is 0.01°; calcHouses round-trip stays within ~0.1°.
      expect(Math.abs(angularDiff(angles.asc, sun.longitude))).toBeLessThan(0.5);
    }
  });

  it('at every DC point, calcHouses returns dsc ≈ Sun ecliptic longitude', () => {
    const sun = calcSinglePlanet(jd, 'SUN');
    const lines = computeAstromapLines(jd, ['SUN']);
    const dc = lines.find((l) => l.lineType === 'DC')!;
    expect(dc.points.length).toBeGreaterThan(0);

    const sampleIndices = [
      Math.floor(dc.points.length * 0.25),
      Math.floor(dc.points.length * 0.5),
      Math.floor(dc.points.length * 0.75),
    ];
    for (const idx of sampleIndices) {
      const { lon, lat } = dc.points[idx];
      const { angles } = calcHouses(jd, lat, lon, 'WHOLE_SIGN');
      const dsc = (angles.asc + 180) % 360;
      expect(Math.abs(angularDiff(dsc, sun.longitude))).toBeLessThan(0.5);
    }
  });
});
