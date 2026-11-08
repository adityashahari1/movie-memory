# Movie Memory Requirements

Source: SWE Take-Home Exercise (Full-Stack) PDF. All seven pages were reviewed.

This covers the confirmed **Base + Variant A + general requirements** scope. Variant B is an alternative, so its features are excluded. No architecture or application code is proposed below.

## 1. Requirements matrix

**Reading the matrix:**

- **Implications** identify responsibilities, without choosing an implementation.
- **Automated test: No** means the PDF does not explicitly require a test for that item.
- Preferences, optional items, and evaluation criteria are labeled accordingly.
- Page numbers refer to the assignment PDF.

### Base requirements

| Requirement ID | Feature | Exact expected behavior | Server/client/database/security implications | How I can manually verify it | Automated test explicitly required? | Category |
|---|---|---|---|---|---|---|
| B01 · p.2 | Logged-out landing page | Visiting `/` while unauthenticated shows a landing page containing **“Sign in with Google.”** | Client: display the landing page and sign-in control. Server/auth: recognize unauthenticated visitors. | Open `/` in a private browser window; check the label and initiate Google sign-in. | No | Base |
| B02 · p.2 | First-time login routing | After successful Google login, first-time users are redirected to onboarding. | Server/auth: distinguish first-time users and route accordingly. The PDF does not define that distinction precisely. | Sign in with an account that has not completed onboarding; observe the destination. | No | Base |
| B03 · p.2 | Returning-user login routing | After successful Google login, returning users go to the dashboard. | Server/auth: recognize returning users. | Complete onboarding, log out, then sign in again; expect the dashboard. | No | Base |
| B04 · p.2 | First-time onboarding | Prompt the user for their favorite movie. Onboarding is first-time only. | Client: provide the prompt and submission flow. Server: retain enough information to recognize completed onboarding. | Complete onboarding, then sign in again; the prompt should not repeat. | No | Base |
| B05 · p.2 | Movie input validation | Validate on the server: **trim input and enforce minimum and maximum length**. Numeric limits are not supplied. | Server: validation must work independently of client validation. DB: persist accepted input. | Submit surrounding whitespace and values outside the chosen limits, including through a direct request that bypasses the form. | No | Base |
| B06 · p.2 | Movie persistence and ownership | Store the favorite movie in **Postgres**, associated with the **authenticated user**. | Server/security: associate the write with the authenticated identity. DB: persist that association. | Save a movie, reload and sign in again; confirm persistence. Use a second account and confirm separation. | No | Base |
| B07 · p.2 | Dashboard identity | Display the user’s **name and email from Google**. | Server/client: obtain and display Google profile information. Missing-name handling is covered by G06. | Compare the dashboard information with the signed-in Google account. | No | Base |
| B08 · p.2 | Dashboard photo | Display the user’s Google photo **if available**. | Client: conditionally display the photo; handle its absence gracefully. | Check an account with a photo and a profile fixture without one. | No | Base |
| B09 · p.2 | Dashboard favorite movie | Display the favorite movie **from the database**. | Server/DB: retrieve the authenticated user’s persisted movie. Client: display it. | Save a movie, reload the dashboard, and compare the displayed value with the stored value. | No | Base |
| B10 · p.2 | Logout | Provide a **Logout button** on the dashboard. Its expected function is signing the user out; the subsequent destination is unspecified. | Client: provide the control. Server/auth: end authenticated access. | Click Logout, then navigate directly to `/dashboard`; it must require login. | No | Base |
| B11 · p.2 | Dashboard access protection | An unauthenticated visit to `/dashboard` redirects to login. The login URL is not specified. | Server/auth/security: enforce access protection. | Open `/dashboard` in a private window and again after logout; expect a login redirect. | No | Base |
| B12 · p.2 | OpenAI movie fact | Display a fun fact about the user’s favorite movie using **OpenAI**. Generating on every request is explicitly acceptable for Base alone; Variant A adds caching constraints. | Server: integrate with OpenAI using the user’s movie. Client: display the fact. Security: protect credentials. | Sign in, save a movie, request/view a fact, and confirm the OpenAI integration is used. | No | Base |
| B13 · p.2 | Fact persistence | Store generated facts in the database. | Server/DB: persist generated results. Variant A requires identifying the latest fact for a user and movie. | Generate a fact and inspect the database for its persisted record. | No | Base |

### Variant A requirements

