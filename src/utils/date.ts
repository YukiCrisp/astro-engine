export function toJulianDay(
  year: number, month: number, day: number, hourDecimal: number = 0
): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jdn =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;
  return jdn - 0.5 + hourDecimal / 24;
}

export function parseTimeToDecimalHours(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h + m / 60;
}

export function parseDateString(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

export function buildJulianDay(
  birthDate: string,
  birthTime: string | null,
  utcOffsetMinutes: number
): number {
  const { year, month, day } = parseDateString(birthDate);
  const localHours = birthTime !== null ? parseTimeToDecimalHours(birthTime) : 12;
  const utcHours = localHours - utcOffsetMinutes / 60;
  return toJulianDay(year, month, day, utcHours);
}
