import { describe, it, expect } from 'vitest';
import { toJulianDay, parseTimeToDecimalHours, parseDateString, buildJulianDay } from '../../src/utils/date.js';

describe('toJulianDay', () => {
  it('returns correct JD for J2000 epoch (2000-01-01 12:00 UT)', () => {
    expect(toJulianDay(2000, 1, 1, 12)).toBeCloseTo(2451545.0, 5);
  });

  it('returns correct JD for Unix epoch (1970-01-01 00:00 UT)', () => {
    expect(toJulianDay(1970, 1, 1, 0)).toBeCloseTo(2440587.5, 5);
  });

  it('handles dates before the epoch correctly', () => {
    // 1879-03-14 at noon UT — verified via accuracy test (Einstein chart)
    const jd = toJulianDay(1879, 3, 14, 12);
    expect(jd).toBeCloseTo(2407423.0, 0);
  });
});

describe('parseTimeToDecimalHours', () => {
  it('parses midnight', () => {
    expect(parseTimeToDecimalHours('00:00')).toBe(0);
  });

  it('parses noon', () => {
    expect(parseTimeToDecimalHours('12:00')).toBe(12);
  });

  it('parses 14:30', () => {
    expect(parseTimeToDecimalHours('14:30')).toBe(14.5);
  });

  it('parses 23:59', () => {
    expect(parseTimeToDecimalHours('23:59')).toBeCloseTo(23.983, 2);
  });
});

describe('parseDateString', () => {
  it('parses YYYY-MM-DD', () => {
    expect(parseDateString('1990-04-15')).toEqual({ year: 1990, month: 4, day: 15 });
  });
});

describe('buildJulianDay', () => {
  it('applies UTC offset correctly', () => {
    // JST (+540 min) at 14:30 local = 05:30 UT
    const jd = buildJulianDay('2000-01-01', '14:30', 540);
    const expected = toJulianDay(2000, 1, 1, 5.5);
    expect(jd).toBeCloseTo(expected, 10);
  });

  it('defaults to noon when birthTime is null', () => {
    const jd = buildJulianDay('2000-01-01', null, 0);
    const expected = toJulianDay(2000, 1, 1, 12);
    expect(jd).toBeCloseTo(expected, 10);
  });

  it('applies offset even with null birthTime (noon local → UTC)', () => {
    // Noon JST = 03:00 UT
    const jd = buildJulianDay('2000-01-01', null, 540);
    const expected = toJulianDay(2000, 1, 1, 3);
    expect(jd).toBeCloseTo(expected, 10);
  });
});
