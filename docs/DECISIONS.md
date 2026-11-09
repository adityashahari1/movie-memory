# Engineering Decisions

## D001 — Variant Selection

Decision:
Variant A — Backend-Focused

Reason:
The variant provides an opportunity to demonstrate backend
correctness, data modeling, caching, concurrency handling,
authorization, failure handling, and safe OpenAI integration.

Tradeoff:
The application will intentionally keep client-side state management
simple rather than implementing Variant B's richer frontend
orchestration.

## D002 — 60-Second Boundary

Decision:
A cached fact is fresh when age < 60 seconds.
A fact is expired when age >= 60 seconds.

Reason:
This produces an explicit and deterministic interpretation of the
otherwise unspecified equality boundary.

## D003 — AI Request Options

Decision:
Use an explicit request timeout suitable for an interactive request
and disable automatic retries explicitly.

Stage 7 implementation:
Gemini SDK httpOptions.timeout = 30,000 milliseconds
Gemini SDK httpOptions.retryOptions.attempts = 1

The Gemini SDK counts the initial request as an attempt, so one total
attempt means zero automatic retries. This preserves the original
maxRetries = 0 policy when changing providers.

Reason:
Make request duration and retry behavior deliberate while keeping the
AI integration minimal. Send only the movie title and keep the
application's required fact persistence in Postgres. The 30-second limit
fits one short generation in the local Node runtime without the SDK's
long default timeout.

## D004 — Movie Validation Limits

Decision:
After trimming:

- Minimum length = 1
- Maximum length = 200

Reason:
Reject empty input and bound the movie title with simple server-side
validation. These values are project decisions; the assignment does
not prescribe numeric limits.

## D005 — Auth.js Version

Status:
Selected and installed for Stage 3. Database persistence and authenticated
HTTP checks pass; browser logout and repeated-login verification are pending.

Decision:
Pin next-auth 5.0.0-beta.32 and @auth/prisma-adapter 2.11.3. Both use
@auth/core 0.41.3 transitively; do not install @auth/core directly.
Use Auth.js v5 configuration, handlers, auth(), signIn(), and signOut()
consistently with Next.js 16 and the existing Prisma 7 client.

Reason:
Match the current v5 documentation and compatible package peer ranges,
without mixing in v4 APIs or adding another authentication library.

## D006 — Test Scope and Budget

Decision:
Prioritize automated backend coverage for cache behavior and preventing
cross-user fact access. Keep the accepted 59.999s/60.000s boundary cases.

A separate Postgres authorization integration-test database is optional.
Use it if setup is quick; otherwise exercise the application boundary
with mocked session/AI-provider dependencies and verify ownership-scoped
Prisma queries using two users' fact fixtures. The test must detect a
missing ownership filter, rather than stubbing an authorized outcome.
Also check isolation manually against the running application/database.

Other suggested automated tests are selected by risk and remaining time;
their underlying required behaviors must still be verified.

Reason:
Prove the explicitly required behaviors without letting test infrastructure
consume a disproportionate share of the roughly three-hour scope.

## D007 — Commit Guidance

Decision:
Keep the PLAN -> IMPLEMENT -> RUN -> VERIFY -> REVIEW -> COMMIT discipline,
but treat the 15 stages as verification checkpoints rather than a quota
of 15 separate commits. Group adjacent verified stages into coherent
commits when appropriate. Roughly 7-10 meaningful commits is reasonable;
there is no required commit count.

Reason:
Commit history should communicate completed work without artificial
commits made only to match the plan's stage count.

## D008 — Node.js Runtime

Status:
Accepted. Node 24.x is the project runtime, as explicitly requested.

Decision:
Pin Node.js 24.22.2 in .nvmrc and require Node 24.x in package.json.
Use @types/node 24.19.2 so TypeScript declarations match the runtime
family. Keep npm 11.19.1, which is compatible with Node 24.

Reason:
Keep development, dependency installation, and build verification on
the intended Node 24 release family. This supersedes the Node 26
runtime recorded during the initial package verification below.

Prisma work remains deferred until DATABASE_URL is configured.

## D009 — Prisma 7 Persistence Setup

Decision:
Use matching Prisma CLI, Client, and PostgreSQL adapter versions 7.10.1.
Use ESM, the prisma-client generator, and an explicit ignored output path
at generated/prisma. Keep the connection URL in the ignored .env file;
prisma.config.ts loads it for CLI commands.

Use explicit .ts imports in the generated client and enable TypeScript
extension imports so Node 24 can run a temporary connectivity check
without another TypeScript runner dependency. Next.js bundles the same
generated TypeScript for server code.

Use a server-only PrismaPg-backed client, cached through globalThis during
development to avoid unnecessary clients during hot reloads.

Create only User, Account, Session, and MovieFact application models.
VerificationToken is for email magic links and is unnecessary for the
planned Google-only authentication. Prisma's internal migration tracking
table is required tooling, not an additional application model.

MovieFact.generatedAt uses millisecond-precision timestamptz. Its
userId/movie/generatedAt-descending index supports the later cache lookup;
no cache behavior or concurrency constraint is implemented in this stage.

Reason:
Follow the approved model and Prisma 7 conventions without adding
authentication behavior, unrelated models, or extra infrastructure.

## D010 — Gemini SDK and Movie Fact Model

Decision:
At the user's explicit request, replace OpenAI with Gemini. Pin the
official @google/genai package to 3.0.0, verified as the stable npm release
and compatible with Node 24. Use the supported non-streaming
models.generateContent API with gemini-3.1-flash-lite, minimal thinking,
one candidate, and maxOutputTokens = 300. Keep the model identifier and
GEMINI_API_KEY server-side; use the Gemini Developer API, not Vertex AI.

