# Security Implementation

This document describes controls implemented in this repository. Firebase security rules are the enforcement boundary for client SDK requests; browser-side checks and hidden UI controls are not treated as authorization.

## Authentication and Authorization

- Authentication uses Firebase Authentication with Google sign-in.
- Firestore role checks use the caller's stored user profile. Initial self-created profiles are restricted to the player role, one role only, zero starting rewards/progression, and an allowlisted field set.
- User documents are readable only by their owner and moderators. Public leaderboard data is kept in `publicProfiles`, which excludes email, role, coins, and other account fields.
- Public profile writes are restricted to a fixed field set whose values must match the caller's own user record. A trusted Firestore trigger mirrors the same allowlist.
- Quest creation and editing require special-admin-or-owner privileges; deleting quests requires owner privileges. Public quest reads require publication, while privileged staff can also read drafts.
- Unrestricted user-document changes, including role assignment, are owner-only. Narrow update rules govern profile edits, moderation fields, and reward fields.
- Moderators cannot moderate themselves. Queue review changes are limited to review metadata and supported verdicts; queue creation is bound to the submitter and a matching user quest record.
- Username changes that debit currency are allowed only for the owner, with the required format, cooldown, unchanged earned-currency total, and an exact 1000-coin debit.
- Site-setting writes require admin-or-higher privileges. User-owned notifications and subcollections are scoped to their owner, with moderator access only where needed.

## Data Exposure and Rendering

- Public leaderboard queries read only the sanitized `publicProfiles` projection.
- Stored quest and notification text is escaped before HTML insertion or assigned with `textContent`.
- Quest image URLs are limited to HTTPS or same-origin HTTP URLs; profile-photo URLs used in CSS backgrounds must use HTTPS.
- Firebase Hosting excludes the backend and Functions source, rules, and selected configuration files from its static public output.
- Hosting sends HSTS, MIME-sniffing, frame, referrer, and permissions policy headers.

## File Uploads

- Storage is deny-by-default except for `/proofs/{userId}/{fileName}`.
- Uploads require authentication, ownership of the path, a size below 5 MB, and an allowed raster image content type (JPEG, PNG, WebP, or GIF).
- Proof reads/deletes are limited to the owner or moderator-and-higher accounts.

## Dependencies and Configuration

- Backend dependency lockfile was updated with compatible fixes; `npm audit` reports no backend advisories.
- Functions lockfile was updated with compatible fixes. `npm audit` still reports moderate transitive/development advisories that would require forced breaking upgrades.
- The Firebase web API key in `js/firebase.js` is a public client identifier, not an authorization secret; access depends on Firebase Auth and security rules. Do not put service-account credentials or private API keys in browser files.

## Security Boundaries and Remaining Work

- These repository changes do not take effect in production until Firestore rules, Storage rules, indexes, and Functions are deployed. No deployment was performed during this audit.
- Live rules compilation/emulator testing was unavailable because Firebase CLI authentication was not configured in this environment.
- Rewards and moderation workflows still use client-side Firebase SDK calls. Firestore rules prevent ordinary users from changing protected reward fields and prevent self-review, but privileged moderator accounts remain trusted actors. A server-side transactional reward/verdict service is the stronger long-term boundary for preventing forged submissions, duplicate processing, and partial updates.
- The existing site uses inline scripts/styles and several third-party CDN resources. A restrictive Content Security Policy was not added because it would require a coordinated migration away from inline execution and a complete source inventory.
- Functions retain 29 moderate dependency audit findings. Review and update the Functions runtime/test dependency chain before a production security sign-off.
- No rules unit-test suite or browser penetration test is currently configured. Add Firebase Emulator tests for role escalation, cross-user reads/writes, quest publication, proof access, and moderation workflows before treating the deployment as independently verified.
