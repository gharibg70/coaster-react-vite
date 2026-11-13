const EARTH_RADIUS_METERS = 6_371_000;

export function isValidCoordinates(point) {
  if (!point || typeof point !== 'object') return false;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function distanceMeters(a, b) {
  if (!isValidCoordinates(a) || !isValidCoordinates(b)) return null;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(Number(a.lat));
  const lat2 = toRadians(Number(b.lat));
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians(Number(b.lng) - Number(a.lng));
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function isInsideGeofence(busLocation, destination) {
  if (!isValidCoordinates(busLocation) || !isValidCoordinates(destination)) return false;
  const radius = Number(destination.radiusMeters);
  if (!Number.isFinite(radius) || radius <= 0) return false;
  const distance = distanceMeters(busLocation, destination);
  const accuracy = Number(busLocation.accuracy);
  const uncertainty = Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 0;
  // Require the estimated point plus its uncertainty radius to fit inside the zone.
  return distance !== null && distance + uncertainty <= radius;
}