| Requirement ID | Feature | Exact expected behavior | Server/client/database/security implications | How I can manually verify it | Automated test explicitly required? | Category |
|---|---|---|---|---|---|---|
| A01 · p.3 | Fresh cache reuse | If the **most recent fact for this user + movie is less than 60 seconds old**, return that cached fact. | Server/DB: identify the correct user/movie fact and evaluate its age. Security: cache reuse must respect ownership. | Generate a fact, request again before 60 seconds, and confirm the stored fact is returned without another generation. | **Yes**, through A07 | Variant A |
| A02 · p.3 | Expired cache regeneration | The PDF requires a new fact to be generated, stored, and returned when the most recent fact is **older than 60 seconds**, but leaves equality unspecified. **Project decision: age >= 60 seconds is expired.** | Server: evaluate expiration using the chosen boundary and generate when required. DB: persist the new result. | Request when the fact is at least 60 seconds old and confirm a new generation and database write. Different wording alone is not reliable proof. | **Yes**, through A07 | Variant A |
| A03 · p.3 | Burst/idempotency protection | Prevent multiple new facts from being generated simultaneously when the user refreshes quickly or has multiple tabs open. | Server: coordinate overlapping generation requests. DB involvement depends on the permitted approach chosen. | With no fresh cache, send concurrent requests from multiple tabs; confirm only one generation proceeds for the same user/movie. | No separate concurrency test explicitly required | Variant A |
| A04 · p.3 | Permitted protection approach | Choose one listed approach: **DB transaction guard**, **“generation in progress” flag**, **unique constraint per user per 60-second window**, or **simple in-memory lock**. An in-memory lock **must have its limitation documented**. | Server/DB: implement the selected protection. Documentation: explain the limitation if using an in-memory lock. No choice is made here. | Inspect the implementation; exercise A03; if applicable, check the documented in-memory limitation. | No | Variant A |
| A05 · pp.3–4 | OpenAI failure with cached data | If OpenAI fails through a **timeout or error**, return the most recent cached fact if one exists. No freshness restriction is stated for this fallback. | Server: catch upstream failures and retrieve the applicable cached fact. Security: preserve user/movie isolation. | Let a fact become stale, simulate an OpenAI timeout/error, and confirm the previous fact is returned. | No | Variant A |
| A06 · p.4 | OpenAI failure without cached data | If OpenAI fails and no cached fact exists, return a **user-friendly error**. | Server/client: communicate failure clearly. Security: keep secrets out of error responses. | For a user/movie with no fact, simulate a timeout/error; inspect the response and visible message. | No | Variant A |
| A07 · p.4 | Cache tests | Add backend tests for **60-second cache logic**. The PDF specifies the subject, not a framework, test count, or detailed case list. The project decision adds the boundary cases below. | Backend test coverage must exercise cache behavior, including the chosen expiration boundary. | Run the tests and confirm **59.999s → cached** and **60.000s → expired**, along with fresh reuse and expired regeneration. | **Yes**; exact boundary cases are a project decision | Variant A |
| A08 · p.4 | Authorization tests | Add backend tests showing that **a user cannot fetch another user’s facts**. | Server/security: fact access must enforce ownership. Tests must demonstrate cross-user denial. | Run the tests; also attempt to retrieve one account’s fact while authenticated as another. | **Yes** | Variant A |
| A09 · p.4 | Variant A evaluation emphasis | Evaluation emphasizes **data modeling quality, correct cache windows, concurrency reasoning, safe OpenAI integration, and backend correctness**. These are assessment criteria, not additional named features. | Review the implementation and explanation against these criteria. | Explain the data relationships, timing behavior, overlapping-request handling, and failure behavior. | No additional tests specified beyond A07–A08 | Variant A |

### General, security, and delivery requirements

