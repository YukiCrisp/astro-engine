import type { SignName } from '../types.js';

export type ArabicPartId =
  | 'PART_OF_FORTUNE' | 'PART_OF_SPIRIT' | 'PART_OF_EROS' | 'PART_OF_NECESSITY'
  | 'PART_OF_COURAGE' | 'PART_OF_VICTORY' | 'PART_OF_NEMESIS' | 'PART_OF_MARRIAGE';

export interface ArabicPartResult {
  id: ArabicPartId;
  name: string;
  longitude: number;   // 0-360
  sign: SignName;
  signDegree: number;  // degree within sign
}

/** Longitudes a lot can be built from. Planets not in the chart are left out. */
export interface ArabicPartInputs {
  asc: number;
  dsc: number;
  sun: number;
  moon: number;
  mercury?: number;
  venus?: number;
  mars?: number;
  jupiter?: number;
  saturn?: number;
}

const SIGN_NAMES: readonly SignName[] = [
  'ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR',
  'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS',
];

const PART_NAMES: Record<ArabicPartId, string> = {
  PART_OF_FORTUNE: 'Part of Fortune',
  PART_OF_SPIRIT: 'Part of Spirit',
  PART_OF_EROS: 'Part of Eros',
  PART_OF_NECESSITY: 'Part of Necessity',
  PART_OF_COURAGE: 'Part of Courage',
  PART_OF_VICTORY: 'Part of Victory',
  PART_OF_NEMESIS: 'Part of Nemesis',
  PART_OF_MARRIAGE: 'Part of Marriage',
};

function mod360(n: number): number {
  return ((n % 360) + 360) % 360;
}

function toLotResult(id: ArabicPartId, longitude: number): ArabicPartResult {
  const lon = mod360(longitude);
  const signIndex = Math.floor(lon / 30);
  return {
    id,
    name: PART_NAMES[id],
    longitude: lon,
    sign: SIGN_NAMES[signIndex],
    signDegree: lon % 30,
  };
}

/**
 * Day chart when the Sun is above the horizon, i.e. on the MC side of the
 * ASC–DSC axis. Measured from the DSC in zodiac order, the upper half spans
 * [0°, 180°). Uses the angles rather than house numbers so that whole-sign
 * and equal houses give the same sect as quadrant systems.
 */
export function isDayChartByAngles(sunLongitude: number, ascLongitude: number): boolean {
  return mod360(sunLongitude - ascLongitude - 180) < 180;
}

/**
 * A sect-reversing lot: by day the arc from `from` to `to` cast from the ASC
 * (ASC + to - from); by night the same arc taken the other way.
 */
function lot(asc: number, from: number, to: number, isDayChart: boolean): number {
  return isDayChart ? mod360(asc + to - from) : mod360(asc + from - to);
}

/** Part of Fortune: Day = ASC + Moon - Sun; Night = ASC + Sun - Moon. */
export function partOfFortuneLongitude(
  ascLongitude: number,
  sunLongitude: number,
  moonLongitude: number,
  isDayChart: boolean,
): number {
  return lot(ascLongitude, sunLongitude, moonLongitude, isDayChart);
}

/**
 * Calculate Arabic Parts (Lots) from chart data.
 *
 * The seven Hermetic lots follow Paulus Alexandrinus (Introduction, ch. 23).
 * Each is given as its day formula and reverses at night:
 * - Fortune:   ASC + Moon - Sun
 * - Spirit:    ASC + Sun - Moon
 * - Eros:      ASC + Venus - Spirit
 * - Necessity: ASC + Fortune - Mercury
 * - Courage:   ASC + Fortune - Mars
 * - Victory:   ASC + Jupiter - Spirit
 * - Nemesis:   ASC + Fortune - Saturn
 * Marriage (ASC + DSC - Venus) is HOSHIDOU's own and does not reverse.
 *
 * A lot whose planet is missing from `inputs` is skipped; the others are still returned.
 */
export function calculateArabicParts(
  inputs: ArabicPartInputs,
  isDayChart: boolean,
  enabledParts: ArabicPartId[],
): ArabicPartResult[] {
  const { asc, dsc, sun, moon, mercury, venus, mars, jupiter, saturn } = inputs;
  const fortune = lot(asc, sun, moon, isDayChart);
  const spirit = lot(asc, moon, sun, isDayChart);

  const formulas: Record<ArabicPartId, () => number | null> = {
    PART_OF_FORTUNE: () => fortune,
    PART_OF_SPIRIT: () => spirit,
    PART_OF_EROS: () => (venus === undefined ? null : lot(asc, spirit, venus, isDayChart)),
    PART_OF_NECESSITY: () => (mercury === undefined ? null : lot(asc, mercury, fortune, isDayChart)),
    PART_OF_COURAGE: () => (mars === undefined ? null : lot(asc, mars, fortune, isDayChart)),
    PART_OF_VICTORY: () => (jupiter === undefined ? null : lot(asc, spirit, jupiter, isDayChart)),
    PART_OF_NEMESIS: () => (saturn === undefined ? null : lot(asc, saturn, fortune, isDayChart)),
    PART_OF_MARRIAGE: () => (venus === undefined ? null : mod360(asc + dsc - venus)),
  };

  const enabled = new Set(enabledParts);
  const results: ArabicPartResult[] = [];
  for (const id of Object.keys(PART_NAMES) as ArabicPartId[]) {
    if (!enabled.has(id)) continue;
    const lon = formulas[id]();
    if (lon !== null) results.push(toLotResult(id, lon));
  }
  return results;
}
