import { calcSinglePlanet, calcHouses } from '../sweph-adapter.js';
import type { PlanetId } from '../types.js';

/** Astrocartography line type. */
export type AstromapLineType = 'MC' | 'IC' | 'AC' | 'DC';

/** A point on an astrocartography line. */
export interface AstromapPoint {
  lon: number; // terrestrial longitude, [-180, 180)
  lat: number; // terrestrial latitude, [-90, 90]
}

/**
 * A paran (paranatellonta): the latitude where two different planets are
 * simultaneously angular — i.e. where two of the planetary map-lines cross.
 * `planetA` always precedes `planetB` in `ASTROMAP_PLANETS` index order.
 */
export interface ParanCrossing {
  planetA: PlanetId;
  lineA: AstromapLineType;
  planetB: PlanetId;
  lineB: AstromapLineType;
  lat: number; // paran latitude (the crossing latitude)
  lon: number; // crossing longitude — representative marker point
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

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** MC/IC line: emit one point every 5° of latitude from -85° to +85°. */
const MC_IC_LAT_STEP = 5;
const MC_IC_LAT_MAX = 85;

/** Horizon circle (AC/DC): sample one point every 2° around the circle. */
const HORIZON_STEP_DEG = 2;

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
  const lonRad = eclLonDeg * DEG;
  const latRad = eclLatDeg * DEG;
  const sinRA = Math.sin(lonRad) * Math.cos(OBLIQUITY_RAD) - Math.tan(latRad) * Math.sin(OBLIQUITY_RAD);
  const cosRA = Math.cos(lonRad);
  const raDeg = Math.atan2(sinRA, cosRA) * RAD;
  return ((raDeg % 360) + 360) % 360;
}

/**
 * MC/IC lines for one planet at the given moment.
 * Closed form: the planet is on the MC at the terrestrial longitude where local
 * sidereal time equals its right ascension. These are constant-longitude lines.
 */
function mcLines(jdUt: number, ra: number): { mc: AstromapPoint[]; ic: AstromapPoint[] } {
  const lonMc = normalizeLon(ra - gmstDeg(jdUt));
  const lonIc = normalizeLon(lonMc + 180);
  const mc: AstromapPoint[] = [];
  const ic: AstromapPoint[] = [];
  for (let lat = -MC_IC_LAT_MAX; lat <= MC_IC_LAT_MAX; lat += MC_IC_LAT_STEP) {
    mc.push({ lon: lonMc, lat });
    ic.push({ lon: lonIc, lat });
  }
  return { mc, ic };
}

interface CirclePoint extends AstromapPoint {
  theta: number;
}

/**
 * The set of places where a body sits exactly on the horizon (altitude 0°) is a
 * great circle 90° from the body's geographic sub-point — the point on Earth
 * with the body at the zenith. We trace that circle directly rather than
 * root-finding the ascendant per longitude: it stays continuous over the whole
 * latitude range (no polar truncation) and the points come out in true path
 * order, so the rising (AC) and setting (DC) halves join cleanly at the apexes.
 *
 * Sub-point: latitude = declination, longitude(east) = RA − GMST.
 * Circle point at azimuth θ around the sub-point (angular radius 90°):
 *   lat = asin(cos φ0 · cos θ)
 *   lon = λ0 + atan2(sin θ · cos φ0, −sin φ0 · sin lat)
 */
function horizonCircle(decDeg: number, subLonEastDeg: number): CirclePoint[] {
  const phi0 = decDeg * DEG;
  const sinPhi0 = Math.sin(phi0);
  const cosPhi0 = Math.cos(phi0);
  const pts: CirclePoint[] = [];
  for (let theta = 0; theta <= 360; theta += HORIZON_STEP_DEG) {
    const thr = theta * DEG;
    const latRad = Math.asin(Math.max(-1, Math.min(1, cosPhi0 * Math.cos(thr))));
    const dLon = Math.atan2(Math.sin(thr) * cosPhi0, -sinPhi0 * Math.sin(latRad)) * RAD;
    pts.push({ theta, lat: latRad * RAD, lon: normalizeLon(subLonEastDeg + dLon) });
  }
  return pts;
}

