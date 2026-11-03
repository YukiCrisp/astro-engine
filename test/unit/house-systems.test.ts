import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import { calculateNatal } from '../../src/engine/index.js';
import { HouseSystemEnum, NatalChartDataSchema } from '../../src/schemas/responses.js';
import { NatalRequestSchema } from '../../src/schemas/natal.js';

beforeAll(() => {
  initSweph('./ephe');
});

const birth = { birthDate: '1990-01-15', birthTime: '12:00', utcOffsetMinutes: 540, lat: 35.68, lon: 139.69 } as const;
const normalize360 = (longitude: number): number => ((longitude % 360) + 360) % 360;
const cusps = (houseSystem: (typeof HouseSystemEnum.options)[number]) =>
  calculateNatal({ ...birth, houseSystem });

describe('house systems', () => {
  it('accepts all 13 systems in the request and response schemas', () => {
    expect(HouseSystemEnum.options).toHaveLength(13);
    for (const houseSystem of HouseSystemEnum.options) {
      expect(NatalRequestSchema.parse({ ...birth, houseSystem }).houseSystem).toBe(houseSystem);
      const chart = cusps(houseSystem);
      expect(NatalChartDataSchema.parse(chart).meta.houseSystem).toBe(houseSystem);
      expect(chart.houses).toHaveLength(12);
    }
  });

  it('gives every system its own cusps', () => {
    const seen = new Set(HouseSystemEnum.options.map((hs) => cusps(hs).houses!.map((h) => h.longitude.toFixed(6)).join()));
    expect(seen.size).toBe(13);
  });

  it('puts the ASC on cusp 1 for Topocentric and Alcabitius', () => {
    for (const hs of ['TOPOCENTRIC', 'ALCABITIUS'] as const) {
      const chart = cusps(hs);
      expect(chart.houses![0].longitude).toBeCloseTo(chart.angles!.asc, 6);
      expect(chart.houses![9].longitude).toBeCloseTo(chart.angles!.mc, 6);
    }
  });

  it('counts Equal (MC) from the MC and Vehlow from 15 degrees before the ASC', () => {
    const equalMc = cusps('EQUAL_MC');
    equalMc.houses!.forEach((h, i) => expect(h.longitude).toBeCloseTo(normalize360(equalMc.angles!.mc + (i - 9) * 30), 6));
    const vehlow = cusps('VEHLOW');
    vehlow.houses!.forEach((h, i) => expect(h.longitude).toBeCloseTo(normalize360(vehlow.angles!.asc - 15 + i * 30), 6));
  });

  it('keeps Meridian and Morinus independent of latitude', () => {
    for (const hs of ['MERIDIAN', 'MORINUS'] as const) {
      const tokyo = cusps(hs).houses!.map((h) => h.longitude);
      const north = calculateNatal({ ...birth, lat: 60, houseSystem: hs }).houses!.map((h) => h.longitude);
      north.forEach((lon, i) => expect(lon).toBeCloseTo(tokyo[i], 6));
    }
    const meridian = cusps('MERIDIAN');
    expect(meridian.houses![9].longitude).toBeCloseTo(meridian.angles!.mc, 6);
  });
});
