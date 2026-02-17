import { calcSinglePlanet } from '../sweph-adapter.js';
import { toJulianDay, fromJulianDay } from '../../utils/date.js';
import type { PlanetId, AspectType, SignName, VocMoonPeriod } from '../types.js';

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

interface MoonIngress {
  jd: number;
  signEntering: number;
}

export function findMoonIngresses(jdStart: number, jdEnd: number): MoonIngress[] {
  const ingresses: MoonIngress[] = [];
  let prevSign = getSign(calcSinglePlanet(jdStart, 'MOON').longitude);
  let jd = jdStart + STEP_2H;

  while (jd <= jdEnd) {
    const moonLon = calcSinglePlanet(jd, 'MOON').longitude;
    const curSign = getSign(moonLon);

    if (curSign !== prevSign) {
      // Binary search for precise ingress time
      let lo = jd - STEP_2H;
      let hi = jd;
      while (hi - lo > PRECISION_1MIN) {
        const mid = (lo + hi) / 2;
        const midSign = getSign(calcSinglePlanet(mid, 'MOON').longitude);
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

export function findLastExactAspect(segStart: number, segEnd: number): AspectHit | null {
  let latestHit: AspectHit | null = null;

  // Cache planet positions at each step to avoid redundant calculations
  let prevMoonLon = calcSinglePlanet(segStart, 'MOON').longitude;
  const prevPlanetLons = new Map<PlanetId, number>();
  for (const pid of VOC_TARGET_PLANETS) {
    prevPlanetLons.set(pid, calcSinglePlanet(segStart, pid).longitude);
  }

  let jd = segStart + STEP_2H;
  while (jd <= segEnd + STEP_2H) {
    const stepJd = Math.min(jd, segEnd);
    const curMoonLon = calcSinglePlanet(stepJd, 'MOON').longitude;

    for (const pid of VOC_TARGET_PLANETS) {
      const curPlanetLon = calcSinglePlanet(stepJd, pid).longitude;
      const prevPlanetLon = prevPlanetLons.get(pid)!;

      for (const [aspectType, exactAngle] of PTOLEMAIC_ASPECTS) {
        const prevDist = angularDistance(prevMoonLon, prevPlanetLon);
        const curDist = angularDistance(curMoonLon, curPlanetLon);

        const prevOrb = prevDist - exactAngle;
        const curOrb = curDist - exactAngle;

        // Guard: only consider if both distances are within 15deg of the exact angle
        if (Math.abs(prevOrb) > 15 || Math.abs(curOrb) > 15) continue;

        // Sign flip means crossing exact
        if (prevOrb * curOrb < 0) {
          // Binary search for exact time
          let lo = stepJd - STEP_2H;
          let hi = stepJd;
          while (hi - lo > PRECISION_1MIN) {
            const mid = (lo + hi) / 2;
            const midMoon = calcSinglePlanet(mid, 'MOON').longitude;
            const midPlanet = calcSinglePlanet(mid, pid).longitude;
            const midDist = angularDistance(midMoon, midPlanet);
            const midOrb = midDist - exactAngle;
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

export function calculateVocPeriods(year: number, month: number): VocMoonPeriod[] {
  // JD range: month +/- 3 day buffer
  const jdStart = toJulianDay(year, month, 1, 0) - 3;
  const daysInMonth = new Date(year, month, 0).getDate();
  const jdEnd = toJulianDay(year, month, daysInMonth, 24) + 3;

  // Month boundaries for filtering
  const monthStart = toJulianDay(year, month, 1, 0);
  const monthEnd = toJulianDay(year, month, daysInMonth, 24);

  const ingresses = findMoonIngresses(jdStart, jdEnd);
  const periods: VocMoonPeriod[] = [];

  for (let i = 0; i < ingresses.length; i++) {
    const ingressJd = ingresses[i].jd;
    const ingressSign = ingresses[i].signEntering;

    // Segment: from previous ingress (or jdStart) to this ingress
    const segStart = i > 0 ? ingresses[i - 1].jd : jdStart;

    const lastAspect = findLastExactAspect(segStart, ingressJd);

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
