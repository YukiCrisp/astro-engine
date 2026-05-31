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
