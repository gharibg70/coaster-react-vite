# Unusual Passenger Features Implementation Plan

> **For agentic workers:** Implement tasks in order; do not apply an external database migration until the owner explicitly approves it.

**Goal:** Add the five user-selected features—weekly story (10), missing-share alert (9), arrival reminder (8), seat forecast (5), and road pulse (1)—to the existing React/Vite app.

**Architecture:** Reuse `get_seats(p_route_id, p_date)`, `system_settings`, and realtime updates from `bus_location`. Add a trip-duration table and aggregate-only database function for Road Pulse because the existing schema exposes only the latest bus coordinate, not completed-trip history. The prediction will forecast historical journey duration by direction/day, not claim knowledge of live traffic conditions. Arrival reminders stay on the student device and react to shared bus position; they do not collect student GPS.

**Tech Stack:** React 18, Vite, Supabase JS v2, Leaflet, Node's built-in test runner, and a reviewed SQL migration artifact.

**Spec:** User selected ideas 10, 9, 8, 5, and 1 from the previous brainstorm.

## Global Constraints

- Publish only to `gharibg70/coaster-react-vite`; leave `gharibg70/coaster` unchanged.
- Do not expose passenger identities or collect passenger GPS for aggregate features.
- Do not invent traffic-delay minutes or confidence; require at least four completed comparable trips.
- Keep geofence reminders local to the device; clearly disclose that reliable background geofencing is not guaranteed by mobile browsers.
- Use `Asia/Baghdad` date/time calculations and accessible labels/status messages.
- Prepare, document, and test the SQL migration, but do not apply it to Supabase without the owner's explicit approval.

## Review Focus

- Empty or inaccessible historical seat RPC data must render “بيانات غير كافية” instead of a low-risk prediction.
- Fewer than four comparable trip records must render “نجمع بيانات الرحلات” instead of a duration estimate.
- Missing destination coordinates, denied notification permission, or unsupported browser APIs must not crash the student view; explain which reminder capability is unavailable.
- Missing expected departure time must suppress the late-share warning until an administrator configures one.
- Disabled/stale sharing must warn administrators only, never students; stale means `bus_location.updated_at` is over 120 seconds old.
- The existing calendar helper and five-day teaching week must not be confused with a rolling seven-day summary.

---

### Task 1: Seat-availability forecast and weekly story

**Files:** Create `src/features/student/forecastService.js`, `forecastUtils.js`, `ForecastCard.jsx`, `WeeklyStory.jsx`, and `tests/forecast.test.js`; update `package.json` and `StudentView.jsx`.

**Interfaces:** `loadSeatHistory(routeId, targetDate, samples=6)` calls the existing `get_seats` RPC for matching prior weekdays and returns `{date, capacity, outboundTaken, returnTaken}` records. `estimateSeatAvailability(samples, direction)` returns a coarse label, explanation, and sample count. `summarizeWeek(records, todayBaghdad)` returns anonymous daily totals and busiest day/direction.

- [ ] Add Node tests for no samples, partial occupancy, repeated full trips, direction-specific counts, and Baghdad week boundaries.
- [ ] Show a forecast only with data, explain it uses the last six matching weekdays, and never imply certainty.
- [ ] Render a seven-calendar-day, identity-free story from aggregate seat RPC results; do not add student rows or names.

### Task 2: Administrator missing-share alert

**Files:** Create `src/features/admin/DepartureMonitor.jsx`; update `src/features/admin/adminService.js` and `AdminView.jsx`; add `tests/departureMonitor.test.js`.

**Interfaces:** Read/write `system_settings` key `expected_departure_time`. `getShareWarning({expectedTime, nowBaghdad, isSharing, updatedAt})` returns a warning only after expected departure plus 10 minutes and when sharing is off or older than 120 seconds.

- [ ] Test before-time, grace-window, active/current share, stale update, and unset schedule.
- [ ] Add an administrator-only departure-time setting and a visible live status; do not send student push notifications for this condition.

### Task 3: Arrival-triggered personal reminder

**Files:** Create `src/features/student/ArrivalReminder.jsx` and `src/features/student/geofenceUtils.js`; add `tests/geofence.test.js`; update admin settings UI/service and `StudentView.jsx`.

**Interfaces:** Store separate administrator-configured outbound and return destination pins `{lat,lng,radiusMeters}` in `system_settings`; store each student's reminder message/direction only in local storage. `distanceMeters(a,b)` computes geodesic distance; `isInsideGeofence(busLocation,destination)` validates coordinates and radius.

- [ ] Test distance, exact-boundary, missing coordinates, and invalid coordinate handling.
- [ ] Use the shared `bus_location` realtime row and trigger only while the app is active; request browser notification permission only after the user explicitly enables a reminder, with an in-app fallback.
- [ ] Let an administrator configure each destination pin/radius; explain that this is an arrival reminder, not background phone geofencing.

### Task 4: Road Pulse from completed-trip durations

**Files:** Create `supabase/migrations/20261113_trip_runs.sql`, `src/features/admin/tripRunService.js`, `src/features/student/roadPulseService.js`, `src/features/student/RoadPulse.jsx`, and `tests/roadPulse.test.js`; update admin/student views.

**Interfaces:** Record a direction, service date, and explicit start/end timestamps; calculate duration from those timestamps. Provide students only aggregate duration samples; never return operator/user identity. `estimateRoadPulse(samples, direction, weekday)` returns “collecting data” below four comparable trips; otherwise it returns the historical median journey duration and difference versus the all-week median for that direction. This is a historical pattern, not a live traffic feed or guaranteed arrival time.

- [ ] Test incomplete trips, invalid/negative durations, fewer than four samples, and four-or-more same-direction/same-weekday trips.
- [ ] Add explicit administrator controls to start/end a trip; do not infer trips from location-sharing toggles.
- [ ] Document SQL Editor installation and use an aggregate-only authenticated RPC with admin-only insert policy based on `profiles.role = 'admin'`.
- [ ] Until the owner applies the migration, catch the missing-table/function error and display a clear setup-needed state; do not break existing booking flows.

### Task 5: Verify and publish

- [ ] Run `npm test`, `GITHUB_ACTIONS=true npm run build`, `git diff --check`, and checks that no service-role key or student-identifying fields were added to public bundles.
- [ ] Push verified code only to the approved new repository and confirm GitHub Pages serves the compiled Vite assets.
- [ ] Report that Road Pulse requires the unapplied SQL migration and four comparable recorded trips; report that arrival reminders require configured destinations and foreground app execution.
