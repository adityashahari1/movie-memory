# Movie Memory

Foundation: Next.js App Router, TypeScript, React, TailwindCSS, npm, Prisma 7 with PostgreSQL, Auth.js v5 Google authentication, and the official Google GenAI SDK.

**Provider deviation:** The assignment requires OpenAI. At the user's explicit request, this implementation uses Gemini's Free Tier instead. This does not meet the specified OpenAI integration unless the assignment owner accepts the substitution; REQUIREMENTS.md preserves the original requirements.

## Prerequisites

- Node.js 24.22.2 (recorded in `.nvmrc`; the project requires Node 24.x)
- npm 11.19.1

Select the pinned version with your Node version manager before running npm commands. For the Homebrew `node@24` installation, activate Node 24 in the current terminal:

```sh
export PATH="$(brew --prefix node@24)/bin:$PATH"
node --version
```

## Local development

```sh
npm ci
cp -n .env.example .env
```

Set `DATABASE_URL` in the ignored `.env` file to your development PostgreSQL connection string. Keep the provider's required TLS settings. The example contains placeholders only; do not commit actual credentials. Next.js loads `.env` for the application, and `prisma.config.ts` explicitly loads it for Prisma commands.

Apply the committed migration and start the app:

```sh
npx --no-install prisma migrate deploy
npm run dev
```

Use `http://localhost:3000` for local authentication so the origin matches the registered Google callback. Configure the Google credentials below before attempting sign-in.

## Google authentication

Auth.js v5 (`next-auth` 5.0.0-beta.32) and `@auth/prisma-adapter` 2.11.3 use the existing Prisma client and database sessions. Only Google is enabled. The root page shows the sign-in control when logged out and routes authenticated users according to their persisted favoriteMovie. Onboarding saves the initial movie; the dashboard displays the stored Google profile and movie. Both provide Logout.

Configure these names in the ignored `.env` file, never with a `NEXT_PUBLIC_` prefix:

- `AUTH_GOOGLE_ID`: the Google OAuth client ID.
- `AUTH_GOOGLE_SECRET`: the Google OAuth client secret.
- `AUTH_SECRET`: a private random application secret, separate from Google's credentials.
- `AUTH_URL=http://localhost:3000`: the canonical local URL.

Generate an application secret locally with `openssl rand -base64 32` and save it only in `.env`. Do not share its output or commit it.

