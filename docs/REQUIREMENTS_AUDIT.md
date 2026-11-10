# Movie Memory - Final Requirements Audit

Audit date: 2026-11-10. Reviewed committed implementation: `d0a728c` (Stage 12), plus the documentation-only factual corrections in Stage 13. Scope: Base + Variant A + general requirements. Variant B is excluded.

## Summary

- **Base:** required product behavior exists; B12 retains the explicit AI-provider deviation.
- **Variant A:** cache, single-process coordination, and required tests are implemented. Failure behavior works with Gemini; the original OpenAI-specific wording in A05/A06/A09 retains the same provider deviation.
- **Required backend tests:** satisfied at the approved workflow/query-contract boundary; 48 tests total (9 validation, 39 fact workflow), not 48 separately mandated assignment cases.
- **General/security behavior:** implemented and reviewed in [SECURITY_REVIEW.md](SECURITY_REVIEW.md). Four mandatory delivery gaps remain: G13, G14, G16, G17.
- **Repository:** GitHub origin/main was readable and matched the Stage 12 commit at audit time. Reviewer access is not inferred from the author's access.
- **Variant B:** intentionally excluded; its absence is not a gap.
- **Remaining delivery work:** Stage 14's concise README architecture presentation, explicit variant/rationale, two-hour improvements, and development AI-usage note. This audit does not write those deliverables or declare full compliance.

### Provider deviation - literal compliance remains unmet

**Original required provider = OpenAI API. Implemented provider = Gemini Developer API.**

**Implemented behavior exists, but provider requirement is not literally satisfied without assignment-owner acceptance of Gemini as a substitute.**

This is one user-directed provider substitution affecting B12, G02, A05, A06, and the OpenAI-specific evaluation wording in A09. It is not five independent code defects. The original requirements are preserved in [REQUIREMENTS.md](REQUIREMENTS.md); D010/D012 record the implementation choice and failure boundary. No acceptance by the assignment owner has been recorded, and no provider switch was made during this audit.

## Evidence and status conventions

- Requirement IDs below are exactly the 40 existing IDs in REQUIREMENTS.md; no parallel numbering is introduced.
- **Satisfied** means implementation and the stated evidence support the requirement. **Satisfied with documented implementation choice** identifies an allowed interpretation, technology choice, or explicit evidence limitation.
- **Deviation** preserves a literal requirement mismatch. **Gap** means required delivery content is still missing/incomplete; the four identified gaps are deliberately deferred to Stage 14 under this stage's instructions. **Not applicable** is used for the optional video not undertaken.
- Test evidence names checked-in Node tests or identifies the absence of a dedicated unit test. Compilation is not treated as proof of real OAuth/provider operation.
- Manual/browser evidence is historical evidence from the completed stages and explicit user confirmations, not newly repeated browser testing. Terminal probes and provider stubs are labeled separately.
- The actual current code, tests, and Stage 12 review take precedence over stale planning-status sentences when determining implementation evidence. Source PDF requirements are not rewritten by a later implementation choice.

## Base requirements

