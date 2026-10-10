# Security control mapping: NIST SP 800-53 Rev. 5 and HIPAA 164.312

**Scope and honesty note.** HealthBridge is a class project (UGA MIST 4610, Spring 2025). It holds only
fictional seed data, has never been deployed, and **is not HIPAA compliant**. Compliance would also need
administrative and physical safeguards, risk analysis, BAAs, policies, and an operated environment, none of
which a code repository can show. This document is a *self-assessment of the application code* against
the technical controls that apply to it. Its purpose is to show which controls the code really
implements, where it fell short, and what I changed.

- **Method.** I read every route and middleware file, listed which 800-53 controls each mechanism supports,
  and checked each claim with a test. If a control is listed as implemented, an automated test exercises
  it (`tests/security.test.js` and `tests/auth.test.js`) unless the row says otherwise.
- **Assessed:** October 2026, at the commit that adds this file. Line links point to `main`, so they can
  drift after later edits.
- **Status key:** **Implemented**: present and tested. **Fixed (Oct 2026)**: a gap I found during this
  assessment and fixed in code, with a test that fails on the old code. **Partial**: some of the control is
  in place. **Gap**: not implemented (see the [gap list](#remaining-gaps)).

Before the fixes, the new security tests were run against the original commit (`cc6cb7b`, in a separate
worktree): **29 of 34 failed**. The 5 that passed check behavior that was already correct (role gates, an
active session staying alive, a valid TOTP code being accepted). After the fixes the suite has 55 tests
(21 in `tests/auth.test.js`, 34 in `tests/security.test.js`), and all pass (`npm test`).

---

## 1. Gaps found and fixed in this assessment

| # | Control | Gap found in the original code | Fix | Test (in `tests/security.test.js` unless noted) |
|---|---|---|---|---|
| 1 | IA-2(1), IA-2(2) | **MFA bypass.** `is2FAVerified` existed but no route used it. After a correct password, a 2FA-enabled user had a session that passed `isAuthenticated` and could call every API without entering a TOTP code. | `isAuthenticated` rejects sessions where 2FA is enabled but not yet verified ([middleware/auth.js#L13](../middleware/auth.js#L13)). | *a password-only session cannot reach protected APIs when 2FA is enabled* |
| 2 | AC-12 | **Idle timeout never fired.** `trackActivity` overwrote `lastActivity` with *now* before comparing it, so the elapsed time was always 0. | Compare against the previous request's timestamp, then refresh it. Audit `SESSION_TIMEOUT` ([middleware/auth.js#L141](../middleware/auth.js#L141)). | *expires a session that has been idle longer than the limit* |
| 3 | SC-23 | **Session fixation.** The session ID was not changed at login. | `req.session.regenerate()` at login and registration ([routes/auth.js#L14](../routes/auth.js#L14), [#L130](../routes/auth.js#L130)). | *issues a new session cookie on each successful login* |
| 4 | AC-7 | **No account lockout.** Only an in-memory per-IP limiter existed, and it was switched off when `NODE_ENV=test`, so it was never tested. The reset endpoints had no limit, although the README said they did. | Per-account lockout: 5 consecutive failures lock the account for 15 minutes (HTTP 423, `ACCOUNT_LOCKED` audited) ([models/User.js#L129](../models/User.js#L129), [routes/auth.js#L105](../routes/auth.js#L105)). The limiter is configurable instead of bypassed, and it now also covers forgot/reset-password. | *locks an account after 5 consecutive failed passwords...*, *unlocks after the lockout window*, *rate-limits login attempts per IP* |
| 5 | AC-2 | **Anyone could self-register as a doctor** and get PHI-reading privileges at once. | Self-registered doctor accounts are created inactive until an admin activates them ([routes/auth.js#L45](../routes/auth.js#L45)). The UI shows a pending-approval message. | *a self-registered doctor cannot log in until an admin activates the account* |
| 6 | AC-2(4), AU-2 | Enabling or disabling an account was not audited, and an admin could deactivate their own account. | `USER_ACTIVATED` / `USER_DEACTIVATED` are audited, and self-deactivation is blocked ([routes/dashboard.js#L192](../routes/dashboard.js#L192)). | same test as #5; *an admin cannot deactivate their own account* |
| 7 | AC-3, AC-6 | **Broken object-level authorization on patient data.** Any doctor could read *any* patient's lab results and billing, pull full records, list active medications, prescribe, write lab results, and create bills for patients they had never seen. `canAccessPatient` existed but was never used. | A single rule, `hasPatientAccess` (admin: all; patient: self; doctor: only patients with an appointment), is applied to every patient-scoped route ([middleware/auth.js#L72](../middleware/auth.js#L72), [routes/patients.js#L90](../routes/patients.js#L90), [routes/prescriptions.js#L60](../routes/prescriptions.js#L60)). Denials are audited. | 5 tests: lab results, full records, billing, lab writes, prescriptions |
| 8 | AC-3 | **Any logged-in user could read any message thread** with `GET /api/messages/:id/thread`. | Only participants (or an admin) can read a thread, and only their own messages in it ([routes/messages.js#L147](../routes/messages.js#L147)). | *messages: only participants can read a thread* |
| 9 | AC-3 | Any doctor could cancel any appointment. | Doctors can only cancel their own ([routes/appointments.js#L257](../routes/appointments.js#L257)). | *appointments: an unassigned doctor cannot cancel...* |
| 10 | AC-3, AC-6; 164.312(c)(1) | **A patient could edit clinical fields** (`status`, doctor's `notes`) on their own appointment, because the route passed the request body straight through. | Patients may change only `date`, `time`, `reason` ([routes/appointments.js#L222](../routes/appointments.js#L222)). | *appointments: a patient cannot change clinical fields* |
| 11 | AC-6 (minimum necessary) | Doctor global search returned every patient in the system. | Doctors only find their own patients ([routes/dashboard.js#L116](../routes/dashboard.js#L116)). | *search: a doctor only finds their own patients* |
| 12 | IA-5 | Password-reset tokens were stored in plaintext. | Only a SHA-256 digest is stored ([models/User.js#L7](../models/User.js#L7)). | *stores only a SHA-256 digest of the reset token* |
| 13 | IA-5 | **Expired reset tokens kept working until midnight (UTC).** The expiry was saved as an ISO string (`2026-10-10T14:00:00Z`) and compared to SQLite's `datetime('now')` (`2026-10-10 15:00:00`). On the same date `'T' > ' '` always holds, so the check passed. | Compare ISO to ISO. | *rejects a reset token that expired earlier the same day* |
| 14 | IA-5, SI-11 | The reset token was returned in the API response in every environment ("DEV ONLY - remove in production"). | It is returned only when `NODE_ENV` is not `production` (there is no mail server in the demo). | *never returns the reset token when NODE_ENV=production* |
| 15 | IA-5, CM-6 | In production the app silently fell back to a hard-coded, published session secret, which would let anyone forge session cookies. | Startup fails in production without a unique `SESSION_SECRET` ([server.js#L67](../server.js#L67)). | *refuses to start in production without a session secret* |
| 16 | AU-9 | The audit log could be edited or deleted without anyone noticing. | Each row stores `hash = SHA-256(prev_hash ‖ row)`, `verifyAuditChain()` finds the first altered row, and SQLite triggers make the table append-only ([middleware/auth.js#L169](../middleware/auth.js#L169), [config/db.js#L41](../config/db.js#L41)). There is an admin endpoint, `GET /api/dashboard/admin/audit-log/verify`. | 4 tests in *AU-9 protection of audit information* |
| 17 | AU-2, AU-12 | Failed logins for unknown accounts, failed TOTP codes, and lab-result reads (PHI access) were not audited. | All three are now audited (`LOGIN_FAILED` with null user, `LOGIN_2FA_FAILED`, `VIEW_LAB_RESULTS`). | *audits failed logins for unknown accounts*, *a wrong TOTP code is rejected and audited*, *lab result reads are audited* |
| 18 | SC-18, SI-10 (defense in depth) | The Content-Security-Policy was disabled. | CSP enabled: scripts from self only, `object-src 'none'`, `frame-ancestors 'none'` ([server.js#L32](../server.js#L32)). The UI was checked in Chrome for both doctor and patient roles with no CSP console errors. | *sends a Content-Security-Policy that restricts script sources* |
| 19 | RA-5, SI-2 | `npm audit` reported 16 advisories (2 critical, 9 high), including critical `tar` reached through `connect-sqlite3` → native `sqlite3` → `node-gyp`. | Replaced `connect-sqlite3` with a small session store on the existing `better-sqlite3` connection ([config/sessionStore.js](../config/sessionStore.js)) and updated Express. **Production dependencies: 0 advisories.** CI now fails on any moderate-or-worse production advisory. | CI step `npm audit --omit=dev` (not a Jest test) |

**Count: 19 gaps fixed in code; 18 of them have a dedicated automated test, and #19 is enforced by CI.**

---

## 2. NIST SP 800-53 Rev. 5 mapping

### AC: Access Control

| Control | Status | How the code implements it | Evidence |
|---|---|---|---|
| AC-2 Account Management | Fixed (Oct 2026) | Roles fixed by a DB `CHECK` (`admin`/`doctor`/`patient`). Self-registration allowed only for patients; doctor accounts need admin activation. Admin can activate/deactivate accounts, and an inactive account cannot authenticate. | [config/db.js](../config/db.js) `users` table; [routes/auth.js#L45](../routes/auth.js#L45); [routes/dashboard.js#L192](../routes/dashboard.js#L192); [middleware/auth.js#L13](../middleware/auth.js#L13) |
| AC-2(4) Automated Audit Actions | Fixed (Oct 2026) | Account creation, pending approval, activation, deactivation, and lockout are written to the audit log. | `REGISTER`, `REGISTER_PENDING_APPROVAL`, `USER_ACTIVATED`, `USER_DEACTIVATED`, `ACCOUNT_LOCKED` |
| AC-3 Access Enforcement | Fixed (Oct 2026) | Two layers: `requireRole(...)` gates routes by role, and `hasPatientAccess` / `canAccessPatient` gate each patient record. Ownership checks on appointments, prescriptions, messages. | [middleware/auth.js#L52](../middleware/auth.js#L52), [#L72](../middleware/auth.js#L72), [#L88](../middleware/auth.js#L88) |
| AC-6 Least Privilege | Partial | Doctors see only their own patients (list, search, records, labs, billing, prescriptions). Patients see only themselves and cannot edit clinical fields. **Admins see everything, and there is no finer-grained admin role.** | [routes/patients.js#L14](../routes/patients.js#L14); [routes/appointments.js#L222](../routes/appointments.js#L222) |
| AC-7 Unsuccessful Logon Attempts | Fixed (Oct 2026) | Per account: 5 consecutive failures (password or TOTP) give a 15-minute lockout (configurable). Per IP: 5 attempts per 15 minutes on login, forgot-password, and reset-password. | [models/User.js#L129](../models/User.js#L129); [middleware/auth.js#L109](../middleware/auth.js#L109) |
| AC-8 System Use Notification | Gap | No login banner. | none |
| AC-12 Session Termination | Fixed (Oct 2026) | Inactive sessions are destroyed after 30 minutes (`SESSION_IDLE_TIMEOUT_MS`), with a hard cookie lifetime of 24 hours and a user-initiated logout that destroys the session. | [middleware/auth.js#L141](../middleware/auth.js#L141); [server.js](../server.js) cookie `maxAge` |

### IA: Identification and Authentication

| Control | Status | How the code implements it | Evidence |
|---|---|---|---|
| IA-2 Identification and Authentication | Implemented | Unique email per account (DB `UNIQUE`), bcrypt password check, server-side session. | [routes/auth.js](../routes/auth.js) `/login`; `tests/auth.test.js` |
| IA-2(1) / IA-2(2) MFA | Fixed (Oct 2026), Partial | TOTP (RFC 6238) via `speakeasy`, ±1 step window, enrolment by QR code, and disabling 2FA requires the password. **Enforced** once enabled, but **optional**, so privileged accounts (doctor/admin) are not required to enrol. | [routes/auth.js#L187](../routes/auth.js#L187), [#L287](../routes/auth.js#L287) |
| IA-5 Authenticator Management | Fixed (Oct 2026) | bcrypt with cost 12; reset tokens are 256-bit random, stored as SHA-256, expire in 1 hour, and are single-use; the server refuses the default session secret in production. | [models/User.js#L44](../models/User.js#L44), [#L7](../models/User.js#L7); [server.js#L67](../server.js#L67) |
| IA-5(1) Password-based Authentication | Partial | Minimum 8 characters with upper, lower, and a digit (`express-validator`). **No breached-password screening and no password history.** | [routes/auth.js#L25](../routes/auth.js#L25) |
| IA-6 Authentication Feedback | Implemented | The same "Invalid email or password." for unknown accounts and wrong passwords. Forgot-password always returns the same message. Deactivated-account status is revealed only after a correct password. | [routes/auth.js](../routes/auth.js) `/login`, `/forgot-password`; `tests/auth.test.js` *should not reveal if email exists* |
| IA-11 Re-authentication | Implemented | Changing the password or disabling 2FA requires the current password. | [routes/auth.js#L287](../routes/auth.js#L287), [#L381](../routes/auth.js#L381); `tests/auth.test.js` *should reject wrong current password* |

### AU: Audit and Accountability

| Control | Status | How the code implements it | Evidence |
|---|---|---|---|
| AU-2 Event Logging | Fixed (Oct 2026) | 36 distinct event types are logged: authentication (success, failure, 2FA, lockout, timeout, logout), account management, access denials, PHI reads (`VIEW_PATIENT_RECORDS`, `VIEW_LAB_RESULTS`), and every create/update/delete on appointments, prescriptions, labs, billing, and messages. | `grep -o "logAction(" routes middleware` |
| AU-3 Content of Audit Records | Implemented | Each record has the user (who), action (what), resource and resource id (on what), details, client IP (where), and a UTC ISO-8601 timestamp (when). The outcome is encoded in the action name (`LOGIN` vs `LOGIN_FAILED`). | [config/db.js](../config/db.js) `audit_log`; [middleware/auth.js#L193](../middleware/auth.js#L193) |
| AU-6 Audit Record Review, Analysis, and Reporting | Partial | Admin-only audit-log viewer, `GET /api/dashboard/admin/audit-log`. **No alerting, no automated review.** | [routes/dashboard.js#L219](../routes/dashboard.js#L219) |
| AU-8 Time Stamps | Implemented | Timestamps come from the server clock in UTC ISO-8601. | [middleware/auth.js#L193](../middleware/auth.js#L193) |
| AU-9 Protection of Audit Information | Fixed (Oct 2026), Partial | Append-only triggers, a SHA-256 hash chain with a verifier, and read access limited to admins. **Not tamper-proof:** someone with write access to the DB file can drop the triggers and recompute the whole chain. That needs an external anchor (see gaps). | [config/db.js#L41](../config/db.js#L41); [middleware/auth.js#L223](../middleware/auth.js#L223) |
| AU-11 Audit Record Retention | Gap | No retention or archival policy. Rows are kept indefinitely. | none |
| AU-12 Audit Record Generation | Implemented | A single `logAction()` helper is called from the routes and middleware. | [middleware/auth.js#L193](../middleware/auth.js#L193) |

### SC: System and Communications Protection

| Control | Status | How the code implements it | Evidence |
|---|---|---|---|
| SC-8 Transmission Confidentiality and Integrity | Partial | Session cookie is `Secure` in production and `HttpOnly` + `SameSite=Lax`; helmet sends `Strict-Transport-Security`. **The repo does not terminate TLS.** It must run behind an HTTPS reverse proxy, which is not included. | [server.js](../server.js) cookie options |
| SC-12 / SC-13 Cryptographic Key Establishment / Protection | Partial | Standard primitives only: bcrypt, SHA-256, HMAC-signed session cookies via `express-session`, and TOTP. The session secret comes from the environment. No key rotation. | [server.js#L67](../server.js#L67) |
| SC-18 Mobile Code (closest fit for CSP) | Fixed (Oct 2026), Partial | CSP allows scripts from self only. **Inline event-handler attributes are still allowed** (`script-src-attr 'unsafe-inline'`), because the UI uses `onclick=""`. | [server.js#L32](../server.js#L32) |
| SC-23 Session Authenticity | Fixed (Oct 2026) | Signed session cookie, a new session ID at login, and server-side session storage. | [routes/auth.js#L14](../routes/auth.js#L14); [config/sessionStore.js](../config/sessionStore.js) |
| SC-28 Protection of Information at Rest | Gap | SQLite stores PHI and TOTP secrets in plaintext. | none |

### Related controls outside the four families

| Control | Status | Notes |
|---|---|---|
| SI-10 Information Input Validation | Partial | `express-validator` on auth, appointments, messages, prescriptions; user-supplied values always go through parameterized SQL. Lab-result and billing bodies are not schema-validated. |
| SI-11 Error Handling | Implemented | Generic 500 message in production; stack traces only in development. |
| RA-5 / SI-2 Vulnerability scanning and flaw remediation | Fixed (Oct 2026) | `npm audit --omit=dev --audit-level=moderate` in CI; 0 production advisories at assessment time. |

---

## 3. HIPAA Security Rule technical safeguards (45 CFR 164.312)

R = required, A = addressable implementation specification.

| Safeguard | Status | What the code does | Related 800-53 |
|---|---|---|---|
| (a)(1) Access control (standard) | Fixed (Oct 2026) | Role gates and per-patient access checks on every PHI route; see AC-3 and AC-6. | AC-3, AC-6 |
| (a)(2)(i) Unique user identification (R) | Implemented | Unique email per user; every audit row carries the user id. | IA-2, AU-3 |
| (a)(2)(ii) Emergency access procedure (R) | Gap | No break-glass access path. | AC-2, CP family |
| (a)(2)(iii) Automatic logoff (A) | Fixed (Oct 2026) | 30-minute idle timeout that actually fires; 24-hour absolute cookie lifetime. | AC-12 |
| (a)(2)(iv) Encryption and decryption (A) | Gap | No encryption of PHI at rest. | SC-28 |
| (b) Audit controls (standard) | Fixed (Oct 2026), Partial | 36 audited event types including PHI reads; hash chain plus append-only table; admin viewer and verifier. No alerting or retention policy. | AU-2, AU-3, AU-9, AU-12 |
| (c)(1) Integrity (standard) | Partial | Patients cannot edit clinical fields; foreign keys and `CHECK` constraints; tamper evidence on the audit log only. | AC-3, SI-10 |
| (c)(2) Mechanism to authenticate ePHI (A) | Gap | No record-level hashing or versioning of clinical data. | SC-28, SI-7 |
| (d) Person or entity authentication (standard) | Fixed (Oct 2026), Partial | Password plus optional TOTP that is enforced once enabled, lockout, session regeneration. MFA is not mandatory for clinicians. | IA-2, IA-2(1), AC-7 |
| (e)(1) Transmission security (standard) | Partial | Secure cookie flags and HSTS header. TLS must be provided by the deployment; it is not in the repo. | SC-8 |
| (e)(2)(i) Integrity controls (A) | Partial | Relies on TLS at deployment. | SC-8 |
| (e)(2)(ii) Encryption (A) | Partial | Relies on TLS at deployment. | SC-8 |

---

## Remaining gaps

Listed so a reviewer does not have to find them. Rough effort in parentheses.

1. **No TLS termination in the repo** (SC-8, 164.312(e)). Deploy behind a reverse proxy with HTTPS and set `NODE_ENV=production` so cookies are `Secure`. (configuration)
2. **No encryption at rest** for PHI or TOTP secrets (SC-28, 164.312(a)(2)(iv)). Options: SQLCipher, or application-level field encryption with an external key. (1-2 days)
3. **MFA is optional** (IA-2(1)). Require TOTP enrolment for doctor and admin roles at first login. (half a day)
4. **The audit chain has no external anchor** (AU-9). Periodically publish the latest hash to a write-once store, or ship rows to a separate log service. No alerting (AU-6) and no retention policy (AU-11). Reads of the audit log itself are not audited, and list endpoints (`GET /api/appointments`, `GET /api/prescriptions`) are not audited as PHI reads.
5. **No emergency-access procedure** (164.312(a)(2)(ii)).
6. **No integrity mechanism for clinical records** beyond DB constraints (164.312(c)(2)).
7. **CSRF** relies on `SameSite=Lax` cookies plus JSON request bodies. There is no CSRF token. (half a day)
8. **CSP still allows inline event handlers.** Removing that means moving about 60 `onclick=""` attributes to `addEventListener`. (half a day)
9. **Password policy** has no breached-password check and no history (IA-5(1)), and changing or resetting a password does not revoke the user's other sessions.
10. **The rate limiter is in-memory**, so it is per-process and resets on restart. Account lockout is stored in the DB and is unaffected.
11. **In development, CORS reflects any origin with credentials** (disabled in production).
12. **Dev-only dependency advisories** remain in the Jest/nodemon toolchain (`braces`, `sprintf-js`, which have no fixed release). They do not ship to production.
13. **Out of scope for a code repo:** risk analysis, policies, workforce training, BAAs, contingency and backup (164.308/164.310 administrative and physical safeguards).
