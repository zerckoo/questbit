# Security Patch Notes

Date: 2026-10-18

## Fixed

- Blocked self-assigned privileged roles during first account creation by validating the initial user profile in Firestore rules.
- Restricted raw user-profile reads to the profile owner and moderators. Public leaderboard/display fields are exposed separately through `publicProfiles`.
- Added a Cloud Function to synchronize an explicit allowlist of leaderboard fields into `publicProfiles`; client synchronization is also constrained to values matching the caller's own profile.
- Restricted public quest reads to published quest documents and updated public board queries to request only published quests.
- Restricted quest creation and updates to special admins/owners, and deletion to owners; unrestricted user-record updates are owner-only.
- Bound moderator actions to other users, constrained reward and moderation writes, denied self-review, and limited resolved queue deletion.
- Validated proof submissions against the caller's queue identity and their own quest record, including field allowlists, one queue ID per user/quest, and length limits.
- Enforced the fixed username-change coin debit, username format, and cooldown in Firestore rules.
- Limited proof-image reads to the owner and moderators; uploads must belong to the caller, be under 5 MB, and use JPEG, PNG, WebP, or GIF content types.
- Escaped stored quest and notification text before inserting it into HTML, removed quest IDs from inline click handlers, and rendered quest descriptions as text.
- Built notification UI from DOM elements and `textContent` to remove stored notification HTML injection.
- Allowed only HTTPS profile-photo URLs when setting CSS backgrounds.
- Added Firebase Hosting security headers and excluded backend, Functions, rules, and selected configuration files from Hosting's public output.
- Added a Firestore index for published quests ordered by creation time.
- Applied compatible dependency updates in `backend/package-lock.json` and `functions/package-lock.json`.
- Replaced database error interpolation into HTML with text rendering.

## Validation

- Node syntax checks and Firebase JSON parsing passed for the changed source/config files.
- Functions ESLint passed.
- Backend `npm audit` reported zero vulnerabilities after updates.
- Functions `npm audit` still reports 29 moderate advisories, including transitive runtime and development/test dependencies. The available remediation required a forced major upgrade; it was not applied.
- Workspace diagnostics report no errors in the changed rules, source, and configuration files.
- Firebase CLI could not authenticate in this environment. Firestore/Storage rules and indexes were not deployed or tested against the live project or emulator.

## Before Release

Deploy and verify the Firestore rules, Storage rules, indexes, and Cloud Function together. The public leaderboard requires the `syncPublicProfile` trigger; rules allow existing users to populate their own restricted projection on sign-in while the trigger is deployed. Review the remaining Functions dependency advisories before release.
