import { calcSinglePlanet, calcHouses } from '../sweph-adapter.js';
import type { PlanetId } from '../types.js';

/** Astrocartography line type. */
export type AstromapLineType = 'MC' | 'IC' | 'AC' | 'DC';

/** A point on an astrocartography line. */
export interface AstromapPoint {
  lon: number; // terrestrial longitude, [-180, 180)
  lat: number; // terrestrial latitude, [-90, 90]
}

/** One astrocartography line for one planet. */
export interface AstromapLine {
  planetId: PlanetId;
  lineType: AstromapLineType;
  points: AstromapPoint[];
}

/** Planets supported by astrocartography v1 (the 10 classical bodies). */
export const ASTROMAP_PLANETS: readonly PlanetId[] = [
  'SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS',
  'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
] as const;

const ASTROMAP_PLANETS_SET: Set<PlanetId> = new Set(ASTROMAP_PLANETS);

/** Mean obliquity of the ecliptic (degrees) — must match sweph-adapter's value. */
const OBLIQUITY_DEG = 23.4393;
const OBLIQUITY_RAD = (OBLIQUITY_DEG * Math.PI) / 180;

/** MC/IC line: emit one point every 5° of latitude from -85° to +85°. */
const MC_IC_LAT_STEP = 5;
const MC_IC_LAT_MAX = 85;

/**
 * AC/DC line: scan terrestrial longitude every 1°, latitude every 6° within ±83°.
 * Beyond ~83° tan(lat) explodes; Placidus fails above ±66.5° but Whole Sign
 * (used below) returns the underlying ASC value at any latitude where it's
 * mathematically defined.
 */
const AC_DC_LON_STEP = 1;
const AC_DC_LAT_STEP = 6;
const AC_DC_LAT_LIMIT = 83;

/** Bisection tolerance (degrees) and iteration cap. */
const BISECT_TOL = 0.01;
const BISECT_MAX_ITER = 30;

/** Wrap terrestrial longitude into [-180, 180). */
export function normalizeLon(x: number): number {
  return (((x + 180) % 360) + 360) % 360 - 180;
}

/**
 * Signed angular difference in (-180, 180].
 * Crosses zero exactly when `a` equals `b` on the circle.
 */
export function angularDiff(a: number, b: number): number {
  return (((a - b) % 360) + 540) % 360 - 180;
}

/**
 * Greenwich Mean Sidereal Time at the given Julian Day (UT), in degrees [0, 360).
 * Standard IAU 1982 expansion via Meeus, Astronomical Algorithms, Ch. 12.
 */
