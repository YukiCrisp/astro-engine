import type { PlanetPosition, PlanetId, Aspect, AspectType, HouseCusp } from '../types.js';
import type { ElementType, ModalityType } from './chart-analysis.js';
import { getPlanetHouse } from './houses.js';

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
 *   - GRAND_TRINE  → ENGA-243 (landed)
 *   - GRAND_CROSS  → ENGA-244
 *   - T_SQUARE     → ENGA-245
 *   - STELLIUM     → ENGA-246
 *   - YOD          → ENGA-247
 *   - KITE         → ENGA-248
 *
 * `detectAspectPatterns` runs every registered detector; figure types whose
 * detector has not landed yet simply do not appear. Parent plan: ENGA-230.
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
  /** Zodiac sign index (0–11) shared by a same-sign stellium. */
  sign?: number;
  /** House number (1–12) shared by a same-house stellium. */
  house?: number;
  /** Heightened emphasis (e.g. a stellium at/above the strong threshold). */
  strong?: boolean;
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
  private readonly houseOf = new Map<PlanetId, number>();

  constructor(
    public readonly planets: PlanetPosition[],
    public readonly aspects: Aspect[],
    /**
     * Optional planet→house (1–12) assignment. Absent when the chart has no
     * house cusps (e.g. unknown birth time); house-based detectors then skip
     * house grouping. Built by `detectAspectPatterns` from the chart's cusps.
     */
    houses?: ReadonlyMap<PlanetId, number>,
  ) {
    for (const p of planets) this.positions.set(p.id, p);
    for (const aspect of aspects) {
      this.edges.set(pairKey(aspect.planetA, aspect.planetB), aspect);
      this.pushAdjacency(aspect.planetA, aspect);
      this.pushAdjacency(aspect.planetB, aspect);
    }
    if (houses) for (const [id, h] of houses) this.houseOf.set(id, h);
  }

  /** House (1–12) a planet occupies, or `undefined` when no house data exists. */
  house(id: PlanetId): number | undefined {
    return this.houseOf.get(id);
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

/** Add a planet to a grouping map keyed by sign/house index. */
function pushGroup(groups: Map<number, PlanetPosition[]>, key: number, planet: PlanetPosition): void {
  const list = groups.get(key);
  if (list) list.push(planet);
  else groups.set(key, [planet]);
}

/** Whether two planet groups contain exactly the same members. */
function sameMembers(a: PlanetPosition[], b: PlanetPosition[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((p) => p.id));
  return b.every((p) => ids.has(p.id));
}

/** Conjunction aspects detected between members of a group, if any. */
function memberConjunctions(graph: AspectGraph, members: PlanetPosition[]): Aspect[] {
  const out: Aspect[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const edge = graph.between(members[i].id, members[j].id);
      if (edge?.type === 'CONJUNCTION') out.push(edge);
    }
  }
  return out;
}

/**
 * Build a STELLIUM pattern from a member group, tagging the shared sign (with
 * its element/modality) and/or house. `strong` flags clusters at/above the
 * configured strong threshold (default 4) for heightened display emphasis.
 */
function makeStellium(
  graph: AspectGraph,
  config: AspectPatternConfig,
  members: PlanetPosition[],
  sign: number | undefined,
  house: number | undefined,
): AspectPattern {
  const ordered = [...members].sort((a, b) => a.longitude - b.longitude);
  const pattern: AspectPattern = {
    type: 'STELLIUM',
    planets: ordered.map((p) => p.id),
    orbAvg: averageOrb(memberConjunctions(graph, ordered)),
    strong: ordered.length >= config.stelliumStrongThreshold,
  };
  if (sign !== undefined) {
    pattern.sign = sign;
    pattern.element = signElement(sign);
    pattern.modality = signModality(sign);
  }
  if (house !== undefined) pattern.house = house;
  return pattern;
}

/**
 * STELLIUM detector (ENGA-246). A stellium is a cluster of `stelliumThreshold`+
 * planets sharing one zodiac sign or one house. Planets are grouped by sign and
 * by house; groups meeting the threshold become patterns. When the same planet
 * set forms both a same-sign and a same-house cluster, the two are merged into a
 * single pattern carrying both `sign` and `house` rather than emitting a visible
 * duplicate. House grouping is skipped when the chart has no house data.
 */