Reason:
The user requested a provider with a free tier rather than funding OpenAI
credits. Google's current pricing lists free-tier input and output for
this stable lightweight model, subject to project eligibility and quotas.
Use a key from a Free Tier project; no billing setup is performed. The
configured key can access the model; live generation is verified separately.

Requirement impact:
The assignment explicitly requires OpenAI. Gemini is a documented
implementation deviation, not a claim that the OpenAI requirement is met.
The assignment owner would need to accept this substitution for compliance.

Send fixed application instructions separately from a JSON-encoded movie
title. No Google profile, application user ID, or session data is sent.
Accept only one normally completed candidate with nonempty text. Persist each Stage 7 generation
before returning a safe fact DTO; there is no fact lookup, cache, lock,
or stale fallback in this stage.

References: [Gemini model](https://aistudio.google.com/docs/models/gemini-3.1-flash-lite),
[pricing](https://aistudio.google.com/docs/pricing#gemini-3.1-flash-lite),
[supported generateContent API](https://ai.google.dev/api/generate-content).

## D011 — Single-Process Fact Coordination

Decision:
Use a private in-memory Map of in-flight Promises in lib/facts.ts, keyed
by JSON.stringify([authenticated application User.id, exact persisted movie]).
Authenticate and resolve persisted state independently for each caller.
Register the Promise synchronously before its continuation performs the
cache lookup, generation, and persistence. Equivalent overlapping callers
await the same operation; different users/movies remain independent.

Remove settled work in finally on success or failure, checking Promise
identity before deletion. Keep the existing safe error and allow later
retries. Postgres remains the cache; the 60-second boundary and append-only
fact behavior are unchanged. Stale fallback is deferred to Stage 10.

Reason and limitation:
This is the approved simple take-home approach. It coordinates overlapping
requests handled by the same Node process. It does NOT coordinate separate
Node processes, workers, containers, or serverless instances. It is not
distributed locking, and development module reloads reset module memory.

## Initial Package Verification — 2026-11-07

Status:
Historical pre-scaffold snapshot; D008 defines the current project runtime.
Read-only checks completed against the public npm registry and official
documentation. These are candidate pins, not an installed or build-tested
dependency set. No package installation or application scaffolding was run.
D005 remains unresolved until project initialization.

| Package/tool | Verified candidate | Notes |
|---|---|---|
| Node.js | 26.8.2 | Installed locally; satisfies the checked candidate engine ranges. Node 26 is listed as LTS. |
| npm | 11.19.1 | Installed locally. |
| next / create-next-app | 16.4.5 / 16.4.5 | Matching stable releases; Node >=20.9. |
| react / react-dom | 19.3.1 / 19.3.1 | Matching releases accepted by Next.js and the Auth.js v5 candidate peer ranges. |
| typescript | 5.9.3 | Verified stable 5.x candidate; Prisma 7 recommends 5.9.x. The registry latest is 7.0.2, which is not selected automatically. |
| tailwindcss / @tailwindcss/postcss | 4.3.5 / 4.3.5 | Matching releases. |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.1 / 7.10.1 / 7.10.1 | Matching stable Prisma 7 set. The CLI latest tag currently resolves to 8.0.0-rc.33, so do not use an unqualified latest install. |
| next-auth | 5.0.0-beta.32 | Candidate matching the modern documentation; still a beta. Stable latest is 4.24.15 with different APIs. Final selection waits for initialization. |
| @auth/prisma-adapter | 2.11.3 | Shares @auth/core 0.41.3 with the Auth.js v5 candidate; accepts the Prisma Client candidate's version range. |
| openai | 7.53.0 | Requires Node >=22; optional feature peers are unnecessary for basic text generation. |
| vitest | 5.1.0 | Accepts Node 26. Requires Vite as a test-tool peer; optional browser/UI packages are unnecessary. |
| vite | 8.3.6 | Satisfies Vitest's required peer range; test tooling only, not an application framework change. |

Prisma 7 requires its PostgreSQL driver adapter and version-appropriate
client/configuration setup. This is required database connectivity, not
additional infrastructure. Do not add Accelerate or a hosted Prisma service.

Declared engines and peers support this candidate combination. Actual
installation, generation, type checking, and build validation remain part
of initialization. A PostgreSQL server connection/version has not yet been
verified.

References:

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [Auth.js installation](https://authjs.dev/getting-started/installation?framework=Next.js)
- [Auth.js Prisma adapter](https://authjs.dev/getting-started/adapters/prisma)
- [Prisma 7 setup changes](https://docs.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- [Official OpenAI SDK documentation](https://developers.openai.com/api/reference/typescript)
- Exact npm package metadata: [Next.js](https://registry.npmjs.org/next/16.4.5), [React](https://registry.npmjs.org/react/19.3.1), [TypeScript](https://registry.npmjs.org/typescript/5.9.3), [TailwindCSS](https://registry.npmjs.org/tailwindcss/4.3.5), [Prisma CLI](https://registry.npmjs.org/prisma/7.10.1), [Prisma Client](https://registry.npmjs.org/@prisma%2Fclient/7.10.1), [Postgres adapter](https://registry.npmjs.org/@prisma%2Fadapter-pg/7.10.1), [NextAuth](https://registry.npmjs.org/next-auth/5.0.0-beta.32), [Auth adapter](https://registry.npmjs.org/@auth%2Fprisma-adapter/2.11.3), [OpenAI SDK](https://registry.npmjs.org/openai/7.53.0), [Vitest](https://registry.npmjs.org/vitest/5.1.0), [Vite](https://registry.npmjs.org/vite/8.3.6).
