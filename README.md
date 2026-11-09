# Movie Memory

Foundation: Next.js App Router, TypeScript, React, TailwindCSS, npm, Prisma 7 with PostgreSQL, and Auth.js v5 Google authentication.

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

Auth.js v5 (`next-auth` 5.0.0-beta.32) and `@auth/prisma-adapter` 2.11.3 use the existing Prisma client and database sessions. Only Google is enabled. The root page shows the sign-in control when logged out and routes authenticated users according to their persisted favoriteMovie. Onboarding and dashboard currently contain only protected placeholders with Logout.

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
4. Verify favoriteMovie remains null and no MovieFact records were created.
5. Choose Logout; verify the page is unauthenticated and that session no longer exists.
6. Sign in again with the same Google account; verify the same application User.id is reused and no duplicate user/account is created.
7. Inspect authenticated `/api/auth/session` JSON and browser assets for exposed credentials or raw session/provider tokens.

Stage 3 was confirmed complete before routing implementation. Stage 4 terminal checks verified the existing Logout server action, session deletion, rejection of the old session, and Google sign-in initiation. A fresh browser Google round trip and browser navigation/logout checks remain pending for Stage 4.

## Authentication and onboarding routing

Every page uses the existing server-only getCurrentUser() helper. The validated application User.id resolves the current database user; favoriteMovie being null is the onboarding-completion indicator. No query parameter, browser state, or separate completion field determines access.

| State | `/` | `/onboarding` | `/dashboard` |
|---|---|---|---|
| Logged out | Landing | Redirect `/` | Redirect `/` |
| Signed in, favoriteMovie null | Redirect `/onboarding` | Onboarding placeholder | Redirect `/onboarding` |
| Signed in, favoriteMovie present | Redirect `/dashboard` | Redirect `/dashboard` | Dashboard placeholder |

All nine cases passed terminal HTTP checks against the production build, including repeated direct requests and redirect-chain checks. Verification temporarily set the test user's favoriteMovie to `Stage 4 routing verification` and restored it to null in a finally block. No onboarding submission is implemented.

## Database

- Prisma CLI, Client, and PostgreSQL adapter are pinned to 7.10.1. Avoid an unqualified Prisma `latest` install, which may select a different major.
- The schema contains User, Account, Session, and MovieFact. Google OAuth does not require the email magic-link VerificationToken model.
- Prisma also manages its internal `_prisma_migrations` bookkeeping table.
- The `prisma-client` generator writes ESM TypeScript to the ignored `generated/prisma/` directory. Development, type-check, and build commands regenerate it automatically.
- The reusable client in `lib/prisma.ts` uses `PrismaPg`, is marked server-only, and reuses its client during development hot reloads.
- npm's install-script approvals are restricted to the pinned Prisma CLI and engine packages in `package.json`.

When changing the schema, create a migration for review before applying it:

```sh
npx --no-install prisma format
npx --no-install prisma validate
npx --no-install prisma migrate dev --name describe_change --create-only
```

Inspect the generated SQL, then apply reviewed migrations with `npx --no-install prisma migrate deploy`. Creating development migrations requires Prisma's temporary shadow database; the development role needs database-creation permission or a separately configured shadow database.

## Verification

```sh
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

The onboarding form, movie submission, dashboard content, OpenAI integration, caching, and concurrency logic remain deferred. The OpenAI package is not installed.