| Requirement ID | Feature | Exact expected behavior | Server/client/database/security implications | How I can manually verify it | Automated test explicitly required? | Category |
|---|---|---|---|---|---|---|
| G01 · pp.1, 3, 7 | Product and scope | Build the small full-stack **Movie Memory** application: Base plus **exactly one variant**. The expectation is **~3 hours**. Correctness, clarity, and thoughtful tradeoffs take priority over feature volume. | Scope constraint across the work; no extra feature is implied. | Check the Base and chosen-variant requirements; review unnecessary scope. | No | General |
| G02 · p.1 | Required technology | Use **TypeScript, Next.js, React, TailwindCSS, Postgres, Prisma, Google OAuth, and the OpenAI API**. Next.js **App Router is preferred**, rather than mandatory. | Applies across server, client, database, authentication, and external integration. | Inspect dependencies, source, configuration, and actual integrations; installation alone does not demonstrate use. | No | General |
| G03 · pp.5–6 | Server-side validation everywhere applicable | Validate movie input on the server. This repeats and reinforces B05. | Server/security: client-side checks cannot be the only enforcement. | Bypass client checks and submit invalid movie input directly. | No | General |
| G04 · p.6 | User data isolation | Users cannot **access or modify other users’ data**. This is broader than fact reads. | Server/security/DB: enforce ownership on applicable reads and writes. | With two accounts, attempt cross-user reads and writes by altering any exposed identifiers; confirm no disclosure or modification. | **Fact-read isolation explicitly requires tests under A08**; broader isolation tests are not specifically mandated. | General |
| G05 · p.6 | Secret protection | Avoid exposing secrets to the client. | Server/security: keep credentials and other secrets out of browser-delivered code and responses. | Inspect browser assets, network responses, and errors for secret values. | No | General |
| G06 · p.6 | Missing Google profile fields | Gracefully handle a missing Google **photo or name**. The specific fallback is unspecified. | Client/server: absent fields must not break the experience. | Use profile data missing each field; confirm the application remains usable without a crash or broken rendering. | No | General |
| G07 · pp.1, 7 | Ability to explain the submission | You must clearly explain everything submitted, including **schema choices, caching strategy, tradeoffs, and failure cases**. Documentation, Google, and AI tools are allowed. | Implementation and documentation must support an understandable explanation. | Walk through those decisions and explain relevant code without relying on unexplained generated material. | No | General |
| G08 · p.6 | General evaluation criteria | Evaluation covers **auth flow correctness, data modeling, security/authorization, error handling, code clarity/structure, ability to explain decisions, and depth in the chosen variant**. | Quality criteria across the submission; no extra feature list is prescribed. | Review the completed flow, source, and explanation against all seven criteria. | No additional tests specified | General |
| G09 · p.6 | Repository | Provide a **GitHub repository**. Public/private visibility and deployment are not specified. | Delivery requirement. | Open the repository and confirm the submitted work is present and accessible to the reviewer. | No | General |
| G10 · p.6 | README setup instructions | Include setup instructions in the README. | Documentation: explain how to run the submission. | Follow the documented setup from a clean checkout. | No | General |
| G11 · p.6 | README environment variables | Document the required environment variables. | Documentation/security: identify required configuration without exposing secret values. | Compare the documented variables with what the application requires. | No | General |
| G12 · p.6 | README database migrations | Include database migration steps. | Documentation/DB: explain how to prepare the database. | Follow the steps against an empty database. | No | General |
| G13 · p.6 | README architecture overview | Include an **architecture overview of 1–2 pages**. This is a submission requirement; it does not require designing it during this extraction. | Documentation of the eventual implementation. | Confirm the overview exists, meets the stated length, and matches the submitted system. | No | General |
| G14 · pp.3, 6 | README variant selection | Clearly state **which variant was chosen and why**. For this scope, that is Variant A. | Documentation requirement. | Locate the explicit selection and rationale. | No | General |
| G15 · p.6 | README tradeoffs | Include the key tradeoffs made. | Documentation: explain consequential implementation choices. | Confirm the tradeoffs describe the actual submission. | No | General |
| G16 · p.6 | README future improvements | Describe what you would improve with **two more hours**. Implementing those improvements is not requested. | Documentation requirement. | Locate the proposed improvements and their rationale. | No | General |
| G17 · p.6 | AI usage disclosure | Provide a **short note in bullets describing how AI was used**. The PDF does not require a separate file. | Documentation requirement. | Confirm the note accurately describes AI assistance used during the work. | No | General |
| G18 · p.6 | Walkthrough video | **Optional but encouraged:** a **3–5 minute video** explaining key implementation decisions. | Optional delivery item. | If supplied, check its duration, accessibility, and explanation. | No | General — optional |

## 2. Explicit requirements, assumptions, and open choices

### 1. Explicit requirements

The mandatory completion scope is:

