/**
 * Davison relationship chart: one real chart cast for the moment halfway
 * between two births (in UT) at the place halfway between the two birthplaces.
 *
 * The place is the plain average of latitude and longitude, except that the
 * longitude is averaged along the shorter way round the globe — the same idea
 * as the composite's shorter-arc midpoint. Tokyo (139.69°E) and Los Angeles
 * (118.24°W) meet over the Pacific (169.27°W), not off Africa (10.73°E).
 * Exactly 180° apart, the place falls east of person A.
 */

/** Julian Day (UT) halfway between the two births. */
export function midpointJulianDay(jdA: number, jdB: number): number {
  return (jdA + jdB) / 2;
}

/** Longitude in [-180, 180) halfway between lonA and lonB the shorter way round. */
export function midpointGeoLongitude(lonA: number, lonB: number): number {
  let diff = lonB - lonA;
  if (diff > 180) diff -= 360;
  if (diff <= -180) diff += 360;
  const mid = lonA + diff / 2;
  return ((((mid + 180) % 360) + 360) % 360) - 180;
}

export function midpointPlace(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): { lat: number; lon: number } {
  return { lat: (a.lat + b.lat) / 2, lon: midpointGeoLongitude(a.lon, b.lon) };
}
