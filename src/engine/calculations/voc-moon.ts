import { calcSinglePlanet } from '../sweph-adapter.js';
import { toJulianDay, fromJulianDay } from '../../utils/date.js';
import type { PlanetId, AspectType, SignName, VocMoonPeriod, ZodiacSystem } from '../types.js';

const PTOLEMAIC_ASPECTS: [AspectType, number][] = [
  ['CONJUNCTION', 0],
  ['SEXTILE', 60],
  ['SQUARE', 90],
  ['TRINE', 120],
  ['OPPOSITION', 180],
];

const VOC_TARGET_PLANETS: PlanetId[] = [
  'SUN', 'MERCURY', 'VENUS', 'MARS',
  'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
];

const SIGN_NAMES: readonly SignName[] = [
  'ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR',
  'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS',
];

const STEP_2H = 1 / 12;        // 2 hours in JD units
const PRECISION_1MIN = 1 / 1440; // 1 minute in JD units

function getSign(lon: number): number {
  return Math.floor(((lon % 360) + 360) % 360 / 30);
}

function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function wrapTo180(x: number): number {
  return (((x % 360) + 540) % 360) - 180;
}

// Signed orb whose sign flips as the Moon crosses the exact aspect, so a
// zero-crossing can be detected for every Ptolemaic aspect. For conjunction
// (0deg) and opposition (180deg) the unsigned distance-minus-angle never changes
// sign, so those aspects must use the signed separation instead; the symmetric
// aspects keep using unsigned-distance-minus-angle, which crosses zero from
// either side.
function aspectOrb(moonLon: number, planetLon: number, exactAngle: number): number {
  if (exactAngle === 0) return wrapTo180(moonLon - planetLon);
  if (exactAngle === 180) return wrapTo180(moonLon - planetLon - 180);
  return angularDistance(moonLon, planetLon) - exactAngle;
}

interface MoonIngress {
  jd: number;
  signEntering: number;
}

