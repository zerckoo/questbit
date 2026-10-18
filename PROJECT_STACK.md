# Side Quest Website — Project Stack and Tool Inventory

This document records the languages, frameworks, services, libraries, tools, project areas, and runtime conventions currently present in the repository.

## Project shape

Side Quest is a browser-based quest/game website with player, moderation, administration, rankings, rewards, achievements, streaks, and AI-assisted proof verification features.

The repository contains three main runtime areas:

1. A static browser application served by Firebase Hosting.
2. A small Node.js/Express backend in `backend/`.
3. Firebase Cloud Functions in `functions/`.

There is no root `package.json`. Node dependencies are managed independently in `backend/` and `functions/`.

## Languages and web standards

- HTML5 — page structure, forms, modals, navigation, and inline page behavior.
- CSS3 — styling and responsive/layout rules. Stylesheets are in `css/`; some page styles are inline in the HTML files.
- JavaScript — browser behavior, Firebase client calls, game logic, UI rendering, and server-side Node.js code.
- JavaScript ES modules — browser modules loaded with `type="module"` and local `import`/`export` statements.
- CommonJS — Node.js backend and Cloud Functions files using `require()` and `exports`.
- JSON — Firebase configuration, package manifests/lockfiles, Firestore indexes, and project metadata.
- Firebase Security Rules — Firestore rules in `firestore.rules` and Storage rules in `storage.rules`.
- Markdown — project guides and security/deployment notes.

## Frontend

### Core approach

- Vanilla JavaScript; no frontend framework is installed.
- Native HTML pages; no React, Vue, Angular, Svelte, or build/bundler pipeline is configured.
- Native browser APIs including `fetch`, `URL`, `localStorage`, DOM APIs, file/image handling, and event listeners.
- Client-side routing is implemented through page navigation and shared route helpers rather than a router package.
- UI is rendered with HTML templates and DOM updates.
- Google Fonts CDN, using the `Silkscreen` font for the pixel/game aesthetic.

### Firebase Web SDK

The browser loads Firebase Web SDK v12.0.0 directly from `https://www.gstatic.com/firebasejs/12.0.0/`:

- `firebase-app.js` — app initialization.
- `firebase-auth.js` — authentication state and Google sign-in.
- `firebase-firestore.js` — database reads, writes, queries, and realtime listeners.
- `firebase-storage.js` — proof-image upload, download, and deletion.

The shared Firebase client setup is in `js/firebase.js`. It exports `auth`, `db`, and `storage`.

### Browser pages

- `main.html` — home/featured quest experience.
- `quests.html` — quest board, journal, quest acceptance, completion, and proof submission.
- `rankings.html` — public rankings/leaderboards.
- `settings.html` — profile and username settings.
- `world.html` — world/biome experience.
- `store.html` — store experience.
- `box.html` — box/reward experience.
- `admin.html` — administrator dashboard.
- `moderator.html` — moderation queue and user moderation tools.
- `owner.html` — owner-level role and administration tools.
- `profile.html` — currently empty placeholder page.
- `index.html` — entry/redirect page.
- `fbindex.html` — additional Firebase-related HTML page.
- `404.html` — Firebase Hosting not-found page.

### Browser modules

- `js/firebase.js` — Firebase app, Auth, Firestore, and Storage initialization.
- `js/auth.js` — Google authentication, auth state, user profiles, roles, navigation profile, and route helpers.
- `js/main.js` — home page quest loading, featured quests, saved quests, and home interactions.
- `js/quests.js` — quest board, filters, journal, quest lifecycle, proof handling, AI verification calls, rewards, and Storage uploads.
- `js/rankings.js` — public profile leaderboard queries and ranking display.
- `js/settings.js` — display name and username settings.
- `js/admin.js` — administrative site/user controls.
- `js/moderator.js` — proof review, moderation actions, penalties, activity logs, and user management.
- `js/owner.js` — owner-only role management.
- `js/adjustUser.js` — privileged user adjustment tools.
- `js/notifications.js` — user notification creation, loading, and read state.
- `js/achievements.js` — achievement checks and awards.
- `js/streak.js` — daily streak activation and rewards.
- `js/xpSystem.js` — XP progression, levels, progress calculations, and level-up UI.
- `js/gameBalance.js` — game economy/progression balance values.
- `js/periods.js` — daily, weekly, monthly, and yearly XP period calculations.
- `js/nocopy.js` — client-side copy/context-menu deterrence.
- `js/profile.js` — currently empty placeholder module.

