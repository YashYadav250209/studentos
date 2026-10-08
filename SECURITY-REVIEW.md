# Orbis Security and Production-Readiness Audit

Read-only repository audit completed 2026-10-08. No application source or configuration was changed as part of the audit.

## Executive summary

Two medium-severity access-control weaknesses were verified in the tracked Supabase SQL: institute invitations can be accepted using an unverified JWT email, and existing institute access does not consult the entitlement's current status or expiry. Their exploitability depends in part on external Supabase Auth and billing configuration.

No credential-shaped secrets were found in tracked Git history. `.env.local` is ignored; its contents were not disclosed. The institute schema enables RLS and defines role-scoped access for tables it creates, but several frontend-used leaderboard and username objects have no definitions in the tracked SQL, so their controls could not be verified. The production build succeeded, while lint failed with 9 errors and 2 warnings.

## Findings

### 1. Invitation acceptance does not require a verified email

- **Severity:** MEDIUM
- **Confidence:** 8/10
- **Location:** `supabase-institute-schema.sql:319–330`; acceptance is initiated from `src/components/InstitutePortal.jsx:143`.
- **Why it matters:** `accept_institute_invitations()` checks authentication and the JWT email claim, then matches that email to a pending invitation. It does not check that the email is verified. The README documents email confirmation as optional (`README.md:15`). If the live Supabase project permits unconfirmed signups, an attacker can register with an invitee's address and claim the invitation's institute role.
- **Reproduction:** In a test project with email confirmation disabled, create a pending invitation for an address not controlled by the tester. Sign up with that address and load the Institute portal. Verify that the function inserts the caller as the invitee with the invitation's role.
- **Recommended fix:** Require and verify the authenticated email in the database function before accepting an invitation. Keep email confirmation enabled as an additional control; do not rely on frontend checks.

### 2. Existing institute access does not recheck entitlement status or expiry

- **Severity:** MEDIUM
- **Confidence:** 8/10
- **Location:** `supabase-institute-schema.sql:168–190, 353–355, 439–451`. Entitlement checks at institute creation are at `supabase-institute-schema.sql:288–295, 356–366`.
- **Why it matters:** Entitlement status and `valid_until` are checked when creating an institute, but the authorization helpers and RLS policies for subsequent institute and record access check membership, role, and module settings rather than current entitlement state. If expiry or cancellation is intended to revoke paid access, existing members may retain access.
- **Reproduction:** In a test project, give an owner an active entitlement and create an institute. Mark the entitlement canceled or advance `valid_until` into the past, then use an existing member account to query institute and record data directly. The membership-based policies continue to authorize access.
- **Recommended fix:** Define post-expiry behavior (for example, read-only grace period or suspension), and enforce it in the database authorization path. Do not use a mutable client-visible subscription field as the authorization source.

## Security and architecture observations

- The tracked institute SQL enables RLS and defines role-scoped database functions/policies for the tables it creates. Live migration state, grants, external policies, and Supabase Auth settings were not accessible for verification.
- The frontend uses `studentos_usernames`, `studentos_leaderboard`, `studentos_friends`, `studentos_classes`, and `sl_*` RPCs (including calls in `src/App.jsx:3630–3643, 4056–4102`), but the tracked SQL does not define them. Their schemas, RLS policies, grants, and authorization behavior must be audited at their actual source before production approval.
- The client supplies XP and plan-related values in parts of the application. Treat these values as untrusted; authoritative score and entitlement decisions should be enforced by a trusted backend or database policy.
- The owner-email configuration is client-exposed and described as a demo UI gate in the sample environment configuration. It must not be used as an authorization boundary.
- No raw HTML insertion or user-controlled redirect sink was identified in the inspected React code. React-rendered values receive normal escaping.
- Whole-JSON profile, XP, and study-data writes do not show an evident write queue or version check. Concurrent tabs or rapid updates could overwrite newer values; verify and move critical updates to atomic server-side operations.

## Production checks

- `npm run build` succeeded. Vite reported a 647.17 kB minified JavaScript chunk (182.49 kB gzip), above its 500 kB warning threshold.
- `npm run lint` failed with 9 errors and 2 warnings, including unused imports and React Hooks/immutability rule violations.
- `package.json` has no test or type-check script, and no test suite or TypeScript configuration was found.
- `npm ls --depth=0` completed with declared dependencies installed. The lockfile pins resolved versions with integrity hashes. No network-based advisory audit was run.
- No CI workflow or deployment configuration is tracked. Hosting-level security headers, CSP, and deployment controls remain unverified.

## Prioritized actions

1. Require a verified email before accepting institute invitations.
2. Define and enforce the access behavior for canceled and expired institute entitlements.
3. Locate and audit the source migrations and policies for username, leaderboard, friend, class, and `sl_*` database objects.
4. Enforce XP, plan, and other security-sensitive state on the server/database rather than trusting client writes.
5. Fix lint failures and add automated tests for invitation acceptance, tenant isolation, role boundaries, and entitlement expiry.

## Recommended follow-up

- Add CI checks for lint, tests, and production builds.
- Test direct database/API calls as each role (admin, teacher, student, parent), not only UI access.
- Make billing and membership transitions atomic and consistent with the documented expiry policy.
- Track all Supabase schemas, functions, grants, and RLS policies as reviewable migrations.
- Define data retention and access behavior after cancellation, membership removal, and account deletion.
- Split the oversized JavaScript bundle using route- or feature-level code splitting.
- Configure deployment security headers, including a tested CSP, once the production host is known.