- **All Base requirements**, **Variant A**, and the applicable **general/security/delivery requirements** above.
- The complete required technology stack.
- Server-side movie validation, persisted user-associated movies and facts, Google authentication, dashboard access protection, and user data isolation.
- Variant A’s user-and-movie cache, burst protection, and OpenAI failure handling.
- Automated backend tests covering **two required subjects: cache logic and cross-user fact authorization**. The PDF does not specify exactly two test cases.
- The GitHub repository, all listed README content, and the AI usage note.
- An explanation of the submitted implementation and its decisions.

The following distinctions are explicit in the PDF:

- **~3 hours is a time expectation**, not a stated hard cutoff.
- **App Router is preferred**, while Next.js itself is required.
- Generation on every request is permitted for **Base alone**; Variant A constrains that behavior.
- The listed burst-protection mechanisms are alternatives; you choose one.
- An in-memory lock is explicitly acceptable **with its limitation documented**.
- The walkthrough video is optional.
- Evaluation criteria guide implementation quality; they do not authorize additional product features.

### 2. Reasonable engineering assumptions

These are practical interpretations, **not additional requirements stated by the PDF**:

| Assumption | Reason and boundary |
|---|---|
| A user who has not saved a favorite movie still needs onboarding, even if their Google account already exists in the application. | The PDF does not define “first-time” or address interrupted onboarding. This interpretation keeps the required flow completable. |
| Apply the chosen length limits to the trimmed movie value and reject whitespace-only submissions. | This gives practical meaning to “trim input, min/max length.” The actual limits remain undecided. |
| Successful onboarding leads to the dashboard. | This connects the required flows, but the post-save destination is not expressly stated. |
| When no fact exists, generate and store the initial fact. | This follows from Base fact generation; Variant A does not separately describe the empty-cache case. |
| Failure fallback uses the latest fact for the **same authenticated user and movie**, even when stale. | This follows the cache scope established earlier in Variant A and the requirement to preserve ownership. |
| Cache verification should check whether generation occurred, not merely whether the displayed text changed. | OpenAI can produce identical text on separate calls, so text comparison alone cannot establish caching or burst protection. |

#### Explicit decision: 60-second cache boundary

**Decision:** Treat a fact aged **60 seconds or more** as expired (`age >= 60 seconds`). This is a chosen project rule resolving an ambiguity, rather than an explicit requirement from the PDF.

**Reason:** The specification guarantees cache reuse only when `age < 60s`. Using `age >= 60s` as expired creates a simple deterministic boundary.

**Tests:**

- **59.999s → cached**
- **60.000s → expired**

### 3. Things the assignment intentionally leaves open

The PDF either expressly offers a choice or supplies no exact rule for these matters. They should remain decisions rather than invented requirements.

| Area | What remains open |
|---|---|
| Validation details | Numeric minimum/maximum lengths, exact validation messages, and normalization beyond trimming. No movie-catalog lookup or proof that a title exists is requested. |
| Authentication details | OAuth/session library, session duration, and the precise definition of completed onboarding. |
| Navigation | Onboarding and login URLs, authenticated behavior at `/`, post-logout destination, and direct `/dashboard` access by a signed-in user with incomplete onboarding. |
| Data model | Tables, fields, relationships, indexes, and fact retention policy, subject to required persistence, ownership, and caching behavior. |
| Server interface | Variant A does not mandate particular API paths, response shapes, HTTP statuses, or a typed client wrapper. |
| Cache details | Timestamp precision and the precise timestamp used to measure fact age. The PDF leaves equality at 60 seconds unspecified; the explicit decision above resolves it for this project. |
| Concurrency details | Which listed protection approach to use, what overlapping callers receive while generation is running, and recovery behavior after an interrupted generation. The required outcome remains prevention of simultaneous duplicate generation. |
| OpenAI integration | Model, prompt, fact length/format, timeout duration, and retry policy. Independent fact verification or citations are not requested. |
| Presentation | Visual design, exact error wording, and missing-name/photo fallbacks, subject to the required content and graceful behavior. |
| Testing | Framework, test organization, total test count, and coverage percentage. Concurrency and failure tests are not explicitly required, although their underlying behaviors are required. |
| Delivery environment | Hosting provider, deployed URL, Docker, CI, and repository visibility are not specified deliverables. |
| Documentation packaging | Where the AI note appears and how README page length is represented in Markdown. |

For the stated scope, **inline movie editing, optimistic updates, Save/Cancel controls, a typed API client, and the 30-second client cache belong to Variant B and are not required for this Variant A submission**.