export function gmstDeg(jdUt: number): number {
  const T = (jdUt - 2451545.0) / 36525;
  const gmst =
    280.46061837 +
    360.98564736629 * (jdUt - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000;
  return ((gmst % 360) + 360) % 360;
}

/**
 * Right ascension (degrees, [0, 360)) of a celestial point given its
 * ecliptic longitude and latitude (degrees).
 */
function eclipticToRA(eclLonDeg: number, eclLatDeg: number): number {
  const lonRad = (eclLonDeg * Math.PI) / 180;
  const latRad = (eclLatDeg * Math.PI) / 180;
  const sinRA = Math.sin(lonRad) * Math.cos(OBLIQUITY_RAD) - Math.tan(latRad) * Math.sin(OBLIQUITY_RAD);
  const cosRA = Math.cos(lonRad);
  const raDeg = (Math.atan2(sinRA, cosRA) * 180) / Math.PI;
  return ((raDeg % 360) + 360) % 360;
}

/**
 * MC/IC lines for one planet at the given moment.
 * Closed form: planet is on the MC at the terrestrial longitude where local
 * sidereal time equals its right ascension.
 */
function mcLinesForPlanet(jdUt: number, planetEclLon: number, planetEclLat: number): {
  mc: AstromapPoint[];
  ic: AstromapPoint[];
} {
  const ra = eclipticToRA(planetEclLon, planetEclLat);
  const gmst = gmstDeg(jdUt);
  const lonMc = normalizeLon(ra - gmst);
  const lonIc = normalizeLon(lonMc + 180);
  const mc: AstromapPoint[] = [];
  const ic: AstromapPoint[] = [];
  for (let lat = -MC_IC_LAT_MAX; lat <= MC_IC_LAT_MAX; lat += MC_IC_LAT_STEP) {
    mc.push({ lon: lonMc, lat });
    ic.push({ lon: lonIc, lat });
  }
  return { mc, ic };
}

/**
 * Build the lat→asc sample table for one terrestrial longitude.
 * Returns the latitude scan and the corresponding asc values (degrees).
 * Skips any lat at which calcHouses fails (extreme polar input).
 */
function ascScanAtLon(jdUt: number, terrestrialLon: number): { lat: number; asc: number }[] {
  const samples: { lat: number; asc: number }[] = [];
  for (let lat = -AC_DC_LAT_LIMIT; lat <= AC_DC_LAT_LIMIT; lat += AC_DC_LAT_STEP) {
    try {
      const { angles } = calcHouses(jdUt, lat, terrestrialLon, 'WHOLE_SIGN');
      // sweph silently returns NaN at extreme polar latitudes for some systems —
      // skip those so the bisection never brackets across a bad sample.
      if (Number.isFinite(angles.asc)) samples.push({ lat, asc: angles.asc });
    } catch {
      // Hard failure → drop this sample; the line just won't pass here.
    }
  }
  return samples;
}

/**
 * Bisect `f(lat) = angularDiff(asc(lat), target)` between two latitude bracket
 * endpoints with known opposite-sign f values. Returns the latitude at which
 * |f| ≤ BISECT_TOL, or null if the iteration failed to converge.
 */
function bisectForTarget(
  jdUt: number,
  terrestrialLon: number,
  target: number,
  latLow: number,
  latHigh: number,
  fLow: number,
): number | null {
  let lo = latLow;
  let hi = latHigh;
  let fLo = fLow;
  for (let i = 0; i < BISECT_MAX_ITER; i++) {
    const mid = (lo + hi) / 2;
    let asc: number;
    try {
      asc = calcHouses(jdUt, mid, terrestrialLon, 'PLACIDUS').angles.asc;
    } catch {
      return null;
    }
    const fMid = angularDiff(asc, target);
    if (Math.abs(fMid) < BISECT_TOL) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
    if (hi - lo < BISECT_TOL) return mid;
  }
  return (lo + hi) / 2;
}

/**
 * Compute astrocartography lines (MC/IC/AC/DC) for the given planets at the
 * given moment (JD_UT). Returns one AstromapLine per (planet, lineType) pair.
 *
 * Performance note: ASC depends only on (jd, lat, lon), not on which planet
 * we're tracking. The implementation samples ASC once per (lat, lon) and
 * compares to all enabled planets' ecliptic longitudes — cutting sweph calls
 * from ~108k to ~10.8k versus a naive per-planet loop.
 */
export function computeAstromapLines(jdUt: number, planetIds: PlanetId[]): AstromapLine[] {
  const planets = planetIds.filter((id) => ASTROMAP_PLANETS_SET.has(id));
  if (planets.length === 0) return [];

  // Fetch each planet's ecliptic position once.
  const planetPositions = planets.map((id) => {
    const p = calcSinglePlanet(jdUt, id);
    return { id, eclLon: p.longitude, eclLat: p.latitude };
  });

  // MC/IC: closed form per planet.
  const mcPoints: Map<PlanetId, AstromapPoint[]> = new Map();
  const icPoints: Map<PlanetId, AstromapPoint[]> = new Map();
  for (const p of planetPositions) {
    const { mc, ic } = mcLinesForPlanet(jdUt, p.eclLon, p.eclLat);
    mcPoints.set(p.id, mc);
    icPoints.set(p.id, ic);
  }

  // AC/DC: scan longitude, sample asc once per (lat, lon), bisect per planet.
  const acPoints: Map<PlanetId, AstromapPoint[]> = new Map(planets.map((id) => [id, []]));
  const dcPoints: Map<PlanetId, AstromapPoint[]> = new Map(planets.map((id) => [id, []]));

  for (let lon = -180; lon < 180; lon += AC_DC_LON_STEP) {
    const samples = ascScanAtLon(jdUt, lon);
    if (samples.length < 2) continue;

    for (const p of planetPositions) {
      const targetAC = p.eclLon;
      const targetDC = (p.eclLon + 180) % 360;

      for (let i = 0; i < samples.length - 1; i++) {
        const s0 = samples[i];
        const s1 = samples[i + 1];

        // Skip brackets where asc(lat) itself jumped between samples.
        // Near the poles the ASC formula has discontinuities (tan(lat) → ∞),
        // which would produce fake sign-changes the bisection can't resolve.
        // A 6° lat step shouldn't move asc by more than ~60° in the smooth
        // region; reject anything bigger.
        if (Math.abs(angularDiff(s0.asc, s1.asc)) > 60) continue;

        // A real root exists where f = angularDiff(asc, target) crosses zero
        // smoothly. The wraparound at asc = target ± 180 creates a fake sign
        // flip; reject brackets where |f0 - f1| > 180 (the wrap, not a root).
        const fAC0 = angularDiff(s0.asc, targetAC);
        const fAC1 = angularDiff(s1.asc, targetAC);
        if (fAC0 * fAC1 < 0 && Math.abs(fAC0 - fAC1) < 180) {
          const latRoot = bisectForTarget(jdUt, lon, targetAC, s0.lat, s1.lat, fAC0);
          if (latRoot !== null) acPoints.get(p.id)!.push({ lon, lat: latRoot });
        }

        const fDC0 = angularDiff(s0.asc, targetDC);
        const fDC1 = angularDiff(s1.asc, targetDC);
        if (fDC0 * fDC1 < 0 && Math.abs(fDC0 - fDC1) < 180) {
          const latRoot = bisectForTarget(jdUt, lon, targetDC, s0.lat, s1.lat, fDC0);
          if (latRoot !== null) dcPoints.get(p.id)!.push({ lon, lat: latRoot });
        }
      }
    }
  }

  const lines: AstromapLine[] = [];
  for (const id of planets) {
    lines.push({ planetId: id, lineType: 'MC', points: mcPoints.get(id) ?? [] });
    lines.push({ planetId: id, lineType: 'IC', points: icPoints.get(id) ?? [] });
    lines.push({ planetId: id, lineType: 'AC', points: acPoints.get(id) ?? [] });
    lines.push({ planetId: id, lineType: 'DC', points: dcPoints.get(id) ?? [] });
  }
  return lines;
}