| Requirement ID | Requirement summary | Scope | Status | Implementation evidence | Test evidence | Manual/browser verification evidence | Notes / limitations |
|---|---|---|---|---|---|---|---|
| B01 | Logged-out landing exposes “Sign in with Google” | Base | Satisfied | app/page.tsx renders the exact label; app/actions.ts starts Google sign-in | No dedicated page unit test; not explicitly required | Google login used in Stages 3-6; Stage 12 checked anonymous routes | Landing/login is `/`; no custom auth protocol |
| B02 | First-time authenticated user reaches onboarding | Base | Satisfied with documented implementation choice | Root/onboarding/dashboard pages call getCurrentUser; null persisted favoriteMovie routes to onboarding | Missing-movie workflow rejection is covered; route redirects are not unit-tested in the suite | Stage 4's nine-case routing matrix; Stage 5 signed-in onboarding and initial save | Approved routing interpretation: first-time means no saved movie, not newly created OAuth account |
| B03 | Returning user reaches dashboard | Base | Satisfied with documented implementation choice | Root redirects a user with a stored movie to dashboard; onboarding redirects completed users | Sequential requests resolve current persisted user/movie; dedicated redirect unit not required | User confirmed returning login in Stages 5 and 6 | Uses persisted state, never an OAuth new-account flag |
| B04 | First-time-only favorite-movie onboarding | Base | Satisfied with documented implementation choice | MovieForm and saveFavoriteMovie; updateMany matches current user id AND favoriteMovie null | Validator tests; no checked-in onboarding write integration test | Stage 5 browser save; competing submissions verified from terminal; Stage 12 completed-user overwrite rejected | No separate completion field and no editing endpoint |
| B05 | Trim and enforce server-side min/max length | Base | Satisfied with documented implementation choice | lib/movie.ts validates unknown input, trims, accepts 1-200, preserves case/internal spaces; action invokes it | All 9 validator cases: non-string/missing/file/empty/whitespace, trim, length boundaries, preservation | User confirmed whitespace rejection and padded-title save in Stage 5 | D004 supplies numeric limits; PDF supplies no numbers |
| B06 | Persist movie in Postgres for authenticated user | Base | Satisfied | User.favoriteMovie in Prisma/Postgres; action derives id through validated current user | No dedicated onboarding persistence unit; ownership-aware fact tests remain separate | Stage 5 database inspection and returning-login persistence; Stage 12 forged fields left stored data unchanged | Browser userId/email/accountId never selects the write owner |
| B07 | Display Google-backed name and email | Base | Satisfied | Google/Auth.js adapter populates User; current-user helper selects profile; dashboard renders it | No dedicated profile component unit test | User confirmed fields in Stage 6; Stage 12 checked current-user selection and safe session JSON | Missing email produces a profile message, not an invented address |
| B08 | Display Google photo when available | Base | Satisfied with documented implementation choice | Conditional image in dashboard, fixed dimensions/alt/no-referrer; omitted when absent | No dedicated image component unit test | User confirmed photo in Stage 6; terminal missing-photo variant restored afterward | Ordinary browser image; no server URL-fetching feature |
| B09 | Display persisted favorite movie | Base | Satisfied | Dashboard uses favoriteMovie from getCurrentUser's PostgreSQL query | Fact workflow proves use of exact stored movie; no dedicated dashboard rendering unit | Stage 6 browser refresh/re-login; Stage 12 query tampering could not change displayed movie | Client/query state is not the source |
| B10 | Dashboard Logout signs user out | Base | Satisfied with documented implementation choice | app/actions.ts delegates to Auth.js signOut; dashboard form invokes it | No dedicated logout unit; installed session-delete/cookie-cleanup path reviewed in Stage 12 | User confirmed logout, protected-route redirect, and re-login in Stage 6 | Post-logout `/` destination is allowed; live logout was not repeated in this audit |
| B11 | Unauthenticated dashboard redirects to login | Base | Satisfied with documented implementation choice | Dashboard independently calls getCurrentUser and redirects to `/`; incomplete users go to onboarding | Unauthenticated fact requests separately reject; route guard verified via terminal | Stages 4/6 routing; Stage 12 anonymous direct navigation | PDF leaves login URL open; root contains login control |
| B12 | Generate/display fun fact using OpenAI | Base | Deviation | lib/gemini.ts calls official Gemini SDK server-side; authenticated action and FactPanel display saved result | Usable-output, stored-movie, persistence-before-success and safe-error tests | Stage 7 real Gemini generation/database records and user-confirmed display | Behavior exists with Gemini, not OpenAI. Literal provider requirement needs assignment-owner acceptance |
| B13 | Persist generated facts | Base | Satisfied | generateFact awaits prisma.movieFact.create via action before safe DTO; generation-completion timestamp | Initial/expired generation, deferred persistence, failed-insert tests prove saved-result contract and append-only behavior | Stages 7-9 inspected new rows/IDs/timestamps; Stage 12 rendering/prefetch left facts intact | No history UI implied; unpersisted text is never successful |

## Variant A requirements

