import { buildJulianDay, parseDateString, toJulianDay } from '../../utils/date.js';

/** Secondary progression: one ephemeris day per tropical year of life. */
const DAYS_PER_YEAR = 365.25;

/**
 * The anchors of the day-for-a-year clock. Elapsed life is counted from
 * midnight UTC of the birth date (not the birth moment), as it always has
 * been in `getProgressedJulianDay`; the progressed sky starts at the birth JD.
 */
export interface ProgressionClock {
  birthJd: number;
  birthDateMidnightJd: number;
}

export function progressionClock(
  birthDate: string,
  birthTime: string | null,
  utcOffsetMinutes: number,
): ProgressionClock {
  const { year, month, day } = parseDateString(birthDate);
  return {
    birthJd: buildJulianDay(birthDate, birthTime, utcOffsetMinutes),
    birthDateMidnightJd: toJulianDay(year, month, day, 0),
  };
}

/** The progressed-sky JD for a real moment (both UT Julian days). */
export function progressedJdFromRealJd(clock: ProgressionClock, realJd: number): number {
  return clock.birthJd + (realJd - clock.birthDateMidnightJd) / DAYS_PER_YEAR;
}

/** The real moment whose progressed sky is `progressedJd`. */
export function realJdFromProgressedJd(clock: ProgressionClock, progressedJd: number): number {
  return clock.birthDateMidnightJd + (progressedJd - clock.birthJd) * DAYS_PER_YEAR;
}

export function getProgressedJulianDay(
  birthDate: string,
  birthTime: string | null,
  utcOffsetMinutes: number,
  progressedDate: string
): number {
  const { year, month, day } = parseDateString(progressedDate);
  return progressedJdFromRealJd(
    progressionClock(birthDate, birthTime, utcOffsetMinutes),
    toJulianDay(year, month, day, 0),
  );
}
