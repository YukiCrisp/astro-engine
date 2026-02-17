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

export function fromJulianDay(jd: number): string {
  // Meeus algorithm (Astronomical Algorithms, Ch. 7)
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  const a =
    z < 2299161
      ? z
      : z + 1 + Math.floor((z - 1867216.25) / 36524.25) -
        Math.floor(Math.floor((z - 1867216.25) / 36524.25) / 4);
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);

  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  const totalSeconds = Math.round(f * 86400);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  const mi = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${year}-${mm}-${dd}T${hh}:${mi}:${ss}Z`;
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