| Requirement ID | Requirement summary | Scope | Status | Implementation evidence | Test evidence | Manual/browser verification evidence | Notes / limitations |
|---|---|---|---|---|---|---|---|
| A01 | Reuse latest matching fact younger than 60 seconds | Variant A | Satisfied | generateFact queries userId + exact movie, generatedAt desc; age below 60,000 returns original safe DTO | 10,000/59,999 ms tests assert same fields/time, zero generation/inserts; sequential reuse and latest matching tests | Stage 8 controlled refresh pair: one new row across expired request plus fresh refresh | Postgres rows are cache; no timestamp refresh or client cache. Provider deviation remains global |
| A02 | Regenerate/store/return expired fact | Variant A | Satisfied with documented implementation choice | Missing row or age >= 60,000 enters generate/validate/timestamp/persist path; previous rows retained | 60,000/60,001 ms and missing-row tests; old row unchanged; returned id is newly saved | Stage 8 expired/fresh sequence validated by IDs, timestamps, counts (6 to 7) | D002 resolves equality: 59.999s fresh, 60.000s expired; PDF equality is unspecified |
| A03 | Prevent simultaneous duplicate generation on bursts | Variant A | Satisfied with documented implementation choice | Private Promise map keyed by JSON.stringify([User.id, movie]); register synchronously before deferred cache lookup | Held generation/persistence/lookup tests prove genuine overlap, one provider/write, identical saved result, cleanup/retry and independent scopes | Stage 9 two overlapping authenticated HTTP calls returned identical DTOs and added one row (7 to 8) | Guarantee is within the same Node process/module instance; no distributed guarantee |
| A04 | Use permitted guard and document limitation | Variant A | Satisfied with documented implementation choice | D011, README concurrency section, facts.ts implement shared in-memory Promise; identity-checked finally cleanup | Success/failure cleanup, collision-safe tuple, different-user/movie tests | Stage 9 HTTP result; Stage 12 source review | PDF p.3 expressly permits simple in-memory locking with its limitation documented |
| A05 | On OpenAI timeout/error return latest stored fact | Variant A | Deviation | SDK request errors become MovieFactProviderError; shared workflow returns already-loaded latest matching row with original timestamp | Timeout/error fallback, mixed-history selection, concurrent fallback, retry, unchanged-row tests | Stage 10 injected timeout with real DB reads and normal session validation: 8 to 8, one shared attempt plus later retry | Failure semantics work for Gemini, not OpenAI. Not a live forced-provider failure. D012 excludes unusable/configuration/internal/database errors |
| A06 | On OpenAI failure without stored data return friendly error | Variant A | Deviation | Outer safe-error contract after typed request failure with no matching row; no fake insert | No-stored-fact provider failure, concurrent failure/cleanup/retry, foreign-user/movie-only fallback denial | Terminal/UI error contract inspected; no new live failure or credential change required | Safe behavior exists for Gemini; original provider-specific requirement remains a deviation |
| A07 | Backend cache tests | Variant A | Satisfied | Node built-in runner executes lib/facts.test.ts with fake time, query filtering and provider/persistence doubles | Fresh, 59,999, 60,000, expired/missing, no-call/no-write/time-preservation, stale fallback and retry assertions all pass | Stage 8 live cache evidence corroborates; Stage 13 suite passes | Subject is required, not a particular framework/count; no real 60-second waits or API calls |
| A08 | Backend tests prevent cross-user fact reads | Variant A | Satisfied with documented implementation choice | Actual workflow constructs ownership criteria; production action forwards them unchanged to Prisma findFirst | User B fresh/absent/stale cases among newer User A same-title facts; criteria applied to mixed rows; concurrent isolation; Stage 11 temporary-copy filter/order mutations failed as expected | Stage 12 forged ownership rejected; no new two-account OAuth browser/integration environment | Proves workflow/query contract, not live Prisma/OAuth integration. This is the explicit D006 budgeted test strategy |
| A09 | Backend/data-model/cache/concurrency/safe OpenAI assessment | Variant A | Deviation | Schema relations/index, explicit cache math, Promise registration/cleanup, server-only bounded SDK, D002/D011/D012 and security review | Current 48-test suite plus typecheck/build; cache/ownership/concurrency/failure assertions | Historical live flow/DB/HTTP checks above; Stage 12 review | Evaluation criterion, not another feature. Backend evidence exists; its OpenAI-specific aspect retains the same provider deviation; evaluator judgment is not guaranteed |

## General, security, and delivery requirements

