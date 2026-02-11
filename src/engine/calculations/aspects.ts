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

const LUMINARY_BONUS = 2;
const LUMINARIES: Set<PlanetId> = new Set(['SUN', 'MOON']);

function angularDistance(lonA: number, lonB: number): number {
  const diff = Math.abs(lonA - lonB) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function getOrb(type: AspectType, a: PlanetId, b: PlanetId): number {
  const base = ORB_TABLE[type];
  return (LUMINARIES.has(a) || LUMINARIES.has(b)) ? base + LUMINARY_BONUS : base;
}

export function detectAspects(
  planets: PlanetPosition[],
  orbMultiplier: number = 1
): Aspect[] {
  const aspects: Aspect[] = [];
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i];
      const b = planets[j];
      const dist = angularDistance(a.longitude, b.longitude);
      for (const [type, angle] of ASPECT_ANGLES) {
        const maxOrb = getOrb(type, a.id, b.id) * orbMultiplier;
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
  planetsB: PlanetPosition[]
): Aspect[] {
  const aspects: Aspect[] = [];
  for (const a of planetsA) {
    for (const b of planetsB) {
      if (a.id === b.id) continue;
      const dist = angularDistance(a.longitude, b.longitude);
      for (const [type, angle] of ASPECT_ANGLES) {
        const maxOrb = getOrb(type, a.id, b.id) * 0.5;
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
