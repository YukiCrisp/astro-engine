import { describe, it, expect } from 'vitest';
import { calculateArabicParts } from '../../src/engine/calculations/arabic-parts.js';
import type { ArabicPartId } from '../../src/engine/calculations/arabic-parts.js';

/**
 * The seven Hermetic lots after Paulus Alexandrinus, each reversing at night,
 * plus HOSHIDOU's Part of Marriage (ASC + DSC - Venus), which does not reverse.
 * Expected values are worked by hand from the inputs below.
 */

const inputs = {
  asc: 10, dsc: 190, sun: 100, moon: 40,
  mercury: 80, venus: 130, mars: 200, jupiter: 250, saturn: 300,
};

const ALL: ArabicPartId[] = [
  'PART_OF_FORTUNE', 'PART_OF_SPIRIT', 'PART_OF_EROS', 'PART_OF_NECESSITY',
  'PART_OF_COURAGE', 'PART_OF_VICTORY', 'PART_OF_NEMESIS', 'PART_OF_MARRIAGE',
];

function byId(isDayChart: boolean): Record<string, number> {
  return Object.fromEntries(
    calculateArabicParts(inputs, isDayChart, ALL).map(p => [p.id, p.longitude]),
  );
}

describe('calculateArabicParts', () => {
  it('uses the day formulas for a day chart', () => {
    const lon = byId(true);
    expect(lon.PART_OF_FORTUNE).toBeCloseTo(310);   // ASC + Moon - Sun
    expect(lon.PART_OF_SPIRIT).toBeCloseTo(70);     // ASC + Sun - Moon
    expect(lon.PART_OF_EROS).toBeCloseTo(70);       // ASC + Venus - Spirit
    expect(lon.PART_OF_NECESSITY).toBeCloseTo(240); // ASC + Fortune - Mercury
    expect(lon.PART_OF_COURAGE).toBeCloseTo(120);   // ASC + Fortune - Mars
    expect(lon.PART_OF_VICTORY).toBeCloseTo(190);   // ASC + Jupiter - Spirit
    expect(lon.PART_OF_NEMESIS).toBeCloseTo(20);    // ASC + Fortune - Saturn
    expect(lon.PART_OF_MARRIAGE).toBeCloseTo(70);   // ASC + DSC - Venus
  });

  it('reverses every Hermetic lot for a night chart', () => {
    const lon = byId(false);
    expect(lon.PART_OF_FORTUNE).toBeCloseTo(70);    // ASC + Sun - Moon
    expect(lon.PART_OF_SPIRIT).toBeCloseTo(310);    // ASC + Moon - Sun
    expect(lon.PART_OF_EROS).toBeCloseTo(190);      // ASC + Spirit - Venus
    expect(lon.PART_OF_NECESSITY).toBeCloseTo(20);  // ASC + Mercury - Fortune
    expect(lon.PART_OF_COURAGE).toBeCloseTo(140);   // ASC + Mars - Fortune
    expect(lon.PART_OF_VICTORY).toBeCloseTo(70);    // ASC + Spirit - Jupiter
    expect(lon.PART_OF_NEMESIS).toBeCloseTo(240);   // ASC + Saturn - Fortune
    expect(lon.PART_OF_MARRIAGE).toBeCloseTo(70);   // does not reverse
  });

  it('returns only the enabled parts, in a fixed order, with sign and name', () => {
    const parts = calculateArabicParts(inputs, true, ['PART_OF_NEMESIS', 'PART_OF_FORTUNE']);
    expect(parts.map(p => p.id)).toEqual(['PART_OF_FORTUNE', 'PART_OF_NEMESIS']);
    expect(parts[1]).toMatchObject({ name: 'Part of Nemesis', sign: 'ARI', signDegree: 20 });
  });

  it('skips a lot whose planet is missing and keeps the rest', () => {
    const { saturn: _saturn, ...withoutSaturn } = inputs;
    const parts = calculateArabicParts(withoutSaturn, true, ['PART_OF_FORTUNE', 'PART_OF_NEMESIS']);
    expect(parts.map(p => p.id)).toEqual(['PART_OF_FORTUNE']);
  });
});
