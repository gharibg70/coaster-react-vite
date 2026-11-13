# Student Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one moderated, real-time, text-only group chat for students with active subscriptions in the Coster app.

**Architecture:** Use a public-safe messages table containing only UUID, display name, text, and timestamp; keep sender/reporting identities in private tables. Database RPCs enforce subscription eligibility, validation, rate limits, reporting, and admin moderation; React receives only safe message fields and uses Realtime for new rows.

**Tech Stack:** React 18, Vite, Supabase JS v2/Postgres RPC/RLS/Realtime, Node built-in tests, PGlite for isolated PostgreSQL integration tests.

**Spec:** `docs/superpowers/specs/2026-11-13-student-chat.md`

> Execution note: Because implementation was split across parallel workers, pre-implementation red-phase runs were not captured. The final integrated tests and build were run and passed before publication.

## Global Constraints

- One shared room for all authenticated users with an active subscription; administrators moderate but do not post in the student room.
- An eligible subscription has `status = 'active'` and `end_date IS NULL OR end_date >= (now() AT TIME ZONE 'Asia/Baghdad')::date`.
- Message text is trimmed and limited to 500 Unicode code points; a sender may post no faster than once per two seconds.
- Public message rows and Realtime payloads must not contain phone numbers, `auth.uid()`, or a sender UUID.
- Only the latest 100 messages are loaded; no images, files, private rooms, DMs, edits, or push notifications.
- The migration is prepared in the repository only; do not apply it to Supabase without separate explicit approval.
- Publish only to `gharibg70/coaster-react-vite`; do not change `gharibg70/coaster`.

## Review Focus

- Suspended or expired users must neither read messages nor send; test SQL eligibility for active, suspended, expired, and no-subscription cases.
- Empty or whitespace-only messages are rejected; exactly 500 Unicode code points are accepted and 501 are rejected, including emoji cases.
- Concurrent send attempts must still respect the two-second per-account limit; serialize the check/update transactionally.
- Reports must not expose reporter IDs and a user cannot report the same message twice.
- Keep already-rendered messages private after access loss: revalidate the server-side eligibility boolean every 30 seconds, clear local history on denial/error, and unsubscribe from Realtime.
- Invalidate late history responses after access loss, preserve drafts on transient permission-check errors, and reconcile history once Realtime confirms its subscription.
- Execute the migration against an isolated PostgreSQL-compatible database in tests; do not connect to or modify live Supabase.
- A malformed Realtime row, offline state, or missing migration must show a recoverable status rather than crash or erase composed text.

---

### Task 1: Secure chat schema and RPCs

**Files:** Create `supabase/migrations/20261113_student_chat.sql`, `tests/chatPolicy.test.js`, and `tests/chatDatabase.test.js`; add PGlite as a development dependency.

**Interfaces:** The migration creates `student_chat_messages(id, display_name, body, created_at)`; private author and report tables keep account IDs outside public rows. RPC contracts: `student_chat_access()` returns only a boolean; `send_student_chat_message(p_body text)` returns `{id,display_name,body,created_at}`; `report_student_chat_message(p_message_id uuid,p_reason text)` returns void; `admin_list_student_chat_reports(p_limit integer default 100)` returns at most 100 `{message_id,display_name,body,created_at,report_count}` rows; `admin_delete_student_chat_message(p_message_id uuid)` returns void.

- [x] Add static migration tests named `public_message_rows_exclude_account_ids`, `direct_message_writes_are_revoked`, `read_policy_requires_eligible_student_or_admin`, `send_rpc_enforces_subscription_and_rate_limit`, and `moderation_rpcs_require_admin`.
- [x] Run `node --test tests/chatPolicy.test.js tests/chatDatabase.test.js` after implementation and confirm the final migration and policy checks pass.
- [x] Implement RLS and least-privilege grants; permit client `SELECT` only on safe public message rows. Route writes/report/delete through `SECURITY DEFINER` functions with an empty search path and fully-qualified objects.
- [x] Use a transaction-scoped per-user lock for the two-second rate limit and sample the send timestamp after acquiring it; derive display name from `profiles`, never from client input. Revoke direct access to author/report tables and return only aggregate report counts to admins.
- [x] Add the safe messages table to `supabase_realtime` idempotently when that publication exists; document that the SQL remains unapplied.
- [x] Run `node --test tests/chatPolicy.test.js tests/chatDatabase.test.js`; require the migration to execute and validate active, suspended, expired, unregistered, anonymous, and admin behavior plus grants, report uniqueness, and deletion cascades.

