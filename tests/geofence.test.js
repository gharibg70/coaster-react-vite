import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, isInsideGeofence, isValidCoordinates } from '../src/features/student/geofenceUtils.js';

test('distanceMeters returns Haversine distance for known equatorial points', () => {
  const distance = distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
  assert.ok(Math.abs(distance - 111194.93) < 1);
});

test('geofence includes an exact distance boundary when no accuracy uncertainty is supplied', () => {
  const origin = { lat: 0, lng: 0 };
  const point = { lat: 0, lng: 0.01 };
  const radiusMeters = distanceMeters(origin, point);
  assert.equal(isInsideGeofence(point, { ...origin, radiusMeters }), true);
  assert.equal(isInsideGeofence(point, { ...origin, radiusMeters: radiusMeters - 0.01 }), false);
});

test('GPS accuracy is treated as an uncertainty margin before triggering', () => {
  const bus = { lat: 0, lng: 0, accuracy: 40 };
  const destination = { lat: 0, lng: 0, radiusMeters: 50 };
  assert.equal(isInsideGeofence(bus, destination), true);
  assert.equal(isInsideGeofence({ ...bus, lat: 0.0002 }, destination), false);
});

test('missing coordinates do not produce a distance or trigger a geofence', () => {
  assert.equal(distanceMeters(null, { lat: 0, lng: 0 }), null);
  assert.equal(distanceMeters({ lat: 1 }, { lat: 0, lng: 0 }), null);
  assert.equal(isInsideGeofence({ lat: 0, lng: 0 }, { lng: 0, radiusMeters: 50 }), false);
});

test('invalid coordinates and invalid radius are rejected', () => {
  assert.equal(isValidCoordinates({ lat: 91, lng: 0 }), false);
  assert.equal(isValidCoordinates({ lat: 0, lng: -181 }), false);
  assert.equal(isValidCoordinates({ lat: NaN, lng: 0 }), false);
  assert.equal(isInsideGeofence({ lat: 0, lng: 0 }, { lat: 0, lng: 0, radiusMeters: 0 }), false);
});