export function findMoonIngresses(jdStart: number, jdEnd: number, zodiacSystem?: ZodiacSystem): MoonIngress[] {
  const ingresses: MoonIngress[] = [];
  let prevSign = getSign(calcSinglePlanet(jdStart, 'MOON', zodiacSystem).longitude);
  let jd = jdStart + STEP_2H;

  while (jd <= jdEnd) {
    const moonLon = calcSinglePlanet(jd, 'MOON', zodiacSystem).longitude;
    const curSign = getSign(moonLon);

    if (curSign !== prevSign) {
      // Binary search for precise ingress time
      let lo = jd - STEP_2H;
      let hi = jd;
      while (hi - lo > PRECISION_1MIN) {
        const mid = (lo + hi) / 2;
        const midSign = getSign(calcSinglePlanet(mid, 'MOON', zodiacSystem).longitude);
        if (midSign === prevSign) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      ingresses.push({ jd: hi, signEntering: curSign });
      prevSign = curSign;
    } else {
      prevSign = curSign;
    }

    jd += STEP_2H;
  }

  return ingresses;
}

interface AspectHit {
  jd: number;
  planet: PlanetId;
  aspectType: AspectType;
}

export function findLastExactAspect(segStart: number, segEnd: number, zodiacSystem?: ZodiacSystem): AspectHit | null {
  let latestHit: AspectHit | null = null;

  // Cache planet positions at each step to avoid redundant calculations
  let prevMoonLon = calcSinglePlanet(segStart, 'MOON', zodiacSystem).longitude;
  const prevPlanetLons = new Map<PlanetId, number>();
  for (const pid of VOC_TARGET_PLANETS) {
    prevPlanetLons.set(pid, calcSinglePlanet(segStart, pid, zodiacSystem).longitude);
  }

  let jd = segStart + STEP_2H;
  while (jd <= segEnd + STEP_2H) {
    const stepJd = Math.min(jd, segEnd);
    const curMoonLon = calcSinglePlanet(stepJd, 'MOON', zodiacSystem).longitude;

    for (const pid of VOC_TARGET_PLANETS) {
      const curPlanetLon = calcSinglePlanet(stepJd, pid, zodiacSystem).longitude;
      const prevPlanetLon = prevPlanetLons.get(pid)!;

      for (const [aspectType, exactAngle] of PTOLEMAIC_ASPECTS) {
        const prevOrb = aspectOrb(prevMoonLon, prevPlanetLon, exactAngle);
        const curOrb = aspectOrb(curMoonLon, curPlanetLon, exactAngle);

        // Guard: only consider if both orbs are within 15deg of exact. This also
        // discards the +/-180 wrap discontinuity of the signed conj/opp orb,
        // which only ever occurs far (>=165deg) from exact.
        if (Math.abs(prevOrb) > 15 || Math.abs(curOrb) > 15) continue;

        // Sign flip means crossing exact
        if (prevOrb * curOrb < 0) {
          // Binary search for exact time
          let lo = stepJd - STEP_2H;
          let hi = stepJd;
          while (hi - lo > PRECISION_1MIN) {
            const mid = (lo + hi) / 2;
            const midMoon = calcSinglePlanet(mid, 'MOON', zodiacSystem).longitude;
            const midPlanet = calcSinglePlanet(mid, pid, zodiacSystem).longitude;
            const midOrb = aspectOrb(midMoon, midPlanet, exactAngle);
            if (prevOrb < 0 ? midOrb < 0 : midOrb >= 0) {
              lo = mid;
            } else {
              hi = mid;
            }
          }
          const exactJd = (lo + hi) / 2;
          if (!latestHit || exactJd > latestHit.jd) {
            latestHit = { jd: exactJd, planet: pid, aspectType };
          }
        }
      }

      prevPlanetLons.set(pid, curPlanetLon);
    }

    prevMoonLon = curMoonLon;
    jd += STEP_2H;
  }

  return latestHit;
}

export function calculateVocPeriods(year: number, month: number, zodiacSystem?: ZodiacSystem): VocMoonPeriod[] {
  // JD range: month +/- 3 day buffer
  const jdStart = toJulianDay(year, month, 1, 0) - 3;
  const daysInMonth = new Date(year, month, 0).getDate();
  const jdEnd = toJulianDay(year, month, daysInMonth, 24) + 3;

  // Month boundaries for filtering
  const monthStart = toJulianDay(year, month, 1, 0);
  const monthEnd = toJulianDay(year, month, daysInMonth, 24);

  const ingresses = findMoonIngresses(jdStart, jdEnd, zodiacSystem);
  const periods: VocMoonPeriod[] = [];

  for (let i = 0; i < ingresses.length; i++) {
    const ingressJd = ingresses[i].jd;
    const ingressSign = ingresses[i].signEntering;

    // Segment: from previous ingress (or jdStart) to this ingress
    const segStart = i > 0 ? ingresses[i - 1].jd : jdStart;

    const lastAspect = findLastExactAspect(segStart, ingressJd, zodiacSystem);

    if (lastAspect) {
      const vocStart = lastAspect.jd;
      const vocEnd = ingressJd;

      // Filter: only include periods that overlap the target month
      if (vocEnd >= monthStart && vocStart <= monthEnd) {
        periods.push({
          start: fromJulianDay(vocStart),
          end: fromJulianDay(vocEnd),
          lastAspectPlanet: lastAspect.planet,
          lastAspectType: lastAspect.aspectType,
          endSign: SIGN_NAMES[ingressSign],
        });
      }
    } else {
      // No aspect found in the segment (rare edge case)
      const vocStart = segStart;
      const vocEnd = ingressJd;
      if (vocEnd >= monthStart && vocStart <= monthEnd) {
        periods.push({
          start: fromJulianDay(vocStart),
          end: fromJulianDay(vocEnd),
          lastAspectPlanet: 'MOON',
          lastAspectType: 'CONJUNCTION',
          endSign: SIGN_NAMES[ingressSign],
        });
      }
    }
  }

  return periods;
}