### Task 2: Student chat service and UI

**Files:** Create `src/features/chat/chatService.js`, `src/features/chat/ChatPanel.jsx`, and `tests/chatValidation.test.js`; modify `src/features/student/StudentView.jsx` and `src/styles.css`.

**Interfaces:** `validateMessageBody(body)` returns `{ok:true,value}` or `{ok:false,error}`; `canCommitChatHistory(requestVersion,latestVersion,authorized)` rejects stale/unauthorized responses; `checkStudentChatAccess()` returns the server boolean; `listMessages(limit=100)` returns chronologically ordered safe `ChatMessage[]`; `sendMessage(body)` returns one safe `ChatMessage`; `subscribeToMessages(onMessage,onError,onSubscribed)` returns an unsubscribe function; `reportMessage(messageId,reason)` returns void.

- [x] Add tests `late_history_response_is_discarded_after_access_invalidation`, `cancelled_realtime_channel_cannot_deliver_after_reauthorization`, `composer_clips_to_500_unicode_codepoints_including_emoji`, `rejects_empty_after_trim`, `accepts_exactly_500_unicode_codepoints`, `rejects_501_unicode_codepoints`, and `trims_message_text`.
- [x] Run `node --test tests/chatValidation.test.js` after implementation and confirm the final client helper tests pass.
- [x] Implement safe initial history loading, realtime INSERT handling with ID de-duplication and post-subscription history reconciliation, periodic authoritative access revalidation, send/report RPC calls, and the exported message validator. Clear cached messages and close Realtime when access is lost; invalidate late history responses; preserve composed text on send and transient access-check failures.
- [x] Add an accessible chat tab to the student bottom navigation; limit rendered history and composer input to 100 messages and 500 Unicode code points. Label the composer, character count, report-reason selector (`spam`, `abuse`, `other`), and report button; announce only new messages in a dedicated live region and visibly state that eligible students/admins can see message/name content.
- [x] Show an access/setup/offline state clearly; escape all text through normal React rendering and never render message HTML.
- [x] Run `node --test tests/chatValidation.test.js` and `npm run build`.

### Task 3: Administrator moderation

**Files:** Create `src/features/chat/chatModerationService.js`, `src/features/chat/ChatModeration.jsx`, and `tests/chatModeration.test.js`; modify `src/features/admin/AdminView.jsx` and `README.md`.

**Interfaces:** `canModerateChat(profile): boolean`; `sanitizeChatReport(row)` validates and projects only `{message_id,display_name,body,created_at,report_count}`; `listReportedMessages(limit=100)` passes a clamped server-side limit and returns safe `ChatReport[]` without reporter identities; `deleteReportedMessage(messageId)` invokes the admin delete RPC. `ChatModeration({profile,showToast,reportError})` renders nothing unless `canModerateChat(profile)` is true.

- [x] Add tests `projects_reports_to_safe_fields`, `rejects_non_admin_moderation_access`, `allows_admin_moderation`, `handles_empty_report_queue`, and `drops_malformed_report_rows`; test the 100-row cap against PGlite.
- [x] Run `node --test tests/chatModeration.test.js` after implementation and confirm the final moderation helper tests pass.
- [x] Add the moderation panel to Admin tools, showing reported text and report counts; allow admin deletion only after a confirmation and refresh the queue afterward.
- [x] Document room eligibility, text limit, visibility, moderation, and manual SQL migration in `README.md`.
- [x] Run `npm test`, `GITHUB_ACTIONS=true npm run build`, and `git diff --check`.

### Task 4: Final review and publication

- [x] Review the complete diff for accidental private fields, unsafe SQL privileges, and changes outside the approved repository.
- [x] Confirmed this task did not apply the migration; scanned the production bundle for service-role credentials.
- [x] Commit and push only to `publish` / `gharibg70/coaster-react-vite` after all tests/build pass.
- [x] Confirm the GitHub Pages workflow succeeds and that the deployed HTML and chat bundle return HTTP 200.
- [x] Report setup requirements and that realtime chat remains unavailable until the migration is separately applied.


## Verified Release

- Chat implementation commit: `7efb679` (published to `gharibg70/coaster-react-vite`).
- GitHub Pages workflow run `43390387429`: success; tests and production build passed.
- Local integrated suite: 48 passed, 0 failed; live app, chat bundle, manifest, and service worker each returned HTTP 200.
- The SQL migration remains an unapplied repository artifact, as requested.
