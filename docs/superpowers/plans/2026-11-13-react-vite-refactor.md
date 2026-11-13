# React and Vite Refactor Implementation Plan

> **For agentic workers:** Implement the tasks in order and verify each deliverable.

**Goal:** Replace the single-file frontend with a maintainable React/Vite application while preserving the existing Arabic student, administrator, Supabase, map, push-notification, and PWA behavior.

**Architecture:** Use Vite with React and feature-oriented modules. Keep Supabase as the existing backend and preserve its RPC/table contracts; move browser-safe configuration to Vite environment variables and keep service worker/PWA assets under `public/`.

**Tech Stack:** React, Vite, JavaScript, `@supabase/supabase-js`.

**Spec:** User request to restructure the repository from one HTML file into React and Vite; current behavior is defined in `index.html`, `config.js`, `manifest.json`, and `sw.js`.

## Global Constraints

- Preserve Arabic language and RTL layout, current features, and existing Supabase table/RPC names.
- Do not alter or write production Supabase data during migration.
- Do not push, publish, or modify the remote repository.
- Do not expose server/service-role credentials in client bundles.

## Review Focus

- Missing Vite environment values must fail clearly rather than silently creating a broken client.
- Authentication roles and profile loading must continue to route users to student/admin views.
- Attendance, subscriptions, announcements, settings, push and live bus location retain current backend contracts.
- Public asset and service-worker paths must work from the built static app.
- Arabic RTL, mobile safe areas, and existing responsive/dark appearance remain intact.

---

### Task 1: Vite foundation and shared client

**Files:** Create `package.json`, `vite.config.js`, `.gitignore`, `.env.example`, `src/main.jsx`, `src/lib/supabase.js`, `src/styles/*`, `public/*`, and replace root `index.html`; preserve image assets and migrate manifest/service worker.

- [ ] Add React/Vite scripts and dependencies.
- [ ] Initialize React root and create Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- [ ] Move reusable styles and PWA static assets; ensure no secret key is committed.
- [ ] Verify `npm run build` emits a deployable `dist/`.

### Task 2: Authentication and student workflows

**Files:** Create `src/App.jsx`, `src/components/*`, `src/features/auth/*`, `src/features/student/*`.

- [ ] Implement application loading/auth routing, login/signup/logout, profile lookup and subscription-code redemption.
- [ ] Implement student attendance, weekly defaults, seat availability, announcements, history, and subscription renewal using the existing Supabase queries/RPC calls.
- [ ] Keep UI state in React rather than `innerHTML` or direct DOM updates.
- [ ] Verify production build and static-check preserved backend contract names.

### Task 3: Administrator, map, and notifications

**Files:** Create `src/features/admin/*`, `src/features/map/*`, `src/features/notifications/*` and shared status/toast components.

- [ ] Implement administrator attendance/list/export, subscriptions, password reset, codes, announcements, capacity and date controls.
- [ ] Implement bus-location map/realtime channel and start/stop location sharing.
- [ ] Implement browser push subscription enable/disable and service-worker registration.
- [ ] Verify all existing RPC/table identifiers are represented and run a clean Vite build.

### Task 4: Documentation and final verification

**Files:** Create `README.md` and update `.env.example` as needed.

- [ ] Document setup, environment values, local development and static deployment.
- [ ] Run dependency installation, production build, repository status/diff checks, and focused source checks.
- [ ] Report any runtime checks that require unavailable Supabase credentials or browser interaction as limitations.