/**
 * Split the traced horizon circle into its rising (AC) and setting (DC) halves.
 * The two apexes — the circle's latitude extremes — sit at θ = 0 and θ = 180,
 * where the body is due north/south (neither rising nor setting). Each half runs
 * apex-to-apex and they share both apex points, so AC and DC meet exactly there.
 * We label the halves by sampling the ascendant at one interior point.
 */
function horizonHalves(
  jdUt: number,
  circle: CirclePoint[],
  planetEclLon: number,
): { ac: AstromapPoint[]; dc: AstromapPoint[] } {
  const semiA = circle.filter((p) => p.theta >= 0 && p.theta <= 180).map(toPoint);
  const semiB = circle.filter((p) => p.theta >= 180).map(toPoint);

  // Label by the ascendant at θ = 90 (an interior point of semiA).
  const mid = circle.find((p) => p.theta === 90) ?? circle[Math.floor(circle.length / 4)];
  let aIsAscendant = true;
  try {
    const asc = calcHouses(jdUt, mid.lat, mid.lon, 'WHOLE_SIGN').angles.asc;
    aIsAscendant = Math.abs(angularDiff(asc, planetEclLon)) < 90;
  } catch {
    // Fall back to the analytic default if the probe point is degenerate.
  }

  return aIsAscendant ? { ac: semiA, dc: semiB } : { ac: semiB, dc: semiA };
}

function toPoint(p: CirclePoint): AstromapPoint {
  return { lon: p.lon, lat: p.lat };
}

/**
 * Compute astrocartography lines (MC/IC/AC/DC) for the given planets at the
 * given moment (JD_UT). Returns one AstromapLine per (planet, lineType) pair.
 *
 * MC/IC are closed-form constant-longitude lines. AC/DC are the rising/setting
 * halves of the body's horizon great circle, traced parametrically.
 */
export function computeAstromapLines(jdUt: number, planetIds: PlanetId[]): AstromapLine[] {
  const planets = planetIds.filter((id) => ASTROMAP_PLANETS_SET.has(id));
  if (planets.length === 0) return [];

  const gmst = gmstDeg(jdUt);
  const lines: AstromapLine[] = [];

  for (const id of planets) {
    const p = calcSinglePlanet(jdUt, id);
    const ra = eclipticToRA(p.longitude, p.latitude);

    const { mc, ic } = mcLines(jdUt, ra);

    const subLonEast = normalizeLon(ra - gmst);
    const circle = horizonCircle(p.declination, subLonEast);
    const { ac, dc } = horizonHalves(jdUt, circle, p.longitude);

    lines.push({ planetId: id, lineType: 'MC', points: mc });
    lines.push({ planetId: id, lineType: 'IC', points: ic });
    lines.push({ planetId: id, lineType: 'AC', points: ac });
    lines.push({ planetId: id, lineType: 'DC', points: dc });
  }

  return lines;
}

/** Inhabited latitude band kept for parans — outside this is mostly noise. */
const PARAN_LAT_MIN = -66;
const PARAN_LAT_MAX = 66;

/** Two crossings closer than this in latitude (same line pair) are one paran. */
const PARAN_DEDUP_LAT = 0.5;

/** Index of a planet within ASTROMAP_PLANETS (for canonical A-before-B ordering). */
function planetOrder(id: PlanetId): number {
  return ASTROMAP_PLANETS.indexOf(id);
}

/**
 * Intersection of segment (p1→p2) with segment (p3→p4) treated as planar
 * (lon, lat) coordinates. Returns the crossing point, or null when the segments
 * are parallel/collinear or do not overlap within their extents.
 *
 * Standard parametric form: P = p1 + t·(p2−p1) = p3 + u·(p4−p3), with the
 * crossing valid only for t, u ∈ [0, 1]. The vertical constant-longitude MC/IC
 * segments fall out of the general formula with no special-casing.
 */
