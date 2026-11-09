# Movie Memory Architecture

## 1. Architecture summary

This is a design proposal for **Base Implementation + Variant A (Backend-Focused)**. The assignment PDF and [REQUIREMENTS.md](REQUIREMENTS.md) are the requirements sources. [DECISIONS.md](DECISIONS.md) records confirmed project decisions and deferred choices.

**User-directed provider deviation:** Stage 7 uses Gemini instead of the assignment's required OpenAI integration to use a free tier. The original OpenAI requirement remains in REQUIREMENTS.md and is not satisfied by this substitution without assignment-owner acceptance. D010 records the current provider and SDK.

| Label | Meaning |
|---|---|
| Requirement | Stated in the assignment or REQUIREMENTS.md. |
| Decision | A project implementation choice. Recommendations below remain proposed unless recorded as confirmed in DECISIONS.md. |
| Assumption | A condition or interpretation not guaranteed by the assignment. |

**Recommendation:** one Next.js App Router application running in a single Node.js process, using:

- TypeScript, React, and TailwindCSS for the interface.
- NextAuth/Auth.js with Google OAuth and the Prisma adapter. Stage 3 selected next-auth 5.0.0-beta.32 with @auth/prisma-adapter 2.11.3; see D005 in DECISIONS.md.
- Database-backed sessions.
- Postgres for users, authentication records, favorite movies, and generated facts, accessed through Prisma.
- Server Components for page reads and authorization.
- Server Actions for onboarding and fact generation.
- One server-only fact module for cache lookup, concurrency protection, AI invocation, persistence, and fallback. Generation, persistence, and the 60-second cache are implemented through Stage 8; concurrency protection and stale fallback remain deferred.
- A shared in-memory promise per user and movie to coordinate overlapping requests.

No separate backend, Redis, queue, repository pattern, or additional client-state library is needed.

**Critical assumption:** one Node.js process/runtime with one shared concurrency registry. The assignment permits an in-memory lock when its limitation is documented. This recommendation does not coordinate separate processes or serverless instances.

The database is the source of cached facts. Memory holds only work currently in progress.

## 2. Request/data-flow diagrams

### Google login

```text
Unauthenticated browser visits /
    |
    v
Landing page: "Sign in with Google"
    |
    v
Auth library starts Google OAuth
    |
    v
Google authenticates user
    |
    v
Auth library validates callback and Google identity
    |
    v
Prisma adapter finds or creates User + Account
    |
    v
Create database Session and set session cookie
    |
    v
Redirect to /
    |
    v
Read authenticated user's favoriteMovie
    |
    +-- null --------> /onboarding
    |
    +-- present -----> /dashboard
```

**Proposed decision:** use `/` as the post-login routing point. Determine onboarding from persisted application data rather than an OAuth new-account indicator.

### First-time onboarding

```text
GET /onboarding
    |
    v
Validate session
    |
    +-- unauthenticated --> redirect /
    |
    v
Read current User
    |
    +-- favoriteMovie already present --> redirect /dashboard
    |
    v
Render favorite-movie form
    |
    v
POST Server Action
    |
    v
Authenticate again
    |
    v
Validate type, trim, enforce length
    |
    v
Conditionally save:
current user AND favoriteMovie is still null
    |
    v
Redirect /dashboard
```

The conditional write prevents two onboarding tabs from overwriting each other and prevents the onboarding action from becoming an unintended movie-edit endpoint.

### Dashboard access

```text
GET /dashboard
    |
    v
Validate database session
    |
    +-- missing/expired --> redirect /
    |
    v
Read current User
    |
    +-- favoriteMovie is null --> redirect /onboarding
    |
    v
Render name, email, optional photo, movie, Logout
    |
    v
Small client FactPanel requests fact through a Server Action
```

