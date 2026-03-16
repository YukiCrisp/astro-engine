import type { SignName } from '../types.js';

export type ArabicPartId = 'PART_OF_FORTUNE' | 'PART_OF_SPIRIT' | 'PART_OF_EROS' | 'PART_OF_MARRIAGE';

export interface ArabicPartResult {
  id: ArabicPartId;
  name: string;
  longitude: number;   // 0-360
  sign: SignName;
  signDegree: number;  // degree within sign
}

const SIGN_NAMES: readonly SignName[] = [
  'ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR',
  'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS',
];

function mod360(n: number): number {
  return ((n % 360) + 360) % 360;
}

function toLotResult(id: ArabicPartId, name: string, longitude: number): ArabicPartResult {
  const lon = mod360(longitude);
  const signIndex = Math.floor(lon / 30);
  return {
    id,
    name,
    longitude: lon,
    sign: SIGN_NAMES[signIndex],
    signDegree: lon % 30,
  };
}

/**
 * Calculate Arabic Parts (Lots) from chart data.
 *
 * Formulas (all mod 360):
 * - Part of Fortune: Day = ASC + Moon - Sun; Night = ASC + Sun - Moon
 * - Part of Spirit:  Day = ASC + Sun - Moon; Night = ASC + Moon - Sun (reverse of Fortune)
 * - Part of Eros:    ASC + Venus - Spirit
 * - Part of Marriage: ASC + DSC - Venus
 */
export function calculateArabicParts(
  ascLongitude: number,
  sunLongitude: number,
  moonLongitude: number,
  venusLongitude: number,
  dscLongitude: number,
  isDayChart: boolean,
  enabledParts: ArabicPartId[],
): ArabicPartResult[] {
  const results: ArabicPartResult[] = [];
  const enabled = new Set(enabledParts);

  // Calculate Spirit first since Eros depends on it
  const spiritLon = isDayChart
    ? mod360(ascLongitude + sunLongitude - moonLongitude)
    : mod360(ascLongitude + moonLongitude - sunLongitude);

  if (enabled.has('PART_OF_FORTUNE')) {
    const fortuneLon = isDayChart
      ? mod360(ascLongitude + moonLongitude - sunLongitude)
      : mod360(ascLongitude + sunLongitude - moonLongitude);
    results.push(toLotResult('PART_OF_FORTUNE', 'Part of Fortune', fortuneLon));
  }

  if (enabled.has('PART_OF_SPIRIT')) {
    results.push(toLotResult('PART_OF_SPIRIT', 'Part of Spirit', spiritLon));
  }

  if (enabled.has('PART_OF_EROS')) {
    const erosLon = mod360(ascLongitude + venusLongitude - spiritLon);
    results.push(toLotResult('PART_OF_EROS', 'Part of Eros', erosLon));
  }

  if (enabled.has('PART_OF_MARRIAGE')) {
    const marriageLon = mod360(ascLongitude + dscLongitude - venusLongitude);
    results.push(toLotResult('PART_OF_MARRIAGE', 'Part of Marriage', marriageLon));
  }

  return results;
}