### Frontend styles and assets

- `css/main.css` — main styles file; currently empty in the repository snapshot.
- `css/quests.css` — quest styles file; currently empty in the repository snapshot.
- `css/admin.css` — admin styles file; currently empty in the repository snapshot.
- `Images/` — raster image assets such as `.jfif` files.
- `Icons/` — PNG/JPEG/JFIF icon assets.
- Inline styles are also present in several HTML pages.

## Backend and server-side JavaScript

### `backend/`

The backend is a separate Node.js application using CommonJS modules:

- Node.js runtime.
- Express `5.2.1` — HTTP server framework.
- CORS `2.8.6` — cross-origin request middleware.
- dotenv `17.4.2` — environment-variable loading dependency.
- Firebase Admin `14.2.0` — server-side Firebase administration dependency.
- Multer `2.2.0` — multipart/file-upload dependency.
- `@google/genai` `2.13.0` — Google Gemini/Generative AI SDK dependency.

Current files:

- `backend/server.js` — minimal Express server, CORS middleware, JSON parsing, health response, and port binding. It defaults to port `3000`.
- `backend/package.json` and `backend/package-lock.json` — backend dependency manifest and lockfile.
- `backend/firebase.js` — currently empty placeholder.
- `backend/gemini.js` — currently empty placeholder.
- `backend/verifyQuest.js` — currently empty placeholder.
- `backend/rewards.js` — currently empty placeholder.

The repository also contains `backend/` in the Firebase Hosting ignore list, so backend source is not intended to be served as public static content.

## Firebase Cloud Functions

### `functions/`

Cloud Functions use Node.js `22` and Firebase Functions v2 APIs:

- Firebase Functions `7.0.0` — HTTPS and Firestore triggers.
- Firebase Admin `13.6.0` — trusted server-side Firebase access.
- `@google/genai` `2.13.0` — installed for AI-related server functionality.
- ESLint `8.15.0` — linting.
- `eslint-config-google` `0.14.0` — Google JavaScript style rules.
- `firebase-functions-test` `3.4.1` — test helper dependency.

Functions currently exported by `functions/index.js`:

- `helloWorld` — HTTPS function returning a basic response.
- `syncPublicProfile` — Firestore `onDocumentWritten` trigger that mirrors approved/sanitized profile fields from `users/{userId}` into `publicProfiles/{userId}` and removes the public profile when the source user document is deleted.

Available Functions scripts:

- `npm run lint` — run ESLint.
- `npm run serve` — start the Functions emulator.
- `npm run shell` / `npm start` — open the Functions shell.
- `npm run deploy` — deploy Functions only.
- `npm run logs` — view Firebase Functions logs.

## Firebase services and configuration

Firebase project:

- Project ID: `side-quest-website-850fd`
- Hosting: configured in `firebase.json` with the repository root (`.`) as the public directory.
- Firestore: configured with `firestore.rules` and `firestore.indexes.json`.
- Cloud Storage: configured with `storage.rules`.
- Cloud Functions: source directory is `functions/` with Node.js 22.
- Firebase Authentication: Google provider is used by the browser client.

Firebase configuration files:

- `.firebaserc` — selects the default Firebase project.
- `firebase.json` — Hosting, Firestore, Storage, Functions, deploy ignores, rewrites, headers, and predeploy linting.
- `firestore.rules` — database authentication/authorization and field-level security rules.
- `firestore.indexes.json` — Firestore composite index definitions.
- `storage.rules` — Storage path, ownership, size, and content-type rules.
- `keys.txt` — local key/configuration file; do not commit secrets or expose private credentials.
- `skills-lock.json` — Firebase agent-skill lock metadata, not an application runtime dependency.

Hosting behavior:

