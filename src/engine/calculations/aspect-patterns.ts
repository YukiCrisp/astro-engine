import type { PlanetPosition, PlanetId, Aspect, AspectType } from '../types.js';
import type { ElementType, ModalityType } from './chart-analysis.js';

/**
 * Special aspect patterns (multi-planet geometric figures) detected from a
 * single chart's planet set + its pairwise aspect list.
 *
 * This module is the shared **foundation** (ENGA-242): it provides the graph
 * representation over `detectAspects` output plus the helpers and detector
 * registry that the individual pattern detectors build on. Each concrete
 * detector lives in its own follow-up issue and registers itself in
 * `DETECTORS` below:
 *
 *   - GRAND_TRINE  → ENGA-243
 *   - GRAND_CROSS  → ENGA-244
 *   - T_SQUARE     → ENGA-245
 *   - STELLIUM     → ENGA-246
 *   - YOD          → ENGA-247
 *   - KITE         → ENGA-248
 *
 * The foundation ships with an empty registry, so `detectAspectPatterns`
 * returns `[]` until detectors land. Parent plan: ENGA-230.
 */

export type AspectPatternType =
  | 'STELLIUM'
  | 'GRAND_TRINE'
  | 'T_SQUARE'
  | 'GRAND_CROSS'
  | 'YOD'
  | 'KITE';

export interface AspectPattern {
  /** Pattern kind. */
  type: AspectPatternType;
  /** Planets that make up the figure. */
  planets: PlanetId[];
  /** Focal planet for asymmetric figures (T-square / Yod apex). */
  apex?: PlanetId;
  /** Shared element (Grand Trine). */
  element?: ElementType;
  /** Shared modality (T-square / Grand Cross). */
  modality?: ModalityType;
  /** Average orb across the figure's constituent aspects, in degrees. */
  orbAvg: number;
}

/**
 * Tunable thresholds shared by detectors. Orbs of ordinary constituent aspects
 * follow `detectAspects`; only the Yod quincunx gets a dedicated (tighter) orb,
 * and the stellium count threshold is configurable (default 3, "strong" at 4).
 */
export interface AspectPatternConfig {
  /** Minimum planets in the same sign/house to count as a stellium. */
  stelliumThreshold: number;
  /** Count at/above which a stellium is flagged as especially strong. */
  stelliumStrongThreshold: number;
  /** Dedicated orb (deg) for the Yod's 150° quincunx legs. */
  yodQuincunxOrb: number;
}

export const DEFAULT_PATTERN_CONFIG: AspectPatternConfig = {
  stelliumThreshold: 3,
  stelliumStrongThreshold: 4,
  yodQuincunxOrb: 3,
};

const ELEMENTS = ['FIRE', 'EARTH', 'AIR', 'WATER'] as const;
const MODALITIES = ['CARDINAL', 'FIXED', 'MUTABLE'] as const;

/** Element of a zodiac sign by 0-based index (ARI=0 … PIS=11). */
export function signElement(sign: number): ElementType {
  return ELEMENTS[((sign % 4) + 4) % 4];
}

/** Modality of a zodiac sign by 0-based index (ARI=0 … PIS=11). */
export function signModality(sign: number): ModalityType {
  return MODALITIES[((sign % 3) + 3) % 3];
}

/** Average orb of a set of constituent aspects (0 for an empty set). */
export function averageOrb(aspects: Aspect[]): number {
  if (aspects.length === 0) return 0;
  return aspects.reduce((sum, a) => sum + a.orb, 0) / aspects.length;
}

/** Order-independent key for an unordered planet pair. */
function pairKey(a: PlanetId, b: PlanetId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Undirected graph over a chart's planets where every detected aspect is an
 * edge. Detectors use it to ask "is there a TRINE between X and Y?" or "which
 * planets does X form a SEXTILE with?" without re-scanning the aspect array.
 */
export class AspectGraph {
  private readonly positions = new Map<PlanetId, PlanetPosition>();
  private readonly edges = new Map<string, Aspect>();
  private readonly adjacency = new Map<PlanetId, Aspect[]>();

  constructor(
    public readonly planets: PlanetPosition[],
    public readonly aspects: Aspect[],
  ) {
    for (const p of planets) this.positions.set(p.id, p);
    for (const aspect of aspects) {
      this.edges.set(pairKey(aspect.planetA, aspect.planetB), aspect);
      this.pushAdjacency(aspect.planetA, aspect);
      this.pushAdjacency(aspect.planetB, aspect);
    }
  }

  private pushAdjacency(id: PlanetId, aspect: Aspect): void {
    const list = this.adjacency.get(id);
    if (list) list.push(aspect);
    else this.adjacency.set(id, [aspect]);
  }

  /** Full position record for a planet, if present in the chart. */
  position(id: PlanetId): PlanetPosition | undefined {
    return this.positions.get(id);
  }

  /** The aspect connecting two planets, regardless of argument order. */
  between(a: PlanetId, b: PlanetId): Aspect | undefined {
    return this.edges.get(pairKey(a, b));
  }

  /** Whether two planets are connected by (optionally a specific) aspect. */
  hasAspect(a: PlanetId, b: PlanetId, type?: AspectType): boolean {
    const edge = this.between(a, b);
    if (!edge) return false;
    return type === undefined || edge.type === type;
  }

  /** Planets aspecting `id`, optionally filtered to a single aspect type. */
  neighbors(id: PlanetId, type?: AspectType): PlanetId[] {
    const list = this.adjacency.get(id);
    if (!list) return [];
    const result: PlanetId[] = [];
    for (const aspect of list) {
      if (type !== undefined && aspect.type !== type) continue;
      result.push(aspect.planetA === id ? aspect.planetB : aspect.planetA);
    }
    return result;
  }
}

/**
 * A pattern detector reads the aspect graph and returns every instance of one
 * pattern type it finds. Detectors must be pure and side-effect free.
 */
export type AspectPatternDetector = (
  graph: AspectGraph,
  config: AspectPatternConfig,
) => AspectPattern[];

/**
 * Detector registry. Each concrete detector (see module doc) appends itself
 * here in its own follow-up issue. Empty in the foundation.
 */
const DETECTORS: AspectPatternDetector[] = [];

/**
 * Detect every special aspect pattern in a single chart. Builds the aspect
 * graph from the planet set + pairwise aspect list, then runs each registered
 * detector. Returns `[]` while the registry is empty (foundation state).
 */
export function detectAspectPatterns(
  planets: PlanetPosition[],
  aspects: Aspect[],
  config: Partial<AspectPatternConfig> = {},
): AspectPattern[] {
  const merged: AspectPatternConfig = { ...DEFAULT_PATTERN_CONFIG, ...config };
  const graph = new AspectGraph(planets, aspects);
  return DETECTORS.flatMap((detect) => detect(graph, merged));
}
