import type { PlanetId, PlanetPosition, HouseCusp, ChartAngles } from '../types.js';
import { getPlanetHouse } from './houses.js';

const MAJOR_PLANETS: readonly PlanetId[] = [
  'SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS',
  'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
];

export type ChartPatternType = 'BUNDLE' | 'BOWL' | 'BUCKET' | 'SEESAW' | 'LOCOMOTIVE' | 'SPLASH' | 'SPLAY';

export interface ChartPattern {
  type: ChartPatternType;
  handlePlanet?: PlanetId;
  occupiedSigns: number;
  span: number;
}

export type ElementType = 'FIRE' | 'EARTH' | 'AIR' | 'WATER';
export type ModalityType = 'CARDINAL' | 'FIXED' | 'MUTABLE';
export type PolarityType = 'MASCULINE' | 'FEMININE';
export type QuadrantType = 'ANGULAR' | 'SUCCEDENT' | 'CADENT';

export interface ChartDistribution {
  elements: Record<ElementType, PlanetId[]>;
  modalities: Record<ModalityType, PlanetId[]>;
  polarities: Record<PolarityType, PlanetId[]>;
  quadrants: Record<QuadrantType, PlanetId[]>;
}

export interface ChartAnalysis {
  pattern: ChartPattern;
  culminatingPlanet: PlanetId | null;
  risingPlanet: PlanetId | null;
  distribution: ChartDistribution;
}

/** Angular distance between two longitudes (0 to 180). */
function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Calculate span (occupied arc) and largest gap for a set of longitudes. */
function calculateSpanInfo(longitudes: number[]): { span: number; maxGap: number } {
  if (longitudes.length <= 1) return { span: 0, maxGap: 360 };

  const sorted = [...longitudes].sort((a, b) => a - b);
  let maxGap = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[(i + 1) % sorted.length];
    const gap = i === sorted.length - 1
      ? (next + 360 - current)
      : next - current;
    if (gap > maxGap) maxGap = gap;
  }

  return { span: 360 - maxGap, maxGap };
}

function countOccupiedSigns(longitudes: number[]): number {
  const signs = new Set(longitudes.map(lon => Math.floor(lon / 30)));
  return signs.size;
}

function detectBucket(
  majorPlanets: PlanetPosition[],
  longitudes: number[],
  occupiedSigns: number,
): ChartPattern | null {
  const totalSpan = calculateSpanInfo(longitudes).span;

  for (let i = 0; i < majorPlanets.length; i++) {
    const remaining = longitudes.filter((_, j) => j !== i);
    const { span: remainingSpan } = calculateSpanInfo(remaining);

    if (remainingSpan <= 180) {
      const handleLon = longitudes[i];
      const minDist = Math.min(...remaining.map(lon => angularDistance(handleLon, lon)));

      if (minDist >= 60) {
        return {
          type: 'BUCKET',
          handlePlanet: majorPlanets[i].id,
          occupiedSigns,
          span: totalSpan,
        };
      }
    }
  }
  return null;
}

function detectSeesaw(longitudes: number[]): boolean {
  const sorted = [...longitudes].sort((a, b) => a - b);
  let gapCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[(i + 1) % sorted.length];
    const gap = i === sorted.length - 1
      ? (next + 360 - current)
      : next - current;
    if (gap >= 60) gapCount++;
  }

  return gapCount === 2;
}

export function detectChartPattern(planets: PlanetPosition[]): ChartPattern {
  const majorPlanets = planets.filter(p => (MAJOR_PLANETS as readonly string[]).includes(p.id));
  const longitudes = majorPlanets.map(p => p.longitude);
  const occupiedSigns = countOccupiedSigns(longitudes);
  const { span, maxGap } = calculateSpanInfo(longitudes);

  // 1. Bundle: all within 120°
  if (span <= 120) {
    return { type: 'BUNDLE', occupiedSigns, span };
  }

  // 2. Bucket: 9 within 180°, 1 handle 60°+ from nearest
  const bucketResult = detectBucket(majorPlanets, longitudes, occupiedSigns);
  if (bucketResult) return bucketResult;

  // 3. Bowl: all within 180°
  if (span <= 180) {
    return { type: 'BOWL', occupiedSigns, span };
  }

  // 4. Seesaw: 2 groups with exactly 2 gaps >= 60°
  if (detectSeesaw(longitudes)) {
    return { type: 'SEESAW', occupiedSigns, span };
  }

  // 5. Locomotive: gap >= 120° (span <= 240°)
  if (maxGap >= 120) {
    return { type: 'LOCOMOTIVE', occupiedSigns, span };
  }

  // 6. Splash: 7+ occupied signs
  if (occupiedSigns >= 7) {
    return { type: 'SPLASH', occupiedSigns, span };
  }

  // 7. Splay: fallback
  return { type: 'SPLAY', occupiedSigns, span };
}