function detectStelliums(graph: AspectGraph, config: AspectPatternConfig): AspectPattern[] {
  const threshold = config.stelliumThreshold;
  const bySign = new Map<number, PlanetPosition[]>();
  const byHouse = new Map<number, PlanetPosition[]>();
  for (const planet of graph.planets) {
    pushGroup(bySign, planet.sign, planet);
    const house = graph.house(planet.id);
    if (house !== undefined) pushGroup(byHouse, house, planet);
  }

  const signGroups = [...bySign.entries()]
    .filter(([, members]) => members.length >= threshold)
    .sort(([a], [b]) => a - b);
  const houseGroups = [...byHouse.entries()]
    .filter(([, members]) => members.length >= threshold)
    .sort(([a], [b]) => a - b);

  const patterns: AspectPattern[] = [];
  const mergedHouses = new Set<number>();
  for (const [sign, members] of signGroups) {
    let house: number | undefined;
    for (const [h, hMembers] of houseGroups) {
      if (!mergedHouses.has(h) && sameMembers(members, hMembers)) {
        house = h;
        mergedHouses.add(h);
        break;
      }
    }
    patterns.push(makeStellium(graph, config, members, sign, house));
  }
  for (const [house, members] of houseGroups) {
    if (mergedHouses.has(house)) continue;
    patterns.push(makeStellium(graph, config, members, undefined, house));
  }
  return patterns;
}

/**
 * T-square (ENGA-245): two planets in opposition whose midpoint of tension
 * resolves onto a third planet — the **apex** — that squares both ends. The
 * apex is the figure's focal release point, so it is reported as `apex`.
 *
 * A given opposition can host more than one apex (each squared planet yields a
 * distinct T-square), and the same chart can contain several oppositions, so
 * every (opposition, apex) combination is emitted as its own pattern.
 *
 * Modality: in a clean T-square all three planets share one modality (opposite
 * signs always share modality, and a square from either end lands a third of
 * the zodiac away — same modality again). With real orbs the apex can drift
 * into a neighbouring sign, so the label follows the apex's sign, the planet
 * that defines the figure's expression. A grand cross contains two embedded
 * T-squares; suppressing those belongs to the higher-level aggregator, not
 * here — this detector reports what it geometrically finds.
 */
export function detectTSquares(graph: AspectGraph): AspectPattern[] {
  const patterns: AspectPattern[] = [];
  for (const opposition of graph.aspects) {
    if (opposition.type !== 'OPPOSITION') continue;
    const { planetA: endA, planetB: endB } = opposition;
    const squaresA = new Set(graph.neighbors(endA, 'SQUARE'));
    for (const apex of graph.neighbors(endB, 'SQUARE')) {
      if (apex === endA || apex === endB || !squaresA.has(apex)) continue;
      const squareToA = graph.between(endA, apex);
      const squareToB = graph.between(endB, apex);
      if (!squareToA || !squareToB) continue;
      const [first, second] = endA < endB ? [endA, endB] : [endB, endA];
      const apexPos = graph.position(apex);
      patterns.push({
        type: 'T_SQUARE',
        planets: [first, second, apex],
        apex,
        modality: apexPos ? signModality(apexPos.sign) : undefined,
        orbAvg: averageOrb([opposition, squareToA, squareToB]),
      });
    }
  }
  return patterns;
}

/**
 * Yod ("Finger of God"): two planets in a SEXTILE (60°) base, both forming a
 * QUINCUNX (150°) leg to a common third planet — the apex. (ENGA-247)
 *
 * The sextile base keeps the standard sextile orb already applied by
 * `detectAspects`; only the two quincunx legs are re-tightened to the dedicated
 * `yodQuincunxOrb`, so a luminary-widened or otherwise loose quincunx in the
 * graph won't admit a sloppy Yod. We read quincunx candidates from the graph
 * (so detection inherits `detectAspects`' classification) and enforce the
 * dedicated orb as an additional, tighter constraint.
 */
export const detectYods: AspectPatternDetector = (graph, config) => {
  const results: AspectPattern[] = [];
  const seen = new Set<string>();

  for (const sextile of graph.aspects) {
    if (sextile.type !== 'SEXTILE') continue;
    const { planetA: a, planetB: b } = sextile;

    // Apex candidates: planets quincunx to BOTH ends of the sextile base.
    const apexes = graph
      .neighbors(a, 'QUINCUNX')
      .filter((c) => graph.hasAspect(b, c, 'QUINCUNX'));

    for (const apex of apexes) {
      const legA = graph.between(a, apex);
      const legB = graph.between(b, apex);
      if (!legA || !legB) continue;
      // Re-tighten both legs to the dedicated quincunx orb.
      if (legA.orb > config.yodQuincunxOrb || legB.orb > config.yodQuincunxOrb) continue;

      const base = [a, b].sort();
      const key = [...base, apex].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        type: 'YOD',
        planets: [base[0], base[1], apex],
        apex,
        orbAvg: averageOrb([sextile, legA, legB]),
      });
    }
  }

  return results;
};