**Proposed decision:** page rendering reads data. Fact generation happens through a POST action after the panel mounts, avoiding paid API calls and writes during rendering or link prefetching. [Next.js data security](https://nextjs.org/docs/app/guides/data-security)

### Fact generation with a fresh cache

```text
Fact Server Action
    |
    v
Authenticate; read user's persisted favorite movie
    |
    v
Join or create work for [userId, movie]
    |
    v
Read latest matching fact from Postgres
    |
    v
age < 60 seconds?
    |
    +-- yes --> return cached fact
                no provider call
                no new fact record
```

### Fact generation with an expired or empty cache

```text
Authenticated fact request
    |
    v
Join or create work for [userId, movie]
    |
    v
Read latest matching fact
    |
    v
No fact OR age >= 60 seconds
    |
    v
Call Gemini (user-directed provider override)
    |
    v
Validate completed, nonempty text
    |
    v
Record generation-completion timestamp
    |
    v
Insert fact into Postgres
    |
    v
Return persisted fact
    |
    v
Remove in-progress entry
```

### Concurrent fact requests

```text
Tab A                         Tab B
  |                             |
  v                             v
Authenticate                  Authenticate
  |                             |
  v                             |
Register shared promise         |
for [userId, movie]              |
  |                             v
  |                         Find existing promise
  |                             |
  v                             v
Read cache                  Await same promise
  |
  v
Generate if necessary
  |
  v
Persist result
  |
  +-----------------------------+
  |                             |
  v                             v
Return result               Return same result

Remove entry when the shared work settles
```

Registration must happen synchronously before asynchronous work can allow another request to create a second entry.

### AI provider failure

```text
Provider timeout/error/unusable response
    |
    v
Was there a matching stored fact?
    |
    +-- yes --> return that fact as stale
    |           preserve its original timestamp
    |
    +-- no ---> return user-friendly error
    |
    v
All waiting requests receive the same outcome
    |
    v
Remove in-progress entry
```

A subsequent request may try generation again. Returning stale data does not renew its cache lifetime.

## 3. Proposed data model

This is conceptual, not a final Prisma schema.

```text
User
 |-- has many Accounts
 |-- has many Sessions
 |-- has many MovieFacts
 |-- favoriteMovie: nullable string
```

### User

**Proposed decision:** store the single favorite movie directly on `User`.

| Important field | Why it exists | Requirements and constraints |
|---|---|---|
| id | Stable application identity and ownership key. | Primary key; referenced by accounts, sessions, and facts. Supports B06 and G04. |
| name | Google display name. | Nullable for G06; display a simple fallback when absent. Supports B07. |
| email | Google email displayed on the dashboard. | Retain the adapter-compatible nullable, unique field. Email is not the authorization key. Supports B07. |
| image | Google photo URL. | Nullable; omit the image when unavailable. Supports B08 and G06. |
| emailVerified | Standard adapter-compatible identity metadata. | Nullable; does not introduce a separate verification flow. |
| favoriteMovie | The user's one saved movie and onboarding-completion indicator. | Nullable before onboarding; validated before writing. Supports B04-B06 and B09. |

**Assumption:** successful Google login provides the email needed by the dashboard. If it does not, report an authentication/profile error rather than inventing an address.

A separate `onboardingComplete` flag would duplicate information: a valid saved movie already establishes completion.

### Account

**Proposed decision:** let the auth adapter manage the association between Google identity and application identity.

| Important field | Why it exists | Relationships and constraints |
|---|---|---|
| id | Adapter record identity. | Primary key. |
| userId | Associates the Google account with the application user. | Foreign key to User; index for user-related operations. |
| provider | Identifies Google as the identity provider. | Part of a compound unique constraint. |
| providerAccountId | Google's stable account identifier. | Unique together with provider; prevents duplicate identity mappings. |
| type | Adapter protocol metadata. | Retain the adapter's documented representation. |
| Optional OAuth token/expiry fields | Adapter-managed OAuth metadata. | Server-only; never include these in page props or action responses. No offline-access or token-refresh feature is required. |

This supports Google login and repeat identification under B01-B03. Use the selected adapter version's documented conventions instead of writing custom account-linking logic. [Prisma adapter documentation](https://authjs.dev/getting-started/adapters/prisma)

### Session

| Important field | Why it exists | Relationships and constraints |
|---|---|---|
| id | Adapter record identity. | Primary key. |
| sessionToken | Opaque credential connecting the browser cookie to a session. | Unique; treat as a secret. |
| userId | Determines the authenticated application user. | Foreign key to User; index. |
| expires | Determines whether the session remains valid. | Checked through the auth library. |

Supports authenticated access, logout, and dashboard protection.

**Proposed decision:** database sessions. The browser holds an opaque session token in an HttpOnly cookie; logout removes the database session and cookie. Postgres is already required, so this adds no infrastructure. [Auth.js session strategies](https://authjs.dev/concepts/session-strategies)

### MovieFact

**Proposed decision:** insert one record for each successfully generated fact.

| Important field | Why it exists | Requirements and constraints |
|---|---|---|
| id | Identifies the stored fact. | Primary key. |
| userId | Records ownership. | Foreign key to User; every lookup is scoped to this value. Supports G04 and A08. |
| movie | Captures the exact trimmed title used for generation. | Supports the user-plus-movie cache key in A01-A02. |
| text | Stores the generated fact. | Required, nonempty text. Supports B12-B13. |
| generatedAt | Measures fact age and selects the latest fact. | Required timestamp, set after generation completes; unchanged during reuse or fallback. Supports A01-A02 and A05. |

**Important index:** `(userId, movie, generatedAt descending)` for retrieving the latest matching fact.

Do not add a unique constraint per fixed time window under the recommended approach.

### Modeling boundaries

- No separate movie catalog or globally unique movie title is needed.
- Title matching uses the trimmed stored string; no case folding or external canonicalization.
- No FavoriteMovie model is needed for one scalar value.
- No history interface is added merely because facts are retained.
- Google-only login does not require an email magic-link flow. VerificationToken serves that separate mechanism. Follow the selected adapter version's schema requirements without enabling that feature. [Auth.js database models](https://authjs.dev/concepts/database-models)

## 4. Major engineering decisions

Recommendations remain proposed unless recorded as confirmed in DECISIONS.md.

| Decision | Recommended approach and why it fits | Reasonable alternative and why it is not selected | Correctness/security implications | What to explain in an interview |
|---|---|---|---|---|
| Application structure | One App Router application, organized by route, with a few server-only modules. This keeps the whole flow visible. | Separate frontend/backend or layered services: more interfaces and setup without additional requirements. | Business operations still need explicit authorization boundaries. | The application is small enough that actions and focused functions are sufficient. |
| Authentication | NextAuth/Auth.js v5 Google provider with Prisma adapter. Delegate OAuth protocol handling and account persistence. Exact selected versions are recorded in D005. | Hand-written Google OAuth: fewer dependencies, but substantially more security-sensitive work. | Preserve callback validation and default safe account-linking behavior; use APIs matching the selected release. | Authentication protocol details are delegated; application authorization remains explicit. |
| Session identity | Database sessions; expose the application User.id through the server-side session representation. | JWT sessions: valid alternative, but unnecessary when meaningful operations already need Postgres. | Resolve ownership from the validated session, never an email or submitted user ID. | Google identity, application identity, and session credentials have different roles. |
| Onboarding | favoriteMovie being null means onboarding is incomplete. Use an atomic conditional write. | Separate completion flag: permits contradictory states and needs synchronization. | An existing OAuth account may still need onboarding. Two submissions must not overwrite the first saved movie. | Account creation and onboarding completion are separate events. |
| Favorite-movie model | Nullable string on User; facts retain their title snapshot. | Movie and user/movie join models: no catalog, shared metadata, or multiple favorites are requested. | Cache lookup uses both user identity and title. | Normalization follows the domain actually required. |
| Fact persistence | Append successful generations; query the latest matching record. | Overwrite one latest row: possible, but loses previous generated facts and makes inspection less clear. | Persist before returning a new fact as successful. This adds no history UI. | The database provides required persistence and the cache source. |
| Server/client boundaries | Server-render profile/movie data. Small client forms/panels handle submission, loading, and errors. | Full client application with typed REST wrapper and state library: mainly Variant B work. | Client state is presentation state, never proof of identity or cache freshness. | The browser handles interaction; the server owns authorization and generation policy. |
| Fact request interface | One authenticated Server Action, invoked when the fact panel mounts. No ownership arguments. | Generation during page rendering: fewer client lines, but adds writes and paid calls to rendering. | Reauthenticate inside the action. POST origin protections supplement authorization. | Effects stay out of rendering without adding an API-client layer. |
| Cache policy | Latest fact for current user/movie; fresh at age < 60s and expired at age >= 60s. | Framework revalidation or global movie cache: obscures per-user ownership and exact age behavior. | Reuse never changes generatedAt; expired facts remain eligible for failure fallback. | Cache age is measured from generation, not last access. |
| AI integration | User-directed Gemini override: official Google GenAI SDK, one supported non-streaming generateContent request, and short plain-text output. Timeout 30,000 ms; retryOptions.attempts = 1. | Raw HTTP or streaming: more response/error handling without a requirement benefit. | Send only the movie title; validate normally completed, nonempty output; keep credentials and provider errors server-side. | Explain the explicit OpenAI requirement deviation and bounded request/retry settings. |
| Failure handling | Return matching stale data when available; otherwise a friendly error. Keep profile/movie/logout usable. | Fail the entire dashboard: discards useful functionality despite an isolated upstream failure. | Do not persist an error as a fact or refresh the stale fact's timestamp. | Failure fallback is separate from normal freshness. |
| Movie validation | Require a string and trim it. After trimming: minimum length = 1; maximum length = 200. Preserve internal spacing and case. | Validation library or title catalog: unnecessary for this single field. | All writes use the server validator. Client limits are convenience. Numeric limits are a project decision. | The assignment requires limits but leaves their values open. |
| Testing | Focused backend tests with fake time/provider stubs for deterministic cases. The current suite uses Node 24's built-in runner. A separate Postgres integration-test database is optional if inexpensive to set up. | Making database integration or full browser automation mandatory: setup can consume the three-hour budget without being required by the assignment. | Exercise the fact action and ownership-scoped query behavior; do not stub the authorization result itself. | Required coverage is cache behavior and preventing cross-user fact access; broader automation is selected by value and time. |

### AI request policy

Use an explicit request timeout suitable for an interactive request and configure retry behavior explicitly.

**Current Gemini implementation:** `httpOptions.timeout = 30_000` milliseconds and `httpOptions.retryOptions.attempts = 1` (one total attempt, zero retries).

The SDK timeout bounds one interactive text request in the local Node runtime. It uses SDK timeout handling rather than a timer that leaves an unmanaged request running. D010 records the selected SDK and model.

The integration remains minimal: send only the movie title, request one short plain-text fact, validate the result, and persist it in Postgres. Keep the title separate from instructions and render output using normal React escaping.

These settings are implementation choices rather than assignment requirements. See D003/D010 and the installed Google GenAI SDK's HttpOptions/HttpRetryOptions types.

### Movie validation policy

After trimming:

- **Minimum length = 1**
- **Maximum length = 200**

Reject non-string input and values outside these limits on the server. These numeric limits are confirmed project decisions; the assignment itself does not supply them.

### Concurrency comparison

| Permitted approach | Correctness | Complexity | Multi-instance behavior | Failure recovery | Testability and explainability |
|---|---|---|---|---|---|
| DB transaction guard | Sound when a real lock is acquired before generation and the cache is checked again under it. A transaction alone is insufficient. | Medium: lock selection, transaction duration, timeouts, waiting requests. | Coordinates instances sharing Postgres. | Rollback/connection termination releases transactional locks. | Needs database concurrency tests. Clear guarantee, but explain holding a connection while awaiting the AI provider. |
| Generation-in-progress flag | Acquisition requires an atomic conditional update. A read-then-write boolean can race. | Medium: ownership, clearing, crash recovery. | Can coordinate through the database. | A bare flag can remain stuck after a crash. Leases add expiry and ownership complications. | Test races and abandoned work. More state transitions to explain. |
| Unique constraint per user/window | A constraint on the final insert does not prevent duplicate provider calls. Reservation before generation is needed; fixed windows complicate the age-based cache. | Deceptively medium: reservations and recovery remain necessary. | Shared uniqueness does not automatically serialize generation. | Failed reservations need cleanup or recovery. | Needs boundary/race tests; difficult to justify as the simplest approach here. |
| Shared in-memory promise | Prevents simultaneous application generation for a key within one process when registration is atomic. | Low: keyed map, shared promise, cleanup. | No coordination across processes or instances. | finally cleans settled work; restart clears memory. | Controlled promises make overlap tests straightforward. The limitation is easy to state. |

**Recommendation:** shared in-memory promise, under the explicit single-process assumption.

Implementation rules:

1. Authenticate each caller before joining shared work.
2. Build a collision-safe key from server-derived user ID and movie.
3. Register work before any asynchronous gap can create a duplicate.
4. Read the cache inside the shared workflow.
5. Keep the entry until generation and persistence settle.
6. Remove it on both success and failure.
7. Do not confuse fact lifetime with lock expiration.
8. Route every fact-generation entry point through the same module.

The alternative is a database transaction guard. It provides broader coordination, but holding a transaction during an external request adds connection and timeout concerns. Prisma recommends keeping transactions short. [Prisma transaction guidance](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions)

If deployment requires multiple workers or serverless instances, change this recommendation before implementation.

## 5. Security boundaries

| Boundary | Required treatment |
|---|---|
| Browser to server | Treat arguments as untrusted; validate movie input on the server. |
| Session to application identity | Obtain User.id through the validated session, never ownership input from the browser. |
| Page to action | A page guard does not protect a separately invoked action. Authenticate inside every action. |
| Application to database | Scope fact reads to current user/movie and onboarding writes to the current user. |
| Shared memory to users | Include user identity in the work key. Users with the same movie must not share results. |
| Server to client | Return display fields and safe results/errors only; never full account records or session credentials. |
| Server to Gemini | Keep credentials server-only; send the movie title without user name, email, session, or database credentials. |
| Generated text to UI | Render plain text through React escaping; do not treat it as trusted HTML. |
| Authentication to logout | Use library-managed logout; subsequent protected requests must fail authentication. |

Additional proposed decisions:

- Keep database/AI modules server-only.
- Request only the Google identity/profile/email scopes needed for login.
- Preserve library-managed cookie and OAuth protections.
- Keep authenticated content out of shared public caches.
- Log useful error codes/request identifiers without secrets.
- Provide a name fallback and omit an unavailable photo.

Server Actions remain public request boundaries. Their POST/origin protections supplement explicit authorization. [Next.js authentication](https://nextjs.org/docs/app/guides/authentication), [Server Action security](https://nextjs.org/docs/app/guides/data-security)

## 6. Testing strategy

### Explicitly required automated coverage

| Requirement | Proposed verification |
|---|---|
| A07: 60-second cache logic | Fresh fact is reused without a provider call or insertion. Expired fact triggers generation, persistence, and return of the stored result. Include the accepted project boundary: 59.999s returns cached; 60.000s is expired. Use fake time rather than waiting. |
| A08: authorization | With facts belonging to two user fixtures, authenticated user A cannot receive user B's facts, including when both have the same movie title. Exercise the application entry point and verify ownership-scoped querying. |

### Recommended additional automated checks

These are suggestions rather than an additional mandatory test suite. Prioritize the required coverage above and choose extra tests according to risk and remaining time. Required application behavior must still be verified even when its automated test is deferred.

| Area | Suggested cases |
|---|---|
| Empty cache | Generate and persist the first fact. |
| Concurrency | Overlap requests while a controlled provider promise is pending; assert one invocation and one new fact record. |
| Concurrency isolation | Different users with the same title do not join the same work. |
| Failure fallback | Timeout/error returns matching stale data without changing its timestamp. |
| Failure without fallback | Friendly error; no fact inserted. |
| Cleanup | After a failed attempt settles, a later request can attempt generation again. |
| Validation | Non-string, whitespace-only, trimmed valid input, and values at and beyond the chosen limits. |

**Decision:** a separate Postgres test database is optional. Use it if setup is quick; otherwise keep the required tests at the application boundary with mocked session identity/AI provider and a focused Prisma test double. Include facts for both users, check that queries use the authenticated user's ID and movie, and ensure the test would fail if the ownership filter were removed. A stub that simply returns a preselected authorized result is insufficient. No production repository abstraction is needed for this test setup.

Manually verify cross-user isolation against the running application and its actual database as well. Document the limits of mocked database coverage if no integration test is included.

Manually verify actual Google login, returning-user routing, logout, interrupted/duplicate onboarding, unauthenticated dashboard access, multiple tabs, missing profile fields, and absence of secrets in browser-delivered content.

Tests are proposed; no application code or tests have been implemented.

## 7. Recommended project/folder structure

```text
app/
|-- layout.tsx
|-- globals.css
|-- page.tsx                         # Landing and post-login routing
|-- actions.ts                       # Auth entry points, release-specific wiring
|-- api/
|   |-- auth/
|       |-- [...nextauth]/
|           |-- route.ts             # Auth library endpoints
|-- onboarding/
|   |-- page.tsx                     # Session/completion checks
|   |-- actions.ts                   # Validate and save first movie
|   |-- movie-form.tsx               # Small interactive form
|-- dashboard/
    |-- page.tsx                     # Authorized profile/movie reads
    |-- actions.ts                   # Authenticated fact request
    |-- fact-panel.tsx               # Loading, fact, stale/error state

lib/
|-- auth.ts                          # Provider, adapter, session config
|-- current-user.ts                  # Validated current-user lookup
|-- prisma.ts                        # Shared Prisma client
|-- movie.ts                         # Movie validation
|-- facts.ts                         # Cache, shared work, persistence
|-- gemini.ts                        # Bounded generation request; user override

prisma/
|-- schema.prisma                    # Created during implementation
|-- migrations/

tests/
|-- facts.test.ts
|-- authorization.test.ts             # Database integration optional
|-- movie.test.ts

types/
|-- next-auth.d.ts                    # Application user ID typing

docs/
|-- REQUIREMENTS.md
|-- DECISIONS.md
|-- ARCHITECTURE.md

.env.example
README.md
```

Keep the shared-promise registry inside lib/facts.ts. Framework/auth wiring follows the Auth.js v5 release recorded in D005; lib/auth.ts is the central configuration.

## 8. Implementation dependency order

| Order | Work | Completion condition |
|---|---|---|
| 1 | Resolve compatible package versions and external configuration. | Select Auth.js version at initialization; confirm compatible adapter/Next.js/Prisma, Postgres connection, Google callback, and AI provider access. |
| 2 | Establish Prisma models and migrations. | Authentication records, favorite movie, and facts can be persisted. |
| 3 | Implement Google login, sessions, current-user lookup, and logout. | Server reliably determines application identity. |
| 4 | Implement routing and onboarding. | Validation, conditional persistence, first-time/returning/interrupted paths work. |
| 5 | Implement the server-only fact workflow. | Cache, boundary, shared work, AI invocation, persistence, and fallback operate together. Select/document the explicit timeout and retry setting. |
| 6 | Connect dashboard and fact panel. | Required content and fact/error states display correctly. |
| 7 | Add backend tests and complete manual verification. | Required cache/authorization tests pass; remaining required behaviors are verified manually or with selected extra tests. |
| 8 | Complete submission documentation. | Setup, environment, migrations, concise architecture overview, variant rationale, tradeoffs, improvements, and AI note are documented. |

Establish identity and ownership before generated data. Keep styling modest until required behavior is correct.

Follow PLAN -> IMPLEMENT -> RUN -> VERIFY -> REVIEW -> COMMIT as the working discipline. The 15 implementation stages are verification checkpoints, not a requirement for 15 commits. Group adjacent verified stages into coherent commits when appropriate; roughly 7-10 meaningful commits is reasonable, with no commit-count target or quota.

**Assumption:** credentials and a usable database can be obtained promptly; external setup can otherwise consume a material part of the three-hour budget.

## 9. Architecture risks or unresolved decisions

| Item | Status and treatment |
|---|---|
| Single-process deployment | Assumption to confirm before deployment. A single-process Node run fits; multiple workers/serverless instances need database-backed coordination. |
| Auth.js version | Selected in Stage 3: next-auth 5.0.0-beta.32 and @auth/prisma-adapter 2.11.3, using consistent v5 APIs with Next.js 16 and Prisma 7. The release is a beta. Real login persistence and authenticated HTTP checks pass; browser logout and repeated-login verification remain pending. |
| AI model | User-directed Gemini override: gemini-3.1-flash-lite, configured server-side with minimal thinking and a 300-token output cap. See D010. Free Tier eligibility/quotas depend on the project. No model-routing abstraction. |
| AI timeout and retries | Gemini SDK timeout 30,000 ms and retryOptions.attempts = 1 (zero retries). |
| Validation limits | Confirmed project decision: after trimming, minimum length = 1 and maximum length = 200. The PDF itself leaves numbers unspecified. |
| Time measurement | Proposed decision: UTC timestamp at successful generation completion, measured with the server clock used for freshness checks. |
| Provider timeout ambiguity | A client timeout cannot prove provider-side work has stopped. The completed design will prevent overlapping application invocations within its runtime; it does not claim exactly-once execution inside the provider after network failures. Concurrency protection is deferred beyond Stage 7. |
| Persistence failure after generation | Do not report an unpersisted new fact as successful. Return the previously loaded matching fact if available, otherwise a friendly error. |
| Test setup budget | Cache and cross-user authorization tests remain required. A separate test database and the full list of suggested additional automated tests are optional. |
| Fact accuracy | Independent verification is not requested; do not add a movie database or research pipeline. |
| Documentation length | This detailed design informs implementation; keep the README overview to the required 1-2 pages. |

Version-selection references for initialization: [Auth.js installation](https://authjs.dev/getting-started/installation?framework=Next.js), [Prisma adapter](https://authjs.dev/getting-started/adapters/prisma).