- `/` rewrites to `/main.html`.
- Static hosting excludes backend and Functions source, `node_modules`, Firebase rules/configuration files, selected documentation, and local key files.
- Security headers include HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.

## Main data and feature domains

The client and rules reference these primary Firebase data areas:

- `users` — private user profiles, roles, progression, coins, streaks, and account state.
- `publicProfiles` — sanitized profile projection used for public rankings.
- `quests` — quest definitions and publication state.
- `users/{userId}/userQuests` — each user’s saved, active, completed, and submitted quests.
- `users/{userId}/notifications` — user-owned notifications.
- `modQueue` — quest proof submissions awaiting moderation.
- `modActivityLog` — moderation audit records.
- Site settings — admin-controlled feature toggles such as proof image storage.
- Firebase Storage proof paths — `/proofs/{userId}/{fileName}`.

Game systems implemented in JavaScript include XP and level progression, daily/weekly/monthly/yearly XP, coins/rewards, quest completion, proof submissions, moderation verdicts, achievements, streaks, rankings, notifications, saved quests, and role-based admin tools.

## AI and quest verification

- `@google/genai` is declared in both Node dependency manifests.
- The quest frontend calls a `/verify` endpoint for AI-assisted proof verification when AI mode is selected.
- AI proof mode can upload an image to Firebase Storage so a server-side verifier can access it.
- The backend AI/verification source files are currently empty placeholders in this repository snapshot, so the deployed `/verify` implementation should be verified separately before relying on it.

## Developer tools and deployment commands

Required/expected tools:

- Node.js and npm — install and run backend/Functions dependencies.
- Firebase CLI — local emulators, deployment, logs, and Functions shell.
- Google Cloud SDK / `gsutil` — documented in `CORS_SETUP.md` for Firebase Storage CORS configuration.
- A local static web server — useful for browser development; the CORS guide references `http://127.0.0.1:5500`.
- Git — repository version control.
- Browser developer tools — frontend debugging and Firebase status checks.

Typical commands:

```powershell
# Backend
cd backend
npm install
node server.js

# Cloud Functions
cd functions
npm install
npm run lint
npm run serve

# Firebase deployment from the repository root
firebase deploy
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Security and operational notes

- Firebase Auth and Firebase Security Rules are the primary authorization boundary.
- Browser-side role checks and hidden UI controls are convenience checks, not sufficient authorization.
- Proof uploads are restricted by Storage rules to authenticated owners, allowed image types, and a size below 5 MB.
- User-facing text and external image URLs have sanitization/validation logic documented in `SECURITY_IMPLEMENTATION.md`.
- `CORS_SETUP.md` documents local and production Storage CORS configuration.
- `SECURITY_IMPLEMENTATION.md` and `PATCH_NOTES_SECURITY.md` describe the current security work and remaining hardening items.
- No frontend build step, automated browser test suite, or root test script is configured.
- `venv/` exists in the repository, but no Python source or Python dependency manifest was found in the project inventory; it is not currently identified as an application runtime.

## Dependency summary

| Area | Runtime/tooling | Dependency source |
|---|---|---|
| Browser | Native HTML/CSS/JavaScript ES modules | Firebase Web SDK v12 CDN imports and browser APIs |
| Backend | Node.js + Express | `backend/package.json` and lockfile |
| Cloud Functions | Node.js 22 + Firebase Functions v2 | `functions/package.json` and lockfile |
| Database | Cloud Firestore | Firebase client/Admin SDK, rules, indexes |
| Authentication | Firebase Authentication with Google provider | Firebase Web SDK |
| Files | Firebase Cloud Storage | Firebase Web SDK and Storage rules |
| Hosting | Firebase Hosting | `firebase.json` |
| AI dependency | Google GenAI SDK | `@google/genai` in backend and Functions manifests |
| Linting | ESLint with Google config | Functions devDependencies |
| Local Storage CORS | Google Cloud SDK / `gsutil` | Documented setup tool |

## Source of truth

This inventory is based on the files currently present in the repository, especially `package.json` files, lockfiles, JavaScript imports, HTML script tags, Firebase configuration, rules, and existing security documentation. Update this file when adding a framework, package, external CDN, Firebase service, build tool, or runtime.
