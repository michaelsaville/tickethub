/**
 * Haversine distance between two points in meters.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000 // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Default radius in meters for "near a site" matching. */
export const SITE_MATCH_RADIUS_M = 200

/** Radius in meters for grouping pings into a single stop. */
export const STOP_CLUSTER_RADIUS_M = 150

/** Minimum minutes at a location to count as a "stop". */
export const MIN_STOP_MINUTES = 10