| Requirement ID | Requirement summary | Scope | Status | Implementation evidence | Test evidence | Manual/browser verification evidence | Notes / limitations |
|---|---|---|---|---|---|---|---|
| G01 | Movie Memory, Base + one variant, modest scope | General | Satisfied with documented implementation choice | Base + Variant A implemented in one App Router app; Variant B absent | 48 scoped backend/validation tests; no extra framework | Stage-by-stage verified implementation; scope inspected in this audit | Roughly three hours is an expectation, not a stated cutoff. No claim that actual elapsed work was three hours |
| G02 | Required technology stack | General | Deviation | TypeScript, Next/App Router, React, Tailwind, Postgres, Prisma, Google OAuth actually used; Gemini replaces OpenAI | Typecheck/build; schema/client generation; provider-stub workflow tests | Real Google/Postgres/Gemini evidence in completed stages | Seven required technologies are used; OpenAI is not. See technology comparison below; not fully compliant overall |
| G03 | Server-side movie validation | General | Satisfied | Validator called inside authenticated server action | All 9 validator tests pass | Stage 5 invalid/trimmed submissions and terminal bypass checks | Repeats B05; client limits are convenience |
| G04 | Users cannot access/modify others' data | General | Satisfied with documented implementation choice | Validated application id drives reads, atomic onboarding write, fact lookup/create, fallback and key | Actual query-contract ownership, fresh/stale/absent same-title isolation and independent concurrency tests | Stage 12 route/action identity tampering; prior onboarding write checks | No claim of a new two-account live integration test; known boundary described in D006/security review |
| G05 | Secrets are not exposed to client | General | Satisfied | Server-only modules, safe session allowlist/DTO, ignored real env, placeholder example | Existing safe provider/database error tests | Stage 12 tracked/history/client/response scans found no detected credentials; JSON allowlist/cookie protections checked | Full details in SECURITY_REVIEW.md; normal HttpOnly session-cookie transport and public OAuth client identifier are distinguished from leaked application data |
| G06 | Graceful missing Google name/photo handling | General | Satisfied with documented implementation choice | Name fallback and conditional photo; absent email has explicit profile error | No dedicated rendering unit; not explicitly required | Stage 6 terminal null-field variants were restored; normal browser profile/photo confirmed | Fallback wording/rendering is a project choice |
| G07 | Explain schema, cache, tradeoffs, failure cases | General | Satisfied with documented implementation choice | Small modules; data-model rationale and interview columns in ARCHITECTURE.md; D002/D004/D009-D012 | Deterministic tests make boundaries and failure cases inspectable | Explanations reviewed against actual implementation | Documentation supports explainability; this audit cannot certify the candidate's interview understanding |
| G08 | General quality/evaluation criteria | General | Satisfied with documented implementation choice | Auth/model/ownership/error/code-structure evidence and Stage 12 review | 48 passing tests plus typecheck/build | User-confirmed required flows; terminal review evidence | Qualitative assessment, not a guarantee of evaluator score; provider and delivery gaps remain explicit |
| G09 | Provide GitHub repository | General | Satisfied with documented implementation choice | Configured origin is [adityashahari1/movie-memory](https://github.com/adityashahari1/movie-memory); remote main matched Stage 12 HEAD | Read-only git ls-remote comparison succeeded | Remote verified during this audit, no publication/access changes | Does not prove hiring-reviewer permissions; audit/delivery commits still need committing/pushing by the user |
| G10 | README setup instructions | General | Satisfied with documented implementation choice | README documents Node/npm, npm ci, env setup, migration deploy, dev/start/verification commands | Existing install/build/runtime stages; current typecheck/build | Application setup was used in earlier stages | No new clean-room install/fresh database was created solely for this audit; readability cleanup remains Stage 14 |
| G11 | README environment variables | General | Satisfied | README + .env.example cover DATABASE_URL, Google id/secret, AUTH_SECRET, AUTH_URL, GEMINI_API_KEY | Source/configuration cross-check; no secret-valued fixtures | Credentials configured privately and live integrations previously verified | Documents implemented Gemini configuration; this does not satisfy the original OpenAI provider requirement |
| G12 | README migration steps | General | Satisfied | Committed initial migration; README deploy and create-only/review guidance; prisma.config.ts | Prisma generation/typecheck/build pass | Stage 2 real migration/connectivity verification | No destructive reset or new database needed here |
| G13 | README architecture overview of 1-2 pages | General | Gap | Architecture material exists across README and detailed ARCHITECTURE.md; a concise bounded delivery overview is not yet established | Documentation inspection, not a runtime-test subject | Pre-correction README was 189 lines/about 2,611 words including setup/history | Present but needs Stage 14 delivery cleanup. PDF page target applies to the architecture overview, not automatically the entire README; Markdown page count is format-dependent |
| G14 | README clearly states chosen variant and why | General | Gap | D001 and ARCHITECTURE.md state Variant A and rationale; README has no explicit variant/rationale statement | README content inspection | No browser verification applies | Present elsewhere but missing in the required README location; Stage 14 work |
| G15 | README explains key tradeoffs | General | Satisfied with documented implementation choice | README explains single-process coordination limits, server/cache choices, test boundary, and provider substitution; linked decision docs give alternatives | Implementation/doc cross-check | Relevant tradeoffs exercised in earlier stages | Content exists, but Stage 14 should consolidate it into reviewer-facing delivery prose |
| G16 | README explains improvements with two more hours | General | Gap | No explicit two-hour improvements section/list in README | Documentation inspection | Not a browser/runtime subject | Missing; write the explanation in Stage 14, not the proposed improvements themselves |
| G17 | Short bullet note on development AI usage | General | Gap | No AI-usage disclosure note found in tracked files or README | Tracked-file/content inspection | The conversation shows AI assistance, but no deliverable note yet | Missing; Stage 14. The application's Gemini integration is not a development AI-usage disclosure |
| G18 | Optional 3-5 minute walkthrough video | General | Not applicable | No video/reference supplied for this audit | Not required | No video reviewed | Optional and encouraged, not a mandatory gap or Variant B feature |

## Technology comparison

| Original required technology | Actual use/evidence | Result |
|---|---|---|
| TypeScript | .ts/.tsx source, strict tsconfig; installed 5.9.3 | Satisfied |
| Next.js, App Router preferred | Installed Next 16.4.5; app routes, server components/actions, auth handler | Satisfied, preferred router used |
| React | Installed React/React DOM 19.3.1; rendered components and hooks | Satisfied |
| TailwindCSS | Installed 4.3.5; globals.css import, component utilities, Turbopack integration | Satisfied |
| Postgres | Prisma postgresql datasource, committed migration, actual stage DB persistence/inspection | Satisfied |
| Prisma | Matching 7.10.1 CLI/client/pg adapter; models, queries and generation | Satisfied |
| Google OAuth | Auth.js v5 Google-only provider, Prisma adapter/database sessions, real completed Google flows | Satisfied |
| OpenAI API | Actual official Google GenAI 3.0.0 SDK, Gemini Developer API/model | **Deviation - not literally satisfied without assignment-owner acceptance** |

## Deliverables disposition (not a Stage 14 rewrite)

| Deliverable | Current disposition | Evidence / remaining work |
|---|---|---|
| GitHub repository | Already sufficient | Remote main matched committed Stage 12 code; confirm reviewer access and push later deliverable commits at handoff |
| Setup/env/migration instructions | Already sufficient, presentation can be consolidated | Existing README commands/config match implementation; preserve secret-free examples |
| Architecture overview | Present but needs final delivery cleanup | Convert existing material into a concise identifiable 1-2 page overview; do not invent architecture |
| Schema/data-model explanation | Already sufficient; consolidate for delivery | Database section + ARCHITECTURE.md model rationale cover User, Account, Session, MovieFact, FK/index choices |
| Cache explanation | Already sufficient | User/movie selection, generation time, strict 60-second boundary, no sliding expiration |
| Concurrency explanation | Already sufficient | Shared Promise, registration/cleanup and explicit same-process limitation |
| Failure/fallback explanation | Already sufficient | Provider-only fallback, unchanged timestamp, no-data safe error, separate database failure |
| README variant/rationale | Missing in README | Choice exists in D001/architecture; add explicit README statement in Stage 14 |
| Tradeoffs | Present but needs final delivery cleanup | Existing explanations should be consolidated, not expanded into infrastructure |
| Two-hour improvements | Missing | Add a short realistic prioritization in Stage 14; implementation is not requested |
| Development AI-usage note | Missing | Add truthful short bullets in Stage 14, distinct from the app's AI-provider feature |
| Final README quality | Present but needs final delivery cleanup | Historical stage logs are not the final reviewer-facing narrative; full rewrite deferred |
| Video | Optional, not supplied | No mandatory action |

## Excluded scope

**Variant B status: Not applicable / Variant B excluded.** REQUIREMENTS.md assigns no Variant B requirement IDs, so none are invented here. Typed REST client orchestration, inline movie editing/optimistic Save-Cancel, and 30-second client caching are not missing Variant A requirements. No movie-edit/history/settings UI, streaming, tools/agents, extra navigation infrastructure, Redis/queues, or distributed locking was added. FactPanel's transient loading/result state is presentation state, not a client TTL cache. Append-only fact rows do not create a history UI.

## Verification evidence and its limits

- Stages 3-6 establish actual Google login, stable application identity, onboarding/returning routing, displayed profile/movie, refresh, logout and re-login. Explicit user confirmations exist for Stages 5/6; Stage 4's nine-case matrix was terminal-verified.
- Stage 5's user-confirmed blank/padded-title test and database checks establish server validation/persistence. Stage 6 terminal missing-name/photo/email variants were restored; the normal browser display was user-confirmed.
- Stage 7's real Gemini requests created persisted facts and the user confirmed display. This is Gemini evidence, not successful OpenAI evidence.
- Stage 8's user-operated expired request plus immediate refresh was checked through stored IDs/timestamps/counts, not wording similarity. One new fact was observed across the controlled pair.
- Stage 9's authenticated concurrent HTTP check used normal existing-session validation and returned identical persisted DTOs with one inserted row. Unit tests directly count provider calls; the live provider was not instrumented.
- Stage 10's synchronized injected timeout used real DB reads and normal HTTP session validation; it was not a forced live provider failure. Existing facts/timestamps remained unchanged, and a later attempt was observed.
- Stage 11 strengthened mixed-user fresh/absent/stale query fixtures. Temporary copies dropping userId/movie filters or reversing ordering failed the focused tests; the unchanged control passed. Production code was not mutated.
- [SECURITY_REVIEW.md](SECURITY_REVIEW.md) records Stage 12 session/route/action/prefetch/origin/secret/dependency checks and their limits. The actual two-account OAuth/Postgres integration environment remains optional and was not claimed.
- Stage 13 inspected all seven PDF pages, every existing requirement ID, current code/tests/docs and GitHub main. No new browser/OAuth/Gemini calls or DB edits were required. This document does not turn prior historical row counts or per-stage test totals into claims about current live state.

## Gap classification and factual corrections

- **Real application requirement gap:** none found beyond the already-explicit provider substitution. No application, schema, dependency or test code was changed.
- **Explicit documented deviation:** Gemini/OpenAI substitution; record visibly, obtain assignment-owner acceptance if required, and do not silently switch providers or mark literal compliance.
- **Delivery gaps:** G13/G14/G16/G17 remain open under the explicit Stage 14 deferral. They are not fixed by calling existing code complete.
- **Documentation-only mismatches corrected:** stale auth/logout pending status; Prisma setup still described as deferred; validation limits still called undecided; nonexistent tests/authorization.test.ts structure; current/past architecture labels; historical zero-fact counts and 17/25/36/45 test totals presented as current; the unrecorded extra Stage 9 browser check distinguished from verified Stage 6/12 evidence; obsolete remaining test/security/audit status.
- **Out of scope / optional:** Variant B, extra infrastructure, new product features, and optional video were not implemented for audit optics.

## Final Stage 13 checks

Preflight: clean tree, Stage 12 committed as d0a728c, Node 24.22.2, 48/48 tests passed.

| Final check after factual documentation corrections | Result |
|---|---|
| Requirement-ID/column consistency | All 40 existing IDs exactly once; all eight required columns populated |
| npm test | 48 passed, 0 failed |
| npm run typecheck | Passed |
| npm run build | Passed |
| Git whitespace/document checks | Passed |
| Product/test/schema/dependency changes | None |
| Browser regression | Not needed for documentation-only corrections |
| Live Gemini requests / DB edits in Stage 13 | None |

The build printed an informational Prisma major/release-candidate update notice. The pinned Prisma 7.10.1 set was retained; no dependency upgrade was performed.

No Stage 14 README/AI-usage content was written and no commit/push was performed automatically.