export function findCulminatingPlanet(
  planets: PlanetPosition[],
  angles: ChartAngles,
): PlanetId | null {
  const mc = angles.mc;
  let closest: { id: PlanetId; dist: number } | null = null;

  for (const planet of planets) {
    if (!(MAJOR_PLANETS as readonly string[]).includes(planet.id)) continue;
    const dist = angularDistance(planet.longitude, mc);
    if (dist <= 10 && (!closest || dist < closest.dist)) {
      closest = { id: planet.id, dist };
    }
  }

  return closest?.id ?? null;
}

export function findRisingPlanet(
  planets: PlanetPosition[],
  houses: HouseCusp[],
  angles: ChartAngles,
): PlanetId | null {
  const asc = angles.asc;
  let closest: { id: PlanetId; dist: number } | null = null;

  for (const planet of planets) {
    if (!(MAJOR_PLANETS as readonly string[]).includes(planet.id)) continue;
    const house = getPlanetHouse(planet.longitude, houses);
    if (house !== 1) continue;

    const dist = angularDistance(planet.longitude, asc);
    if (!closest || dist < closest.dist) {
      closest = { id: planet.id, dist };
    }
  }

  return closest?.id ?? null;
}

const SIGN_ELEMENTS: readonly ElementType[] = [
  'FIRE', 'EARTH', 'AIR', 'WATER',
  'FIRE', 'EARTH', 'AIR', 'WATER',
  'FIRE', 'EARTH', 'AIR', 'WATER',
];

const SIGN_MODALITIES: readonly ModalityType[] = [
  'CARDINAL', 'FIXED', 'MUTABLE',
  'CARDINAL', 'FIXED', 'MUTABLE',
  'CARDINAL', 'FIXED', 'MUTABLE',
  'CARDINAL', 'FIXED', 'MUTABLE',
];

const SIGN_POLARITIES: readonly PolarityType[] = [
  'MASCULINE', 'FEMININE', 'MASCULINE', 'FEMININE',
  'MASCULINE', 'FEMININE', 'MASCULINE', 'FEMININE',
  'MASCULINE', 'FEMININE', 'MASCULINE', 'FEMININE',
];

const HOUSE_QUADRANTS: readonly QuadrantType[] = [
  'ANGULAR', 'SUCCEDENT', 'CADENT',
  'ANGULAR', 'SUCCEDENT', 'CADENT',
  'ANGULAR', 'SUCCEDENT', 'CADENT',
  'ANGULAR', 'SUCCEDENT', 'CADENT',
];

export function calculateDistribution(
  planets: PlanetPosition[],
  houses: HouseCusp[] | null,
): ChartDistribution {
  const elements: Record<ElementType, PlanetId[]> = { FIRE: [], EARTH: [], AIR: [], WATER: [] };
  const modalities: Record<ModalityType, PlanetId[]> = { CARDINAL: [], FIXED: [], MUTABLE: [] };
  const polarities: Record<PolarityType, PlanetId[]> = { MASCULINE: [], FEMININE: [] };
  const quadrants: Record<QuadrantType, PlanetId[]> = { ANGULAR: [], SUCCEDENT: [], CADENT: [] };

  for (const planet of planets) {
    if (!(MAJOR_PLANETS as readonly string[]).includes(planet.id)) continue;

    const signIndex = planet.sign;
    elements[SIGN_ELEMENTS[signIndex]].push(planet.id);
    modalities[SIGN_MODALITIES[signIndex]].push(planet.id);
    polarities[SIGN_POLARITIES[signIndex]].push(planet.id);

    if (houses) {
      const house = getPlanetHouse(planet.longitude, houses);
      quadrants[HOUSE_QUADRANTS[house - 1]].push(planet.id);
    }
  }

  return { elements, modalities, polarities, quadrants };
}

export function analyzeChart(
  planets: PlanetPosition[],
  houses: HouseCusp[] | null,
  angles: ChartAngles | null,
): ChartAnalysis {
  return {
    pattern: detectChartPattern(planets),
    culminatingPlanet: angles ? findCulminatingPlanet(planets, angles) : null,
    risingPlanet: houses && angles ? findRisingPlanet(planets, houses, angles) : null,
    distribution: calculateDistribution(planets, houses),
  };
}
