# Interview guide: HealthBridge security assessment

Plain-English notes so I can explain every part of this repo. The evidence is in
[CONTROL_MAPPING.md](CONTROL_MAPPING.md) and `tests/security.test.js`.

## The 30-second version

"HealthBridge is a patient portal from a MIST 4610 group project. After the class I self-assessed the code
against NIST 800-53 (access control, identification and authentication, audit, system and communications
protection) and the HIPAA Security Rule's technical safeguards. I found 19 real gaps, including an MFA
bypass and doctors being able to read any patient's lab results. I fixed them with tests that fail on the
old code, 29 of 34. I also wrote down what's still missing, like encryption at rest and TLS. It's a class
project, not a HIPAA-compliant system, and the mapping says so."

## Key concepts

- **NIST SP 800-53** is a catalog of security controls, grouped into families: AC (access control),
  IA (identification and authentication), AU (audit), SC (system and communications protection), and others.
  An assessment asks, for each control, "is it implemented, and what is the evidence?"
- **HIPAA Security Rule, 164.312** lists the *technical* safeguards for electronic PHI: access control,
  audit controls, integrity, person/entity authentication, and transmission security. "Required" specs must
  be implemented. "Addressable" ones must be implemented if reasonable, or the alternative documented.
- **RBAC vs object-level authorization.** RBAC answers "can a *doctor* call this route?" Object-level
  authorization answers "can *this* doctor see *this* patient?" The original code had the first and was
  missing the second. That is OWASP API Top 10 #1, Broken Object Level Authorization.
- **TOTP (RFC 6238).** The server and the authenticator app share a secret. Each computes an HMAC of the
  current 30-second time step and shows 6 digits. The server accepts ±1 step to allow for clock drift.
- **Session fixation.** If the session ID doesn't change at login, an attacker who planted an ID in the
  victim's browser before login can use it afterwards. The fix is to issue a new ID at login
  (`req.session.regenerate`).
- **Hash chain.** Each audit row stores `SHA-256(previous row's hash + this row's content)`. Changing any
  old row changes its hash, which no longer matches the next row's `prev_hash`, so the verifier finds the
  first altered row.

## Walkthrough of the most interesting fixes

1. **MFA bypass (IA-2(1)).** Login set `session.userId` *before* the TOTP step, and the auth middleware only
   checked `userId`. The function that checked "2FA verified" existed but no route used it. Fix: the auth
   middleware itself refuses sessions where 2FA is enabled but not verified. Lesson: a control that exists
   but isn't wired in is the most common real-world gap.
2. **Doctors reading any patient's data (AC-3).** Routes used `requireRole('doctor')` but never asked
   "is this *your* patient?". Fix: one function, `hasPatientAccess`, applied everywhere. A single rule
   means one place to review and test.
3. **Idle timeout that never fired (AC-12).** It set `lastActivity = now`, then checked
   `now - lastActivity > 30 min`, which is always 0. Fix: compare first, then update. The test fakes the
   clock (`Date.now`) to jump 31 minutes ahead.
4. **Expired reset tokens working (IA-5).** JavaScript stored `2026-10-10T14:00:00Z`, and SQLite compared it
   to `2026-10-10 15:00:00`. As text, `T` sorts after a space, so a token from earlier today always looked
   "later" than now. Fix: compare ISO strings to ISO strings. Lesson: string comparison of dates only works
   when the formats match exactly.
5. **Critical npm advisories (RA-5).** They all came through `connect-sqlite3`, which pulled in a second,
   native SQLite driver. I replaced it with a ~80-line session store on the driver the app already used,
   which removed the dependency instead of just patching it.

## Likely questions and answers

- **"Is it HIPAA compliant?"** No. HIPAA also requires administrative and physical safeguards, a risk
  analysis, policies, BAAs, and an operated environment. And even technically, the code still lacks
  encryption at rest and TLS. What I can show is a mapped, tested set of technical controls and an honest
  gap list.
- **"What would you fix next?"** Encryption at rest (SQLCipher or field-level), requiring MFA for
  clinicians, and anchoring the audit chain somewhere external, because someone who can write to the DB file
  can recompute the whole chain.
- **"Why is the hash chain not enough?"** It is *tamper-evident*, not *tamper-proof*. The append-only
  triggers stop the app from editing rows, but a DB administrator can drop them. Publishing the latest hash
  to a write-once location regularly would make rewriting history detectable.
- **"How do you know your tests test the fix?"** I ran the new tests against the original commit in a
  separate git worktree: 29 of 34 failed, and the 5 that passed check behavior that was already correct.
- **"What was your role in the original project?"** It was a team project for MIST 4610. I published the
  repo and did the post-course security assessment and fixes myself.
  *(Ali: answer the original team-role part from memory. Be exact.)*
- **"Why SQLite?"** It's a single file with zero setup, and WAL mode lets reads run during writes. That was
  enough for a class demo and for CI. For production, a server database with encryption at rest and proper
  backups.

## Limitations to state up front

Fictional data; never deployed; no TLS in the repo; no encryption at rest; MFA optional; CSP still allows
inline handlers; in-memory IP rate limiter; CSRF protection relies on SameSite cookies.
