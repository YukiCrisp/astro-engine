import { buildJulianDay } from '../../utils/date.js';

export function getProgressedJulianDay(
  birthDate: string,
  birthTime: string | null,
  utcOffsetMinutes: number,
  progressedDate: string
): number {
  const birthJD = buildJulianDay(birthDate, birthTime, utcOffsetMinutes);
  const [py, pm, pd] = progressedDate.split('-').map(Number);
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const targetDate = new Date(Date.UTC(py, pm - 1, pd));
  const birthDateObj = new Date(Date.UTC(by, bm - 1, bd));
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsElapsed = (targetDate.getTime() - birthDateObj.getTime()) / msPerYear;
  return birthJD + yearsElapsed;
}
