/**
 * Midpoint calculations for composite charts.
 * A composite chart uses the shorter-arc midpoint of two ecliptic longitudes.
 */

export function midpointLongitude(lonA: number, lonB: number): number {
  const a = ((lonA % 360) + 360) % 360;
  const b = ((lonB % 360) + 360) % 360;
  let diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  const mid = a + diff / 2;
  return ((mid % 360) + 360) % 360;
}
