import { describe, it, expect } from 'vitest';
import { getProgressedJulianDay } from '../../src/engine/calculations/progressions.js';
import { buildJulianDay } from '../../src/utils/date.js';

describe('getProgressedJulianDay', () => {
  it('returns birth JD when progressed date equals birth date', () => {
    const birthJD = buildJulianDay('1990-04-15', '14:30', 540);
    const progressedJD = getProgressedJulianDay('1990-04-15', '14:30', 540, '1990-04-15');
    expect(progressedJD).toBeCloseTo(birthJD, 5);
  });

  it('adds ~1 day per year elapsed (secondary progression)', () => {
    const birthJD = buildJulianDay('1990-04-15', '14:30', 540);
    // 10 years later → ~10 days after birth JD
    const progressedJD = getProgressedJulianDay('1990-04-15', '14:30', 540, '2000-04-15');
    const daysDiff = progressedJD - birthJD;
    expect(daysDiff).toBeCloseTo(10, 0);
  });

  it('handles 36 years → ~36 days', () => {
    const birthJD = buildJulianDay('1990-04-15', '12:00', 0);
    const progressedJD = getProgressedJulianDay('1990-04-15', '12:00', 0, '2026-04-15');
    const daysDiff = progressedJD - birthJD;
    expect(daysDiff).toBeCloseTo(36, 0);
  });

  it('works with null birthTime (noon default)', () => {
    const birthJD = buildJulianDay('1990-04-15', null, 0);
    const progressedJD = getProgressedJulianDay('1990-04-15', null, 0, '2000-04-15');
    const daysDiff = progressedJD - birthJD;
    expect(daysDiff).toBeCloseTo(10, 0);
  });
});
