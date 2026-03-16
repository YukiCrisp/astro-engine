import { calcSinglePlanet } from '../sweph-adapter.js';
import { toJulianDay } from '../../utils/date.js';

/**
 * Find the Julian Day when the transiting Sun returns to the natal Sun longitude.
 *
 * Uses binary search within a 40-day window around the target year's birthday.
 * Handles the 360/0 wraparound (Pisces/Aries boundary).
 */
export function findSolarReturnJD(
  natalSunLongitude: number,
  birthYear: number,
  birthMonth: number,
  birthDay: number,
  targetYear: number,
): number {
  // Search window: target year birthday -10 days to +30 days
  let lo = toJulianDay(targetYear, birthMonth, birthDay, 0) - 10;
  let hi = lo + 40;

  const PRECISION = 0.0001; // degrees
  const MAX_ITERATIONS = 60;

  // Normalize the difference between two longitudes to [-180, 180)
  function lonDiff(a: number, b: number): number {
    let d = a - b;
    d = ((d % 360) + 540) % 360 - 180;
    return d;
  }

  // Evaluate: positive means Sun hasn't reached natal longitude yet (go later),
  // negative means it passed (go earlier).
  function evaluate(jd: number): number {
    const sun = calcSinglePlanet(jd, 'SUN');
    return lonDiff(sun.longitude, natalSunLongitude);
  }

  // Ensure the signs at lo and hi bracket the zero-crossing
  let fLo = evaluate(lo);
  let fHi = evaluate(hi);

  // If both have the same sign, shift the window
  if (fLo * fHi > 0) {
    // Try extending the search window
    lo -= 10;
    hi += 10;
    fLo = evaluate(lo);
    fHi = evaluate(hi);
  }

  // Binary search
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const fMid = evaluate(mid);

    if (Math.abs(fMid) < PRECISION) {
      return mid;
    }

    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  // Return best approximation
  return (lo + hi) / 2;
}
