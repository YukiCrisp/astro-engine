import { z } from 'zod';
import { HouseSystemEnum } from './responses.js';

const MS_PER_DAY = 86_400_000;

/** Inclusive day count between two YYYY-MM-DD dates. */
function inclusiveDayCount(startDate: string, endDate: string): number {
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / MS_PER_DAY) + 1;
}

/** Ten years, the longest window the list draws. */
export const FORECAST_MAX_DAYS = 3653;
/** The fast transiting planets only make a readable list in a window of three months or less. */
export const FORECAST_FAST_MAX_DAYS = 92;

export const FORECAST_TRANSIT_MOVERS = [
  'SUN', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'CHIRON',
] as const;
export const FORECAST_FAST_TRANSIT_MOVERS: readonly string[] = ['SUN', 'MERCURY', 'VENUS', 'MARS'];
export const FORECAST_PROGRESSED_MOVERS = ['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS'] as const;

const MoverEnum = z.enum([...FORECAST_TRANSIT_MOVERS, 'MOON']);
const TargetEnum = z.enum([
  'SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
  'TRUE_NODE', 'CHIRON', 'ASC', 'MC',
]);
const ForecastAspectEnum = z.enum(['CONJUNCTION', 'OPPOSITION', 'TRINE', 'SQUARE', 'SEXTILE']);
/** The years the shipped ephemeris files cover (seas_18 and seas_24: 1800–2999). */
const WINDOW_MIN_YEAR = 1800;
const WINDOW_MAX_YEAR = 2999;

function isRealDate(v: string): boolean {
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * The shape check alone let "2026-13-01" through: Date.parse gave NaN, every
 * day-count guard compared false, and the engine rolled month 13 into the
 * next year — a window of any length.
 */
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, { message: 'Must be a real date' });
const windowDate = dateString.refine((v) => {
  const y = Number(v.slice(0, 4));
  return y >= WINDOW_MIN_YEAR && y <= WINDOW_MAX_YEAR;
}, { message: `Must be between ${WINDOW_MIN_YEAR} and ${WINDOW_MAX_YEAR}` });

export const ForecastRequestSchema = z.object({
  birthDate: dateString.describe('Birth date in YYYY-MM-DD format').meta({ example: '1990-04-15' }),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().describe('Birth time in HH:MM format, or null if unknown').meta({ example: '14:30' }),
  lat: z.number().min(-90).max(90).describe('Latitude of birth location').meta({ example: 35.6762 }),
  lon: z.number().min(-180).max(180).describe('Longitude of birth location').meta({ example: 139.6503 }),
  utcOffsetMinutes: z.number().int().min(-840).max(840).describe('UTC offset in minutes at time of birth').meta({ example: 540 }),
  houseSystem: HouseSystemEnum.default('PLACIDUS').describe('House system (used for the natal ASC / MC targets)'),
  zodiacSystem: z.enum(['tropical', 'sidereal']).default('tropical').describe('Zodiac system (tropical or sidereal/Lahiri)'),
  method: z.enum(['transit', 'progressed']).describe('Transiting planets, or secondary progressions (a day for a year)'),
  startDate: windowDate.describe('Window start date in YYYY-MM-DD format').meta({ example: '2026-11-04' }),
  endDate: windowDate.describe('Window end date in YYYY-MM-DD format (inclusive)').meta({ example: '2027-11-03' }),
  movers: z.array(MoverEnum).min(1).describe('Moving bodies. Transit: Sun–Pluto and Chiron except the Moon (Sun–Mars only in windows up to 92 days). Progressed: Sun–Mars.'),
  targets: z.array(TargetEnum).min(1).describe('Natal points aspected. ASC / MC are skipped when the birth time is unknown.'),
  aspects: z.array(ForecastAspectEnum).min(1).describe('Major aspects to look for'),
  orb: z.number().min(0.1).max(10).describe('Orb in degrees, one value for every aspect').meta({ example: 3 }),
}).superRefine((v, ctx) => {
  const days = inclusiveDayCount(v.startDate, v.endDate);
  if (!Number.isFinite(days) || days < 1 || days > FORECAST_MAX_DAYS) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: `Window must be 1-${FORECAST_MAX_DAYS} days` });
  }
  const allowed: readonly string[] = v.method === 'transit' ? FORECAST_TRANSIT_MOVERS : FORECAST_PROGRESSED_MOVERS;
  for (const m of v.movers) {
    if (!allowed.includes(m)) {
      ctx.addIssue({ code: 'custom', path: ['movers'], message: `${m} is not a ${v.method} mover` });
    } else if (v.method === 'transit' && FORECAST_FAST_TRANSIT_MOVERS.includes(m) && days > FORECAST_FAST_MAX_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['movers'], message: `${m} needs a window of ${FORECAST_FAST_MAX_DAYS} days or less` });
    }
  }
  // A twelve-hour error in the birth time moves every progressed date by up to half a year.
  if (v.method === 'progressed' && v.birthTime === null) {
    ctx.addIssue({ code: 'custom', path: ['birthTime'], message: 'Progressions need a birth time' });
  }
});
export type ForecastRequest = z.infer<typeof ForecastRequestSchema>;