In [Google Cloud Console](https://console.cloud.google.com/auth/clients):

1. Select/create the project and configure Google Auth Platform branding and audience. Add your test account if using External/Testing.
2. Create an OAuth client with application type **Web application**.
3. Register the authorized redirect URI **http://localhost:3000/api/auth/callback/google**.
4. This server-side OAuth flow does not need an authorized JavaScript origin. If one is entered, use **http://localhost:3000**.
5. Copy the client ID and secret into the corresponding private environment variables above. Keep the existing DATABASE_URL.

Auth.js handles callback processing, cookies, Google identity, and session creation/deletion. The session callback explicitly returns only application User.id, profile fields, and expiry. The server-only `getCurrentUser()` helper resolves the database user by that validated ID; it accepts no browser-supplied identity.

### Live authentication verification

Compilation alone does not verify OAuth. After credentials are configured:

1. Run `npm run dev` and open http://localhost:3000.
2. Choose **Sign in with Google** and complete the real Google round trip.
3. Verify User, Google Account, and Session records; compare User.id with authenticated `/api/auth/session`.
4. Submit `   The Matrix   ` during first-time onboarding; verify favoriteMovie is stored as `The Matrix` and no MovieFact records were created.
5. Choose Logout; verify the page is unauthenticated and that session no longer exists.
6. Sign in again with the same Google account; verify the same application User.id is reused, no duplicate user/account is created, and the saved movie routes the user to `/dashboard`.
7. Inspect authenticated `/api/auth/session` JSON and browser assets for exposed credentials or raw session/provider tokens.

Stages 3 and 4 were confirmed complete before onboarding implementation. Stage 5 terminal checks pass. The user confirmed browser validation, submission of the padded movie title, refresh, logout, and returning login; database verification confirms the same user has `The Matrix` saved and no facts were created.

## Authentication and onboarding routing

Every page uses the existing server-only getCurrentUser() helper. The validated application User.id resolves the current database user; favoriteMovie being null is the onboarding-completion indicator. No query parameter, browser state, or separate completion field determines access.

| State | `/` | `/onboarding` | `/dashboard` |
|---|---|---|---|
| Logged out | Landing | Redirect `/` | Redirect `/` |
| Signed in, favoriteMovie null | Redirect `/onboarding` | Movie form | Redirect `/onboarding` |
| Signed in, favoriteMovie present | Redirect `/dashboard` | Redirect `/dashboard` | Dashboard |

All nine routing cases passed in Stage 4. Stage 5 checks confirm that a successful save redirects to `/dashboard` and subsequent visits to `/` or `/onboarding` redirect there.

## Onboarding

The server-only validator rejects non-string and empty input, trims surrounding whitespace, and enforces a length of 1-200. Case and internal whitespace are preserved; no movie catalog is queried. The form displays validation errors and disables its submit button with `Saving...` feedback while pending.

Every submission authenticates again. One conditional Prisma update matches the validated application User.id and favoriteMovie being null. This prevents another tab or a repeated request from overwriting the initial choice. Both successful and already-completed submissions go to `/dashboard`; unexpected database errors return a generic friendly message. Route state is refreshed after a successful save.

`npm test` uses Node 24's built-in test runner: nine validator tests and twenty-seven fact-workflow tests. Fact tests use a controllable clock and a query-filtering fact fixture, stub generation and persistence, make no provider API calls, and need no live database. Onboarding terminal checks also exercised unauthenticated and invalid requests, tampered ownership fields, a canceled test database write, and two overlapping submissions. The test user's movie was temporarily reset between onboarding tests; no User, Account, or MovieFact was created by onboarding.

## Dashboard

The dashboard is a Server Component. It reuses getCurrentUser() to validate the session, resolve the application User.id, and read the stored Google name, email, photo URL, and favorite movie from PostgreSQL. Browser-supplied ownership or movie values do not control the page.

A missing name displays `Signed-in user`; a missing photo is omitted. The optional photo uses a standard HTML image with alt text and fixed dimensions. An unexpectedly missing email displays a profile error and logs a message without personal data. Logout uses the existing Auth.js server action.

Stage 6 terminal checks passed for normal fields, repeated requests, missing name/photo/email, incomplete onboarding, query-parameter tampering, and unauthenticated access. Temporary edits affected only the test user; the original name, email, image, and `The Matrix` were restored. Logout invalidation and Google sign-in initiation also passed. The user confirmed the browser fields/photo, refresh, logout, protected-route redirect, and re-login. Final database verification confirms the same User and Google Account, one active Session, the original profile with `The Matrix`, and zero MovieFacts.

## Movie facts — Stage 7

Create a key in [Google AI Studio](https://aistudio.google.com/apikey) using a Free Tier project. Set GEMINI_API_KEY only in the ignored `.env`; `.env.example` contains an empty placeholder. The server-only integration uses @google/genai 3.0.0 and the supported non-streaming generateContent API with gemini-3.1-flash-lite. D003/D010 record the 30-second timeout, one total attempt (no retries), minimal thinking, and 300-token output cap. Fixed system instructions are separate from the JSON-encoded movie title; Google profile and session data are not sent. Free-tier access depends on project eligibility and quotas; no billing configuration is changed.

The small client fact panel requests a fact through a Server Action when mounted. The action independently authenticates, reads the stored movie, generates nonempty text, and awaits MovieFact insertion before returning a safe DTO. The timestamp records successful generation completion. Loading and friendly errors stay within the panel; text uses ordinary React escaping.

Before Stage 8, every Stage 7 invocation generated and inserted a new fact. Rendering or prefetching the dashboard does not generate facts. Refreshing the page mounts the panel and requests a fact; Stage 8 adds the cache policy below.

Seventeen automated tests, typecheck, production build, development smoke check, and security checks pass. One authenticated terminal request and one user-confirmed browser visit generated two distinct persisted Gemini facts for the same user and `The Matrix`, with nonempty text and timestamps. Rendering/prefetching and unauthenticated action calls do not create facts. Browser verification uses the production build on port 3000; development mode is smoke-checked separately because React development effects may replay. Both generated facts are retained.

## Movie facts — Stage 8 cache

Every fact request still independently authenticates and reads the user's persisted favorite movie. Before generating, the server queries one MovieFact using `findFirst`, matching the validated application User.id and exact stored movie, ordered by generatedAt descending. The existing composite index supports this lookup; Postgres rows are the cache.

Age is the current server time minus generatedAt in milliseconds. A fact is fresh below 60,000 ms and expired at 60,000 ms or above. A fresh hit returns the original id, movie, text, and timestamp without calling Gemini or writing anything. There is no sliding expiration. An expired or missing fact follows the existing generate, validate, timestamp, persist, and return path; earlier facts remain intact.

The 25 automated tests cover 59,999 ms reuse, exact 60,000 ms expiry, ordinary fresh/expired cases, latest matching lookup, user/movie isolation, sequential reuse, timestamp preservation, and existing safe errors. Time is injected rather than tested with real waits. The query fixture exercises lookup criteria; it does not replace live database/browser verification.

Stage 8 browser verification passed. The user requested a fact after expiry, then refreshed within 10 seconds; both requests displayed a fact. Read-only database verification found exactly one new row (6 to 7), generated 152.071 seconds after the previous fact. All six earlier rows retained their IDs, movies, text, and generatedAt values. No test timestamps were adjusted, and all legitimate facts were retained.

Stage 8 did not coordinate overlapping misses; Stage 9 adds that protection below. Stale fallback remains deferred. If regeneration fails, the existing friendly error is returned even when an expired fact exists. The Gemini integration and provider-deviation policy are unchanged.

## Movie facts — Stage 9 concurrency

After each caller independently authenticates and reads the persisted movie, `lib/facts.ts` joins or registers a private in-memory Promise keyed by `JSON.stringify([userId, movie])`. Tuple serialization avoids ambiguous concatenated keys. The Promise is registered synchronously; its workflow begins in a subsequent Promise continuation, so registration precedes even the cache lookup. The shared operation covers the existing cache check, optional generation, persistence, and safe DTO. Equivalent overlapping callers receive the same persisted result; different users or movies run independently.

An identity-checked `finally` removes only the settling operation's entry on success or failure. Awaited failures preserve the existing safe error, and a later request can retry. No expired fact is returned as fallback. The map holds only in-flight work; Postgres still supplies the 60-second cache, with no timestamp updates or row overwrites.

**Limitation:** This coordinates overlapping requests handled by the same Node process. It does not coordinate separate Node processes, workers, containers, or serverless instances. It is not distributed locking. Development module reloads also reset module memory; use the production server for controlled verification.

The 36 tests include held generation/persistence and cache-read promises to prove actual overlap, independent user/movie scopes, collision-safe keys, and cleanup/retry after failures. Tests use distinct concurrency-test identities and settle pending gates in teardown; no map-inspection/reset API is exposed.

Production terminal verification used an existing valid session cookie only in memory, with normal authentication enabled. An unauthenticated action was denied. Two overlapping authenticated HTTP requests after expiry returned identical fact DTOs and created exactly one row (7 to 8); all seven earlier facts remained unchanged. No timestamps were edited or facts deleted. The deterministic tests directly count provider/persistence calls; the live check verifies returned IDs, timestamps, and database rows without provider instrumentation. Typecheck and production build pass. Browser dashboard/logout regression verification is pending.

## Database

- Prisma CLI, Client, and PostgreSQL adapter are pinned to 7.10.1. Avoid an unqualified Prisma `latest` install, which may select a different major.
- The schema contains User, Account, Session, and MovieFact. Google OAuth does not require the email magic-link VerificationToken model.
- Prisma also manages its internal `_prisma_migrations` bookkeeping table.
- The `prisma-client` generator writes ESM TypeScript to the ignored `generated/prisma/` directory. Development, type-check, and build commands regenerate it automatically.
- The reusable client in `lib/prisma.ts` uses `PrismaPg`, is marked server-only, and reuses its client during development hot reloads.
- npm's install-script approvals are restricted to the pinned Prisma CLI and engine packages in `package.json`. The transitive protobufjs compatibility-warning script is explicitly disabled; it is not required at runtime.

When changing the schema, create a migration for review before applying it:

```sh
npx --no-install prisma format
npx --no-install prisma validate
npx --no-install prisma migrate dev --name describe_change --create-only
```

Inspect the generated SQL, then apply reviewed migrations with `npx --no-install prisma migrate deploy`. Creating development migrations requires Prisma's temporary shadow database; the development role needs database-creation permission or a separately configured shadow database.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run start
npx --no-install prisma migrate status
```

The type check generates Prisma Client and Next.js route types before running TypeScript without emitting files. Stop the development server before building or starting the production server. Build and generation require DATABASE_URL to be configured, but do not query application data.

## Planning documents

- [Requirements](docs/REQUIREMENTS.md)
- [Decisions](docs/DECISIONS.md)
- [Architecture](docs/ARCHITECTURE.md)

The scaffold uses the official TailwindCSS Turbopack integration generated by create-next-app 16.4.5. Direct dependency versions are pinned and `package-lock.json` records the resolved installation.

Stale fallback remains deferred.
