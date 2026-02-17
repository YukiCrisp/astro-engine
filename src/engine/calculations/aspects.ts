import type { PlanetPosition, Aspect, AspectType, PlanetId } from '../types.js';

export const ORB_TABLE: Record<AspectType, number> = {
  CONJUNCTION: 8, OPPOSITION: 8, TRINE: 7, SQUARE: 7,
  SEXTILE: 5, QUINCUNX: 3, SEMISEXTILE: 2, SEMISQUARE: 2,
  SESQUIQUADRATE: 2, QUINTILE: 1.5,
};

const ASPECT_ANGLES: [AspectType, number][] = [
  ['CONJUNCTION', 0], ['OPPOSITION', 180], ['TRINE', 120], ['SQUARE', 90],
  ['SEXTILE', 60], ['QUINCUNX', 150], ['SEMISEXTILE', 30], ['SEMISQUARE', 45],
  ['SESQUIQUADRATE', 135], ['QUINTILE', 72],
];

const DEFAULT_LUMINARY_BONUS = 2;

function angularDistance(lonA: number, lonB: number): number {
  const diff = Math.abs(lonA - lonB) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export interface AspectConfig {
  enabledAspects?: AspectType[];
  orbOverrides?: Partial<Record<AspectType, number>>;
  sunOrbBonus?: number;
  moonOrbBonus?: number;
}

function getOrb(
  type: AspectType,
  a: PlanetId,
  b: PlanetId,
  orbOverrides?: Partial<Record<AspectType, number>>,
  sunBonus: number = DEFAULT_LUMINARY_BONUS,
  moonBonus: number = DEFAULT_LUMINARY_BONUS,
): number {
  const base = orbOverrides?.[type] ?? ORB_TABLE[type];
  const hasSun = a === 'SUN' || b === 'SUN';
  const hasMoon = a === 'MOON' || b === 'MOON';
  if (hasSun) return base + sunBonus;
  if (hasMoon) return base + moonBonus;
  return base;
}

export function detectAspects(
  planets: PlanetPosition[],
  orbMultiplier: number = 1,
  config?: AspectConfig,
): Aspect[] {
  const angles = config?.enabledAspects
    ? ASPECT_ANGLES.filter(([type]) => config.enabledAspects!.includes(type))
    : ASPECT_ANGLES;
  const aspects: Aspect[] = [];
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i];
      const b = planets[j];
      const dist = angularDistance(a.longitude, b.longitude);
      for (const [type, angle] of angles) {
        const maxOrb = getOrb(type, a.id, b.id, config?.orbOverrides, config?.sunOrbBonus, config?.moonOrbBonus) * orbMultiplier;
        const orb = Math.abs(dist - angle);
        if (orb <= maxOrb) {
          const applying = a.speed > b.speed;
          aspects.push({ planetA: a.id, planetB: b.id, type, angle, orb, applying });
          break;
        }
      }
    }
  }
  return aspects;
}

export function detectCrossAspects(
  planetsA: PlanetPosition[],
  planetsB: PlanetPosition[],
  config?: AspectConfig,
): Aspect[] {
  const angles = config?.enabledAspects
    ? ASPECT_ANGLES.filter(([type]) => config.enabledAspects!.includes(type))
    : ASPECT_ANGLES;
  const aspects: Aspect[] = [];
  for (const a of planetsA) {
    for (const b of planetsB) {
      if (a.id === b.id) continue;
      const dist = angularDistance(a.longitude, b.longitude);
      for (const [type, angle] of angles) {
        const maxOrb = getOrb(type, a.id, b.id, config?.orbOverrides, config?.sunOrbBonus, config?.moonOrbBonus) * 0.5;
        const orb = Math.abs(dist - angle);
        if (orb <= maxOrb) {
          aspects.push({ planetA: a.id, planetB: b.id, type, angle, orb, applying: false });
          break;
        }
      }
    }
  }
  return aspects;
}
