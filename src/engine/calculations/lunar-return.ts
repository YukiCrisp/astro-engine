import { calcSinglePlanet } from '../sweph-adapter.js';
import { buildJulianDay } from '../../utils/date.js';

/**
 * Find the Julian Day when the transiting Moon returns to the natal Moon longitude.
 *
 * Uses binary search within a window around the search start date.
 * The Moon completes a full cycle in ~27.3 days, moving ~13 degrees/day.
 *
 * @param natalMoonLongitude  Natal Moon longitude in degrees
 * @param searchStartJD       Julian Day to start searching from
 * @param searchDirection     1 = forward (next return), -1 = backward (previous return)
 */
export function findLunarReturnJD(
  natalMoonLongitude: number,
  searchStartJD: number,
  searchDirection: 1 | -1 = 1,
): number {
  // Moon cycle is ~27.3 days. Search window accordingly.
  const windowStart = searchDirection === 1 ? searchStartJD - 2 : searchStartJD - 30;
  const windowEnd = searchDirection === 1 ? searchStartJD + 30 : searchStartJD + 2;
  let lo = windowStart;
  let hi = windowEnd;

  const PRECISION = 0.0001; // degrees
  const MAX_ITERATIONS = 80; // More iterations due to faster Moon movement

  // Normalize the difference between two longitudes to [-180, 180)
  function lonDiff(a: number, b: number): number {
    let d = a - b;
    d = ((d % 360) + 540) % 360 - 180;
    return d;
  }

  // Evaluate: positive means Moon hasn't reached natal longitude yet (go later),
  // negative means it passed (go earlier).
  function evaluate(jd: number): number {
    const moon = calcSinglePlanet(jd, 'MOON');
    return lonDiff(moon.longitude, natalMoonLongitude);
  }

  // The Moon moves fast enough that a 32-day window will contain multiple
  // zero-crossings. We need to find the one closest to searchStartJD in the
  // requested direction. Scan the window in small steps to find a bracket.
  const SCAN_STEP = 0.5; // half-day steps
  let bracketLo = lo;
  let bracketHi = hi;
  let foundBracket = false;

  if (searchDirection === 1) {
    // Scan forward from searchStartJD
    let prev = evaluate(searchStartJD);
    for (let jd = searchStartJD + SCAN_STEP; jd <= hi; jd += SCAN_STEP) {
      const curr = evaluate(jd);
      if (prev * curr < 0) {
        bracketLo = jd - SCAN_STEP;
        bracketHi = jd;
        foundBracket = true;
        break;
      }
      prev = curr;
    }
  } else {
    // Scan backward from searchStartJD
    let prev = evaluate(searchStartJD);
    for (let jd = searchStartJD - SCAN_STEP; jd >= lo; jd -= SCAN_STEP) {
      const curr = evaluate(jd);
      if (prev * curr < 0) {
        bracketLo = jd;
        bracketHi = jd + SCAN_STEP;
        foundBracket = true;
        break;
      }
      prev = curr;
    }
  }

  if (foundBracket) {
    lo = bracketLo;
    hi = bracketHi;
  }

  let fLo = evaluate(lo);

  // Binary search
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const fMid = evaluate(mid);

    if (Math.abs(fMid) < PRECISION) {
      return mid;
    }

    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  // Return best approximation
  return (lo + hi) / 2;
}
