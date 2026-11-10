# Stage 12 - Security and Correctness Review

Reviewed 2026-11-10 against commit `d3090f9` on Node 24.22.2. Scope: the implemented Base + Variant A application, approved decisions, and the original assignment's security instructions. This is not the final requirements audit or README delivery pass.

## Findings and disposition

**Actual defect - fix now:** none found in the reviewed implementation. No production fixes, dependency changes, or additional regression tests were necessary. Existing meaningful tests were retained.

**Nonblocking limitations - document only:**

- The in-flight Promise map coordinates one Node process/module instance. Separate processes, workers, containers, and serverless instances do not share it; development module reloads reset it.
- Auth.js uses the deliberately selected v5 beta. The installed configuration and adapter remain consistent with that version family.
- Automated ownership tests prove the workflow/query contract with mixed-user fixtures, not a real two-account OAuth/Postgres integration environment. Runtime probes used the existing test user's real session; no authentication bypass was introduced.
- A client-side provider timeout cannot establish exactly-once execution inside the remote provider. Application cleanup and later retries remain intentional.
- The existing pg SSL-mode compatibility warning concerns a future driver-major behavior change. No driver upgrade or connection-setting change was made.

**Out-of-scope production hardening - not implemented:** distributed coordination, Redis, queues, WAF/rate-limiting infrastructure, observability platforms, secret-management services, and service/repository restructuring.

**Known assignment deviation:** Gemini remains the explicit user-directed replacement for OpenAI. This review does not claim compliance with the original provider requirement without assignment-owner acceptance.

## Files and dependencies inspected

- `lib/auth.ts`, `lib/current-user.ts`, `types/next-auth.d.ts`, auth route handlers, and sign-in/logout actions.
- Root, onboarding, and dashboard pages; onboarding action/form; dashboard action/fact panel; root layout.
- `lib/movie.ts`, `lib/facts.ts`, `lib/gemini.ts`, `lib/prisma.ts`, and both test files.
- Prisma schema/migration/config, package manifest/lockfile, Next/TypeScript configuration, `.gitignore`, and `.env.example`.
- REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md, relevant README implementation notes, and assignment PDF security page 6.
- Installed Auth.js sign-out and Prisma adapter session-deletion code, installed Google GenAI timeout/retry code, production action manifest, client assets, and reachable Git history.

## Boundary review

| Area | Result and evidence |
|---|---|
| Authentication | Google is the only configured and runtime-listed provider. Database sessions resolve application User.id; email/provider account IDs are not ownership identities. Pages and privileged actions independently resolve the current user. |
| Session exposure | The callback explicitly returns expiry and user id/name/email/image. Actual session JSON matched this allowlist. Invalid session cookies did not authenticate. Local cookie HttpOnly/SameSite protections and private/no-store responses were retained. |
| Logout | The action delegates to Auth.js signOut. Installed core/adapter code deletes the database session and clears cookies. Earlier user-confirmed logout/re-login evidence remains applicable; live logout was not repeated, preserving the current session. |
| Ownership | Onboarding writes use current User.id; fact reads use current User.id plus the exact persisted movie. Browser-supplied identity/movie values did not select another profile or authenticate anonymous actions. The action forwards workflow query criteria unchanged to Prisma. |
| Onboarding | Null favoriteMovie remains the state indicator. Server validation trims and enforces 1-200, rejects non-string/empty values, and preserves internal case/spacing. The atomic id-and-null update prevents overwrite. A completed user's forged edit attempt redirected without changing data. |
| Dashboard | Anonymous direct access redirected to landing; completed onboarding redirected to dashboard. Stored profile/movie selection ignores query-parameter identity. Missing name/photo/email handling is explicit and safe. Photo rendering is an ordinary browser image with no-referrer and no server-side URL fetching. |
| Provider | Key and SDK remain server-only. Only the movie value and fixed instructions are sent. Completion/nonempty output checks remain. Installed SDK code confirms timeout 30,000 ms and one total attempt, zero retries. Logs contain a fixed message/status rather than raw provider errors. No OpenAI SDK remains. |
| Persistence | New facts are awaited before success and inserted with create. Reuse/fallback have no write path. A failed insertion cannot return unsaved text as success. The existing userId/movie/generatedAt-descending index matches the lookup. |
| Cache | Latest matching fact is selected. Age < 60,000 ms reuses; age >= 60,000 ms regenerates. Tests preserve 59,999/60,000 boundaries, IDs, and original timestamps; there is no sliding or client-side cache. |
| Concurrency | Collision-safe JSON tuple key; synchronous registration before the deferred cache read; shared generation/persistence; independent user/movie scopes; identity-checked finally cleanup after success/failure. Existing deterministic tests prove overlap and retry behavior. |
| Fallback | Only the typed provider request failure permits the already-loaded matching fact as fallback. No match gives the safe error. Timestamp remains stale and later requests retry. Output/configuration/internal/database errors remain separate safe failures under D012. |
| Server/client and rendering | The two client components import server-action proxies and type-only DTOs, not Prisma/SDK/secret values. Generation is a separately authenticated action. HTML and RSC/prefetch GETs did not create facts. |
| Input/output | Movie and fact text use ordinary React text rendering. No dangerouslySetInnerHTML, HTML interpretation, raw SQL construction, or raw-error serialization was found. No sanitization dependency was added. |

## Runtime and scan evidence

- Anonymous onboarding/dashboard requests redirected to landing. Anonymous fact/onboarding actions rejected forged identity inputs.
- Authenticated dashboard query tampering left the rendered profile/movie unchanged. Public session data and authenticated dashboard responses were not publicly cacheable.
- A completed onboarding submission could not overwrite the saved movie. A foreign-origin action was rejected with the production framework's generic HTTP 500 response.
- RSC prefetch followed Next.js's canonical redirect and returned text/x-component. Fetch-action redirects used HTTP 200 with x-action-redirect; these protocol responses required no application workaround.
- Runtime completion checks preserved the profile, movie, current session, and every existing fact: 10 facts before and after. No temporary profile/fact edits, deletions, or live Gemini calls were used.
- Known configured credentials and current session/provider tokens were compared in memory with tracked content, production client assets, and inspected response bodies. No values were printed or detected in that content. The first history scan also checked credential-shaped API keys/DB URIs, excluding the documented placeholder URI.
- Reachable history scan: 85 blobs, no detected configured credential values. Production client asset scan: 13 files. Only `.env.example` is tracked; actual `.env`, generated Prisma output, and `.next` are ignored.
- Session cookies necessarily carry authentication credentials; their protected transport is distinct from exposing them in application JSON, HTML, RSC bodies, or JavaScript. Google's public client ID may appear in the required OAuth authorization redirect; no real ID is hardcoded in tracked application/client content.

## Verification

| Command/check | Result |
|---|---|
| Project Node runtime | 24.22.2 |
| npm test, preflight and after review | 48 passed, 0 failed |
| npm run typecheck | Passed |
| npm run build | Passed |
| Git whitespace check | Passed |
| npm ls --depth=0 | Installed direct dependencies valid |
| npm audit --json | 0 reported vulnerabilities at all severities; no upgrades applied |
| Source searches | No unsafe HTML, browser-owned authorization inputs, unused OpenAI SDK, extra test framework/infrastructure, or TODO/FIXME correctness items found |

No user-visible/runtime behavior changed, so no new browser regression is required. New OAuth/provider calls and another browser logout cycle were not needed for this review. The only repository change is this review record; final requirements and delivery-document work remain separate stages.