function segmentIntersection(
  p1: AstromapPoint,
  p2: AstromapPoint,
  p3: AstromapPoint,
  p4: AstromapPoint,
): AstromapPoint | null {
  const r1 = p2.lon - p1.lon;
  const s1 = p2.lat - p1.lat;
  const r2 = p4.lon - p3.lon;
  const s2 = p4.lat - p3.lat;

  const denom = r1 * s2 - s1 * r2;
  if (denom === 0) return null; // parallel or collinear → no single crossing

  const dx = p3.lon - p1.lon;
  const dy = p3.lat - p1.lat;
  const t = (dx * s2 - dy * r2) / denom;
  const u = (dx * s1 - dy * r1) / denom;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return { lon: p1.lon + t * r1, lat: p1.lat + t * s1 };
}

/**
 * Compute parans (paranatellonta) from a set of astrocartography lines.
 *
 * A paran is the latitude where two *different* planets are simultaneously
 * angular, which is exactly where two of their map-lines cross. So this finds
 * planar (lon, lat) intersections between line polylines of different planets —
 * no new astronomy, just 2D segment-segment intersection on the existing points.
 *
 * Segments that wrap the ±180° antimeridian seam are skipped before testing.
 * Crossings are kept only inside the inhabited band [−66°, 66°], near-duplicate
 * crossings for the same (planetA, lineA, planetB, lineB) are collapsed within
 * ~0.5° of latitude, and planets are normalised so planetA precedes planetB in
 * ASTROMAP_PLANETS order. Output is sorted deterministically.
 */
export function computeAstromapParans(lines: AstromapLine[]): ParanCrossing[] {
  const crossings: ParanCrossing[] = [];

  for (let i = 0; i < lines.length; i++) {
    const a = lines[i];
    for (let j = i + 1; j < lines.length; j++) {
      const b = lines[j];
      if (a.planetId === b.planetId) continue; // only different planets cross to a paran

      for (let m = 0; m + 1 < a.points.length; m++) {
        const a1 = a.points[m];
        const a2 = a.points[m + 1];
        // Skip segments that wrap the antimeridian seam.
        if (Math.abs(normalizeLon(a2.lon - a1.lon)) > 180) continue;
        if (Math.abs(a2.lon - a1.lon) > 180) continue;

        for (let n = 0; n + 1 < b.points.length; n++) {
          const b1 = b.points[n];
          const b2 = b.points[n + 1];
          if (Math.abs(b2.lon - b1.lon) > 180) continue;

          const hit = segmentIntersection(a1, a2, b1, b2);
          if (!hit) continue;
          if (hit.lat < PARAN_LAT_MIN || hit.lat > PARAN_LAT_MAX) continue;

          // Normalise so planetA precedes planetB in ASTROMAP_PLANETS order,
          // swapping the line labels along with the planets.
          let planetA = a.planetId;
          let lineA = a.lineType;
          let planetB = b.planetId;
          let lineB = b.lineType;
          if (planetOrder(planetA) > planetOrder(planetB)) {
            [planetA, planetB] = [planetB, planetA];
            [lineA, lineB] = [lineB, lineA];
          }

          crossings.push({ planetA, lineA, planetB, lineB, lat: hit.lat, lon: hit.lon });
        }
      }
    }
  }

  // Sort deterministically: planetA index, planetB index, lineA, lineB, lat.
  crossings.sort((x, y) => {
    return (
      planetOrder(x.planetA) - planetOrder(y.planetA) ||
      planetOrder(x.planetB) - planetOrder(y.planetB) ||
      x.lineA.localeCompare(y.lineA) ||
      x.lineB.localeCompare(y.lineB) ||
      x.lat - y.lat
    );
  });

  // Dedup near-duplicate crossings for the same line pair within ~0.5° latitude.
  const deduped: ParanCrossing[] = [];
  for (const c of crossings) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.planetA === c.planetA &&
      prev.lineA === c.lineA &&
      prev.planetB === c.planetB &&
      prev.lineB === c.lineB &&
      Math.abs(prev.lat - c.lat) <= PARAN_DEDUP_LAT
    ) {
      continue;
    }
    deduped.push(c);
  }

  return deduped;
}
