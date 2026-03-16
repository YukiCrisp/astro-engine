import { calcFixedStar } from '../sweph-adapter.js';
import type { SignName } from '../types.js';

export interface FixedStarResult {
  name: string;
  longitude: number;
  latitude: number;
  sign: string;
  signDegree: number;
}

const SIGN_NAMES: readonly SignName[] = [
  'ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR',
  'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS',
];

/**
 * J2000.0 epoch reference positions for major fixed stars.
 * longitude/latitude in ecliptic degrees at JD 2451545.0 (2000-01-01 12:00 TT).
 * Precession rate ~50.29" per year applied linearly for other dates.
 */
const STAR_CATALOG: { name: string; lonJ2000: number; latJ2000: number }[] = [
  { name: 'Regulus',   lonJ2000: 149.828,  latJ2000:  0.466 },
  { name: 'Algol',     lonJ2000:  56.166,  latJ2000: 22.414 },
  { name: 'Spica',     lonJ2000: 203.828,  latJ2000: -2.052 },
  { name: 'Antares',   lonJ2000: 249.679,  latJ2000: -4.570 },
  { name: 'Fomalhaut', lonJ2000: 333.871,  latJ2000: -21.121 },
  { name: 'Aldebaran', lonJ2000:  69.947,  latJ2000: -5.467 },
  { name: 'Sirius',    lonJ2000: 104.084,  latJ2000: -39.605 },
  { name: 'Procyon',   lonJ2000: 115.321,  latJ2000: -16.024 },
];

const PRECESSION_ARCSEC_PER_YEAR = 50.29;
const J2000_JD = 2451545.0;
const DAYS_PER_JULIAN_YEAR = 365.25;

function toResult(name: string, longitude: number, latitude: number): FixedStarResult {
  const lon = ((longitude % 360) + 360) % 360;
  const signIdx = Math.floor(lon / 30);
  return {
    name,
    longitude: lon,
    latitude,
    sign: SIGN_NAMES[signIdx],
    signDegree: lon % 30,
  };
}

/**
 * Fallback: compute position from J2000 catalog with linear precession.
 */
function staticStar(star: { name: string; lonJ2000: number; latJ2000: number }, jd: number): FixedStarResult {
  const years = (jd - J2000_JD) / DAYS_PER_JULIAN_YEAR;
  const precessionDeg = (PRECESSION_ARCSEC_PER_YEAR * years) / 3600;
  return toResult(star.name, star.lonJ2000 + precessionDeg, star.latJ2000);
}

let useSweph: boolean | null = null;

export function calculateFixedStars(jd: number): FixedStarResult[] {
  // On first call, probe whether sweph can resolve fixed stars
  if (useSweph === null) {
    const probe = calcFixedStar('Regulus', jd);
    useSweph = probe !== null;
  }

  if (useSweph) {
    const results: FixedStarResult[] = [];
    for (const star of STAR_CATALOG) {
      const r = calcFixedStar(star.name, jd);
      if (r) results.push(toResult(star.name, r.longitude, r.latitude));
    }
    if (results.length > 0) return results;
    // If all failed, fall through to static
  }

  return STAR_CATALOG.map((star) => staticStar(star, jd));
}