/** Shared modality of a planet set, or `undefined` if the signs disagree. */
function sharedModality(graph: AspectGraph, ids: PlanetId[]): ModalityType | undefined {
  let modality: ModalityType | undefined;
  for (const id of ids) {
    const pos = graph.position(id);
    if (!pos) return undefined;
    const m = signModality(pos.sign);
    if (modality === undefined) modality = m;
    else if (modality !== m) return undefined;
  }
  return modality;
}

/**
 * Grand Cross (ENGA-244): four planets forming two crossing oppositions joined
 * by four squares — a T-square extended into a full cross. We pair every two
 * vertex-disjoint oppositions and keep the pair only when all four connecting
 * legs are squares. Modality is set when the four planets share one (an exact
 * cross is single-modality; orb spread across a sign boundary leaves it unset).
 */
const grandCrossDetector: AspectPatternDetector = (graph) => {
  const oppositions = graph.aspects.filter((a) => a.type === 'OPPOSITION');
  const patterns: AspectPattern[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < oppositions.length; i++) {
    for (let j = i + 1; j < oppositions.length; j++) {
      const op1 = oppositions[i];
      const op2 = oppositions[j];
      const set = new Set([op1.planetA, op1.planetB, op2.planetA, op2.planetB]);
      if (set.size !== 4) continue; // oppositions must be vertex-disjoint

      // The four legs joining the two oppositions must all be squares.
      const legs = [
        graph.between(op1.planetA, op2.planetA),
        graph.between(op1.planetA, op2.planetB),
        graph.between(op1.planetB, op2.planetA),
        graph.between(op1.planetB, op2.planetB),
      ];
      if (!legs.every((leg) => leg?.type === 'SQUARE')) continue;

      const planets = [...set].sort();
      const key = planets.join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      const constituents = [op1, op2, ...(legs as Aspect[])];
      patterns.push({
        type: 'GRAND_CROSS',
        planets,
        modality: sharedModality(graph, planets),
        orbAvg: averageOrb(constituents),
      });
    }
  }
  return patterns;
};

/**
 * Grand Trine (ENGA-243): three planets mutually linked by 120° trines — a
 * 3-clique in the chart's TRINE subgraph. Every closed trine triangle is one
 * grand trine. When all three planets sit in signs of the same element the
 * figure is labelled with that element; a dissociate grand trine that spans
 * more than one element is reported with `element` left undefined.
 *
 * The triangle scan walks planet index triples `i < j < k`, so each clique is
 * emitted exactly once and the figure's `planets` follow chart order.
 */
export function detectGrandTrine(
  graph: AspectGraph,
  _config?: AspectPatternConfig,
): AspectPattern[] {
  const planets = graph.planets;
  const patterns: AspectPattern[] = [];
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const ab = graph.between(planets[i].id, planets[j].id);
      if (ab?.type !== 'TRINE') continue;
      for (let k = j + 1; k < planets.length; k++) {
        const ac = graph.between(planets[i].id, planets[k].id);
        if (ac?.type !== 'TRINE') continue;
        const bc = graph.between(planets[j].id, planets[k].id);
        if (bc?.type !== 'TRINE') continue;
        const trio = [planets[i], planets[j], planets[k]];
        const element = signElement(trio[0].sign);
        const shared = trio.every((p) => signElement(p.sign) === element);
        patterns.push({
          type: 'GRAND_TRINE',
          planets: trio.map((p) => p.id),
          element: shared ? element : undefined,
          orbAvg: averageOrb([ab, ac, bc]),
        });
      }
    }
  }
  return patterns;
}

/**
 * Detector registry. Each concrete detector (see module doc) appends itself
 * here in its own follow-up issue.
 */
const DETECTORS: AspectPatternDetector[] = [detectGrandTrine, detectTSquares, detectYods, detectStelliums, grandCrossDetector];

/**
 * Detect every special aspect pattern in a single chart. Builds the aspect
 * graph from the planet set + pairwise aspect list (plus per-planet house
 * assignments derived from `houses`, when available), then runs each registered
 * detector.
 */
export function detectAspectPatterns(
  planets: PlanetPosition[],
  aspects: Aspect[],
  config: Partial<AspectPatternConfig> = {},
  houses: HouseCusp[] | null = null,
): AspectPattern[] {
  const merged: AspectPatternConfig = { ...DEFAULT_PATTERN_CONFIG, ...config };
  let houseMap: Map<PlanetId, number> | undefined;
  if (houses && houses.length === 12) {
    houseMap = new Map<PlanetId, number>();
    for (const p of planets) houseMap.set(p.id, getPlanetHouse(p.longitude, houses));
  }
  const graph = new AspectGraph(planets, aspects, houseMap);
  return DETECTORS.flatMap((detect) => detect(graph, merged));
}
