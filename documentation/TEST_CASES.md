# Test Cases — Notes App (PS AQA Tech Task)

> **Status:** Draft for review. This document lists *what* we will test and *why*. No automated tests are written yet — that comes after this list is approved.
>
> **System under test:** Small notes app with authentication (Symfony + API Platform backend, MySQL, MailHog for email, vanilla-JS SPA frontend).
> - App UI: `http://ec2-18-220-190-172.us-east-2.compute.amazonaws.com:4444/`
> - API docs: `…:4444/api/doc` · `…:4444/api/doc.json`
> - MailHog inbox: `…:8025/`
> - Seed credentials: `test@test.test` / `12345678`

---

## 1. Scope & approach

**Goal.** Cover the API with automated tests, and add UI E2E coverage for the most important user flows. Prioritise business-critical paths (auth + notes CRUD + ownership isolation) as P0, then broaden into negative, boundary, and contract checks.

**Test layers.**
| Layer | What it covers | Tooling intent (later) |
|---|---|---|
| API | Endpoint contracts, validation, auth/authorization, data isolation, pagination/search/sort | HTTP client + assertion lib (e.g. Playwright APIRequest / pytest+requests / RestAssured) |
| UI E2E | Real user flows through the browser against the running app | Playwright / Cypress |
| Integration (email) | Sign-up confirmation email delivery + link | MailHog HTTP API (`/api/v2/messages`) |

**Priority legend.** `P0` = must pass / release-blocking · `P1` = important · `P2` = nice-to-have / edge.
**Type legend.** `+` positive · `-` negative · `B` boundary · `S` security/authz · `C` contract/schema.

**Test-data strategy.** Account creation is *not* done per-test. Registration is exercised **once** by a dedicated lifecycle suite; everything else runs against pre-provisioned, long-lived accounts.

- **Pre-provisioned dedicated accounts** (created once during environment setup / seeding, verified, and reused across runs):
  - **Account A** — primary test account for all authenticated "overall" testing (notes CRUD, list/search/sort/pagination, profile, `me`, sign-in). Owns the working note dataset.
  - **Account B** — secondary verified account, used **only** for ownership-isolation checks (Account A's notes must not be visible/editable/deletable by B, and vice versa).
  - `test@test.test` — reserved for **read-only smoke checks** only; never mutated.
- **Account lifecycle is tested in isolation, once** — the sign-up / email-confirmation / duplicate-signup / unverified-login cases (§3.1, §3.2, API-SI-05, UI-AUTH-01/02/05/06) inherently need a fresh account, so **that small group** creates disposable users (unique email, e.g. `qa+<uuid>@test.local`) and reads the code from MailHog. No other tests create accounts.
- **Note data on shared accounts** is created per-test and cleaned up (DELETE) in teardown so list/search/pagination assertions stay deterministic. Where a stable dataset is needed (sort/pagination), seed it once and treat it as read-only.
- **Concurrency note:** because tests share Accounts A/B, list/count-sensitive tests must either run serially or scope their assertions to per-test markers (e.g. unique note titles) to avoid flakiness from parallel mutation.
- Confirmation codes for the lifecycle suite are read from **MailHog** (parse the confirmation link's `confirm_code`/`confirm_email` query params).

---

## 2. Observed behavior & assumptions (feeds the cases below)

These were confirmed by inspecting the code and probing the live instance. They drive several cases and should be re-verified as part of testing.

1. **`GET /api/notes` returns a plain JSON array** (no `hydra:member` / `totalItems` envelope). Total count and "next page" are **not** in the body — the UI infers "has next page" from `array length >= itemsPerPage`. → Pagination assertions must be array-length based.
2. **Validation errors depend on the `Accept` header.** With `Accept: application/json`, a bad note create returns **`422 application/problem+json`** with a `violations[]` array. With **no `Accept` header**, the server returns **`500` "Serialization for the format \"jsonld\" is not supported"** → tracked as a suspected defect (see BUG candidates).
3. **Error body shapes are inconsistent:** auth controller returns `{"error": "..."}`; sign-in (Lexik JWT) returns `{"code":401,"message":"Invalid credentials."}`; API Platform validation returns `{"status":422,"violations":[…],"detail":…}`.
4. **`POST /api/auth/confirm` returns `201 Created`** on the live app, but the API doc advertises **`200 OK`** → contract discrepancy to assert/flag.
5. **Ownership isolation:** accessing another user's note (GET/PUT/DELETE) returns **`404`**, not `403` (the query is owner-scoped).
6. **Sign-in requires a verified email** — an unverified user with correct credentials is rejected with "Email is not confirmed."
7. **Re-signup of an *unverified* email is allowed** (updates password + issues a new code); re-signup of a *verified* email → `"User already exists."`
8. **Confirmation codes:** 6 digits, expire in 10 minutes, single-use (`used_at` is stamped).
9. **JWT** expires ~1 hour after issue (`exp = iat + 3600`).
10. **"Broken mode"** exists in code (`APP_MODE=broken`): randomised 2xx status codes, varying success-response shapes, and **blanked note `content`** in list/detail. The live instance is currently **healthy**. Tests should assert the healthy contract but be written defensively; broken-mode is called out as a risk in §7.

---

## 3. API test cases

### 3.1 Sign-up — `POST /api/auth/signup`

| ID | Type | Pri | Title | Preconditions | Steps / Input | Expected result |
|---|---|---|---|---|---|---|
| API-SU-01 | + | P0 | Sign up new user | Email not registered | POST `{email, password(≥8)}` | `201`; body `{"message":"Confirmation code sent to email."}`; confirmation email arrives in MailHog |
| API-SU-02 | + | P0 | Confirmation email content | After API-SU-01 | Read MailHog message for the email | Email `From: no-reply@qa-task.local`, subject mentions confirmation code; body has a link with `confirm_email` + `confirm_code` (6 digits) |
| API-SU-03 | - | P0 | Duplicate (verified) user | Email already registered & verified | POST same email | `400`; `{"error":"User already exists."}` |
| API-SU-04 | + | P1 | Re-signup of unverified email | Email signed up but not confirmed | POST same email, new password | `201`; new code issued; old code invalidated; account still unverified |
| API-SU-05 | - | P0 | Invalid email format | — | POST `{email:"not-an-email", password}` | `400`; `{"error":"Invalid email format."}` |
| API-SU-06 | - | P1 | Missing email | — | POST `{password}` | `400`; `{"error":"Email is required."}` |
| API-SU-07 | - | P1 | Missing password | — | POST `{email}` | `400`; `{"error":"Password is required."}` |
| API-SU-08 | B | P0 | Password too short (<8) | — | POST password = 7 chars | `400`; `{"error":"Password must be at least 8 characters."}` |
| API-SU-09 | B | P2 | Password minimum (=8) | — | POST password = exactly 8 chars | `201` (accepted) |
| API-SU-10 | B | P2 | Password maximum (=255) / too long (>255) | — | POST password 255 → accepted; 256 → `400` "Password is too long." | Boundary honored |
| API-SU-11 | B | P2 | Email too long (>190) | — | POST local+domain > 190 chars | `400`; `{"error":"Email is too long."}` |
| API-SU-12 | + | P2 | Email normalization | — | POST `{email:"  MixedCase@Test.Local "}` | Stored/looked-up lower-cased & trimmed; profile later shows normalized email |
| API-SU-13 | - | P2 | Malformed JSON body | — | POST invalid JSON | `400`; `{"error":"Invalid JSON payload."}` |
| API-SU-14 | - | P2 | Empty body | — | POST `` (empty) | `400` (email required) |

### 3.2 Confirm sign-up — `POST /api/auth/confirm`

| ID | Type | Pri | Title | Preconditions | Steps / Input | Expected result |
|---|---|---|---|---|---|---|
| API-CF-01 | + | P0 | Confirm with valid code | User signed up; code from MailHog | POST `{email, code}` | Success; body contains a JWT `token` + confirmation message; account becomes verified |
| API-CF-02 | C | P1 | Status-code contract | As above | Inspect status | **Actual `201`**; doc says `200` → assert & report mismatch |
| API-CF-03 | - | P0 | Invalid code | Valid user, wrong 6-digit code | POST `{email, code:"000000"}` | `400`; `{"error":"Invalid or expired confirmation code."}` |
| API-CF-04 | - | P0 | Reused (single-use) code | Code already used in API-CF-01 | POST same code again | `400`; invalid/expired |
| API-CF-05 | - | P1 | Expired code (>10 min) | Code older than 10 minutes | POST `{email, code}` | `400`; invalid/expired |
| API-CF-06 | - | P1 | Unknown email | Email never registered | POST `{email, code}` | `400`; `{"error":"User not found."}` |
| API-CF-07 | - | P1 | Code belongs to another user | Code valid for user A, submitted for user B | POST `{email:B, code:A}` | `400`; invalid/expired |
| API-CF-08 | B | P2 | Malformed code (not 6 digits) | — | POST `code:"12ab"`, `"12345"`, `"1234567"` | `400`; `{"error":"Confirmation code must be exactly 6 digits."}` |
| API-CF-09 | - | P2 | Missing fields | — | POST without `email` or `code` | `400` |

### 3.3 Sign-in — `POST /api/auth/signin`

| ID | Type | Pri | Title | Preconditions | Steps / Input | Expected result |
|---|---|---|---|---|---|---|
| API-SI-01 | + | P0 | Sign in verified user | Verified account exists | POST `{email, password}` | `200`; body `{"token": <JWT>}` |
| API-SI-02 | C | P1 | JWT claims & expiry | After API-SI-01 | Decode token | Payload has `username`, `roles:["ROLE_USER"]`, `iat`, `exp = iat + 3600` |
| API-SI-03 | - | P0 | Wrong password | Verified account | POST wrong password | `401`; `{"code":401,"message":"Invalid credentials."}` |
| API-SI-04 | - | P0 | Non-existent user | — | POST unknown email | `401`; `Invalid credentials.` |
| API-SI-05 | - | P0 | Unverified user cannot sign in | Signed up but not confirmed | POST correct creds | `401`; message "Email is not confirmed." |
| API-SI-06 | - | P1 | Missing credentials | — | POST without email/password | `401`/`400` (no token issued) |
| API-SI-07 | S | P2 | No user enumeration | — | Compare wrong-password vs unknown-user responses | Both indistinguishable (`Invalid credentials.`) |

### 3.4 Current user — `GET /api/auth/me`

| ID | Type | Pri | Title | Preconditions | Steps / Input | Expected result |
|---|---|---|---|---|---|---|
| API-ME-01 | + | P0 | Profile with valid token | Signed in | GET with `Authorization: Bearer <token>` | `200`; `{"id":<uuid>, "email":<email>}` matching the user |
| API-ME-02 | S | P0 | No token | — | GET without header | `401` |
| API-ME-03 | S | P0 | Malformed / garbage token | — | GET with `Bearer not-a-jwt` | `401` |
| API-ME-04 | S | P1 | Expired token | Token past `exp` | GET | `401` |
| API-ME-05 | S | P2 | Tampered token signature | Valid token with altered payload | GET | `401` |

### 3.5 Notes — list `GET /api/notes`

| ID | Type | Pri | Title | Preconditions | Steps / Input | Expected result |
|---|---|---|---|---|---|---|
| API-NL-01 | + | P0 | List own notes | User with N notes | GET `/api/notes` | `200`; JSON array of that user's notes with fields `id,title,content,created_at,updated_at` |
| API-NL-02 | S | P0 | Ownership isolation | User A has notes, user B has none | GET as B | `200`; empty array (A's notes not visible) |
| API-NL-03 | + | P1 | Empty list | User with 0 notes | GET | `200`; `[]` |
| API-NL-04 | S | P0 | No auth | — | GET without token | `401` |
| API-NL-05 | + | P0 | Search `q` (free text over title+content) | Notes with known text | GET `?q=<term>` | Only notes whose title *or* content contains term |
| API-NL-06 | + | P1 | Filter `title` (partial) | — | GET `?title=<part>` | Only notes with matching title substring |
| API-NL-07 | + | P1 | Filter `content` (partial) | — | GET `?content=<part>` | Only notes with matching content substring |
| API-NL-08 | + | P1 | Sort by `updatedAt` asc/desc | ≥2 notes | GET `?sort[updatedAt]=asc` / `desc` | Order correct |
| API-NL-09 | + | P1 | Sort by `title` asc/desc | ≥2 notes | GET `?sort[title]=asc` / `desc` | Order correct |
| API-NL-10 | + | P1 | Pagination `page` + `itemsPerPage` | > pageSize notes | GET `?itemsPerPage=2&page=1` then `page=2` | Correct slice per page; no overlap |
| API-NL-11 | B | P1 | `itemsPerPage` cap = 50 | > 50 notes (or assert cap) | GET `?itemsPerPage=1000` | At most 50 items returned |
| API-NL-12 | + | P2 | Combined filter + sort + page | Mixed dataset | GET `?q=x&sort[title]=asc&itemsPerPage=5` | All params applied together |
| API-NL-13 | - | P2 | Invalid query params | — | GET `?itemsPerPage=abc`, negative page | Graceful handling (no `500`) |

### 3.6 Notes — create `POST /api/notes`

| ID | Type | Pri | Title | Preconditions | Steps / Input | Expected result |
|---|---|---|---|---|---|---|
| API-NC-01 | + | P0 | Create valid note | Signed in | POST `{title, content}` (Accept: application/json) | `201`; body returns note with new `id`, timestamps, echoed fields; owner = current user |
| API-NC-02 | S | P0 | Owner cannot be spoofed | — | POST including `owner` field for another user | Note is owned by the authenticated user regardless |
| API-NC-03 | - | P0 | Missing title | — | POST `{content}` | `422`; `violations` includes `title` "Title is required." |
| API-NC-04 | - | P0 | Missing content | — | POST `{title}` | `422`; `violations` includes `content` "Content is required." |
| API-NC-05 | - | P1 | Blank title (whitespace/empty) | — | POST `{title:"   ", content}` | `422` (title cannot be empty) |
| API-NC-06 | - | P1 | Blank content | — | POST `{title, content:""}` | `422` (content required/empty) |
| API-NC-07 | B | P1 | Title max length (255) / >255 | — | title 255 → `201`; 256 → `422` "cannot be longer than 255" | Boundary enforced |
| API-NC-08 | B | P1 | Content max length (10000) / >10000 | — | content 10000 → `201`; 10001 → `422` | Boundary enforced |
| API-NC-09 | + | P2 | Title is trimmed | — | POST `{title:"  hello  "}` | Stored title = "hello" |
| API-NC-10 | S | P0 | No auth | — | POST without token | `401` |
| API-NC-11 | C | P1 | 500 on missing Accept header (suspected bug) | — | POST invalid note with **no** `Accept` header | Currently `500` jsonld error; expected clean `4xx`. Report as defect |

### 3.7 Notes — get one `GET /api/notes/{id}`

| ID | Type | Pri | Title | Preconditions | Steps / Input | Expected result |
|---|---|---|---|---|---|---|
| API-NG-01 | + | P0 | Get own note | User owns note | GET `/api/notes/{id}` | `200`; correct note payload |
| API-NG-02 | S | P0 | Get another user's note | Note owned by user A | GET as user B | `404` |
| API-NG-03 | - | P1 | Non-existent id | — | GET random/invalid id | `404` |
| API-NG-04 | S | P0 | No auth | — | GET without token | `401` |

### 3.8 Notes — update `PUT /api/notes/{id}`

| ID | Type | Pri | Title | Preconditions | Steps / Input | Expected result |
|---|---|---|---|---|---|---|
| API-NU-01 | + | P0 | Update own note | User owns note | PUT `{title, content}` | `200`; fields updated; `updated_at` changes, `created_at` unchanged |
| API-NU-02 | S | P0 | Update another user's note | Note owned by A | PUT as B | `404` (not updated) |
| API-NU-03 | - | P1 | Update with invalid data | — | PUT `{title:"", content:""}` (Accept: json) | `422`; violations; note unchanged |
| API-NU-04 | - | P1 | Non-existent id | — | PUT invalid id | `404` |
| API-NU-05 | S | P0 | No auth | — | PUT without token | `401` |
| API-NU-06 | + | P2 | `updated_at` monotonic | Note updated twice | PUT twice | `updated_at` increases each time |

### 3.9 Notes — delete `DELETE /api/notes/{id}`

| ID | Type | Pri | Title | Preconditions | Steps / Input | Expected result |
|---|---|---|---|---|---|---|
| API-ND-01 | + | P0 | Delete own note | User owns note | DELETE `/api/notes/{id}` | `204`; subsequent GET → `404`; note gone from list |
| API-ND-02 | S | P0 | Delete another user's note | Note owned by A | DELETE as B | `404` (A's note still exists) |
| API-ND-03 | - | P1 | Non-existent id | — | DELETE invalid id | `404` |
| API-ND-04 | - | P2 | Double delete | Note already deleted | DELETE same id again | `404` |
| API-ND-05 | S | P0 | No auth | — | DELETE without token | `401` |

### 3.10 Cross-cutting / non-functional (API)

| ID | Type | Pri | Title | Expected result |
|---|---|---|---|---|
| API-X-01 | S | P1 | Security headers present | `X-Content-Type-Options: nosniff`, `X-Frame-Options`, no-cache on API responses |
| API-X-02 | C | P2 | Method not allowed | e.g. `PATCH /api/auth/me` → `405`; `Allow` header lists valid methods |
| API-X-03 | C | P2 | Unknown route | `GET /api/does-not-exist` → `404` |
| API-X-04 | C | P1 | `doc.json` is valid & lists all 6 endpoints | Schema reachable at `/api/doc.json`, parseable, paths present |
| API-X-05 | S | P2 | Notes endpoints reject cross-tenant via list filter too | Filters/search never leak other users' notes |
| API-X-06 | + | P2 | Response time smoke | Core endpoints respond within a reasonable threshold (e.g. < 2s) |

---

## 4. UI E2E test cases

Run against the deployed SPA. Token is stored in `localStorage` under `qa_task_token`. Routes: `/`, `/app`, `/account/notes`, `/account/profile`.

### 4.1 Authentication & session

| ID | Type | Pri | Title | Steps | Expected result |
|---|---|---|---|---|---|
| UI-AUTH-01 | + | P0 | Sign-up happy path | Open app → fill sign-up form (new email + valid password) → submit | Success status shown, referencing MailHog; no error |
| UI-AUTH-02 | + | P0 | End-to-end sign-up → email → confirm → land in Notes | Sign up → fetch confirmation link from MailHog → open link | App auto-confirms, stores token, lands on Notes view logged in |
| UI-AUTH-03 | + | P0 | Sign-in happy path | Enter valid verified creds → submit | Redirected to Notes view; profile loads; token in localStorage |
| UI-AUTH-04 | - | P0 | Sign-in wrong password | Enter valid email, wrong password | Inline error "Invalid credentials." shown; stays on auth screen; no token |
| UI-AUTH-05 | - | P1 | Sign-in unverified user | Sign up but don't confirm, then sign in | Error "Email is not confirmed."; not logged in |
| UI-AUTH-06 | - | P1 | Sign-up existing verified email | Sign up with `test@test.test` | Error "User already exists." |
| UI-AUTH-07 | + | P1 | Session persists on reload | Sign in → refresh page | Still authenticated (token reused, profile reloads) |
| UI-AUTH-08 | + | P0 | Logout | While logged in → click Logout | Token cleared; auth UI shown; "Logged out." status; notes cleared |
| UI-AUTH-09 | S | P0 | Protected route without token | Clear localStorage → open `/account/notes` | Redirected/falls back to auth UI (not notes) |
| UI-AUTH-10 | - | P1 | Invalid confirmation link | Open `/app?confirm_email=x&confirm_code=000000` | Error shown; params cleared from URL; auth UI displayed |

### 4.2 Notes CRUD

| ID | Type | Pri | Title | Steps | Expected result |
|---|---|---|---|---|---|
| UI-NOTE-01 | + | P0 | Create note | Notes view → fill create form (title+content) → submit | Note appears in list; form reset; "Note created." status |
| UI-NOTE-02 | - | P1 | Create note — required fields | Submit with empty title or content | Browser/inline validation blocks submit or error shown; no note created |
| UI-NOTE-03 | + | P0 | Edit note | Click "Update" on a note → change fields in modal → Save | Modal closes; list shows updated content; "Note updated." status |
| UI-NOTE-04 | + | P1 | Edit note — cancel | Open update modal → Cancel (or click backdrop) | Modal closes; note unchanged |
| UI-NOTE-05 | + | P0 | Delete note — confirm | Click "Delete" → confirm in modal | Note removed from list; "Note deleted." status |
| UI-NOTE-06 | + | P1 | Delete note — cancel | Click "Delete" → Cancel (or backdrop) | Modal closes; note still present |
| UI-NOTE-07 | + | P1 | Empty state | Delete all notes (or fresh account) | List shows "No notes found." |

### 4.3 Notes list — search, sort, pagination

| ID | Type | Pri | Title | Steps | Expected result |
|---|---|---|---|---|---|
| UI-LIST-01 | + | P0 | Search "All fields" | Seed notes → type query in search (field = All) | List filters to notes matching title *or* content; total count updates |
| UI-LIST-02 | + | P1 | Search by Title only | Field = Title → type query | Only title matches shown |
| UI-LIST-03 | + | P1 | Search by Content only | Field = Content → type query | Only content matches shown |
| UI-LIST-04 | + | P1 | Live search on input | Type incrementally | List refreshes as text changes; page resets to 1 |
| UI-LIST-05 | + | P1 | Sort options | Choose each sort (updated/title, asc/desc) | List reorders accordingly |
| UI-LIST-06 | + | P1 | Page size change | Change page size selector | List reloads with new size; page resets to 1 |
| UI-LIST-07 | + | P1 | Pagination next/prev | Seed > pageSize notes → Next then Prev | Correct page shown; Prev disabled on page 1; Next disabled when no more items; "Page X" indicator updates |
| UI-LIST-08 | + | P2 | Search with no results | Search a term matching nothing | "No notes found." + `0 notes` count |

### 4.4 Profile & navigation

| ID | Type | Pri | Title | Steps | Expected result |
|---|---|---|---|---|---|
| UI-PROF-01 | + | P0 | Profile shows account info | Sign in → open Profile | Email and user id displayed, matching `/api/auth/me` |
| UI-NAV-01 | + | P1 | Navigate Notes ↔ Profile | Click Profile nav then Notes nav | Correct view shown; active-nav highlight moves; URL updates (`/account/profile` ↔ `/account/notes`) |
| UI-NAV-02 | + | P2 | Browser back/forward | Navigate then use browser back | View re-renders for the previous route (popstate handled) |

### 4.5 UI robustness / security

| ID | Type | Pri | Title | Steps | Expected result |
|---|---|---|---|---|---|
| UI-SEC-01 | S | P1 | XSS-safe note rendering | Create note with title/content = `<img src=x onerror=alert(1)>` / `<script>` | Rendered as literal text (escaped), no script execution |
| UI-SEC-02 | - | P2 | Server error surfaced gracefully | Trigger API error (e.g. long content) | User sees a readable error status, app does not crash/blank |
| UI-SEC-03 | + | P2 | Token expiry handling | Let JWT expire (or inject expired) → act | App detects `401`, clears token, returns to auth UI |

---

## 5. Coverage summary

| Area | # cases | P0 |
|---|---|---|
| Sign-up (API) | 14 | 6 |
| Confirm (API) | 9 | 3 |
| Sign-in (API) | 7 | 4 |
| Me / profile (API) | 5 | 3 |
| Notes list (API) | 13 | 4 |
| Notes create (API) | 11 | 5 |
| Notes get/update/delete (API) | 15 | 9 |
| Cross-cutting (API) | 6 | 0 |
| UI auth & session | 10 | 5 |
| UI notes CRUD | 7 | 3 |
| UI list search/sort/page | 8 | 1 |
| UI profile/nav/robustness | 8 | 2 |
| **Total** | **~113** | **45** |

**Suggested first automation slice (smoke / P0 backbone):** API-SI-01, API-ME-01/02, API-NC-01, API-NG-02 (isolation), API-NL-01/04, API-ND-01, UI-AUTH-03, UI-NOTE-01, UI-NOTE-03, UI-NOTE-05, UI-AUTH-02 (full sign-up→email→confirm).

---

## 6. Defect / discrepancy findings (CONFIRMED during automation)

All of the below were reproduced by the automated suite against the deployed instance.

1. **[CONFIRMED — defect] 500 when the negotiated format is JSON-LD.** Any notes request whose `Accept` header lets the server negotiate `jsonld` (e.g. `Accept: */*`, which is the default for `curl` and most HTTP clients) returns **`500` "Serialization for the format \"jsonld\" is not supported"** — for both error *and* success responses. It only works with an explicit `Accept: application/json`. Encoded as **API-NC-11**, marked *expected-to-fail* so the suite stays green while flagging the open bug (Playwright will alert us if it ever starts returning a 4xx). Impact: any consumer not sending `Accept: application/json` is broken.
2. **[CONFIRMED — contract mismatch] `confirm` returns `201`, doc says `200`.** Reproduced by **API-CF-02** (asserts the actual `201` with a `contract-discrepancy` annotation).
3. **[CONFIRMED — inconsistent error envelopes]** three shapes in use: `{"error": "..."}` (auth controller), `{"code":401,"message":"..."}` (sign-in / JWT), `{"status":422,"violations":[...],"detail":...}` (API Platform validation, `application/problem+json`). Consumers must handle all three.
4. **[CONFIRMED — bonus] two distinct "bad JSON" messages.** Truly malformed JSON → `"Invalid JSON payload."`; syntactically valid but non-object JSON (e.g. `123`) → `"JSON payload must be an object."` (surfaced while fixing API-SU-13; the raw body must be sent as bytes or clients like axios silently wrap a string into a valid JSON literal).
5. **[CONFIRMED — observation] no pagination metadata in `/api/notes`.** Response is a plain JSON array; total count / next-page must be inferred client-side (the `itemsPerPage=50` cap is enforced server-side — API-NL-11).
6. **[Observation — not asserted] re-signup does not invalidate prior codes.** On re-signup of an unverified email a *new* code is issued but previously issued active codes remain valid until they expire. API-SU-04 therefore asserts only that the new code works (it does not assert old-code invalidation, because the app does not do that). Worth a product decision / possible hardening.

---

## 7. Assumptions, risks & open questions (for reviewer)

- **"Broken mode" risk.** The code supports `APP_MODE=broken`, which randomises success status codes (any 2xx), varies response shapes (`token`/`jwt`/`access_token`, etc.), and **blanks note `content`**. The live instance is currently *healthy*. **Question:** should tests target only the healthy contract, or also assert graceful behavior under broken mode? This significantly affects how strict assertions can be.
- **Shared dedicated accounts.** The suite relies on two pre-provisioned verified accounts (A + B) that persist across runs, plus `test@test.test` for smoke. **Question:** how should A/B be provisioned — a seeding script/fixture run once against the environment, or manually created and their credentials supplied to the suite via config/secrets? Only the lifecycle suite creates users (via API + MailHog), so MailHog must be reachable from that runner.
- **Shared-account cleanup & concurrency.** Because A/B are reused, tests must clean up the notes they create and either serialise or use unique markers for list/count assertions. Confirm this is acceptable vs. the previous per-test-user isolation (trade-off: simpler/faster data model, but tests are more coupled to shared state).
- **Environment.** Cases target the deployed EC2 instance. For CI stability, is a local `make up` environment (per README) preferred/available? Local run also lets us toggle `APP_MODE` deliberately.
- **Rate limiting / cleanup.** No rate limiting observed; confirm it's safe to create many users/notes. Teardown deletes notes; users are not deletable via API (they accumulate) — acceptable?
- **Confirmation-code expiry test (API-CF-05)** needs either time control or a 10-minute wait; prefer a local env where we can manipulate `expires_at`, otherwise mark as manual/skipped in CI.
- **Priorities** above are my proposal — happy to re-rank based on what you consider the most business-critical flows.

---

## 8. Automation status (IMPLEMENTED)

Both the **API** and **UI E2E** layers are implemented and passing on the existing `all-right` Playwright framework in this repo.

### 8.1 API suite

**Stack & layout:**
| Path | Purpose |
|------|---------|
| `src/services/notesApi/authApiService.ts` | Auth endpoints (signup / confirm / signin / me / doc.json) |
| `src/services/notesApi/notesApiService.ts` | Notes CRUD + list/filter/sort/pagination |
| `src/services/mailhog/mailhogService.ts` | Reads confirmation codes from MailHog (quoted-printable decode) |
| `src/services/baseHttpService.ts` | Shared axios client (extended to forward `data`/`params`, never throw on 4xx/5xx) |
| `src/config/testConfig.ts` | Env-driven config (URLs + accounts A/B/smoke) |
| `src/data/constants/index.ts` | Endpoints, error/success messages, limits |
| `src/tests/global-setup.ts` | Idempotently provisions & verifies accounts A and B before the run |
| `src/tests/api/*.spec.ts` | The 80 API test cases, one file per endpoint group |

**How to run:**
```bash
npm install
cp environments/.env.example environments/.env   # defaults already point at the deployed instance
npm run test:api                                  # or: npx playwright test src/tests/api
npm run report                                    # open the HTML report
```
No browser download is needed for the API suite (pure HTTP via Playwright + axios).

**Test-data handling (matches §1):** `global-setup` ensures the two dedicated accounts (A, B) exist and are verified (sign-up + MailHog confirmation on first run, sign-in thereafter). Account-lifecycle specs create their own disposable users. All notes created during tests are deleted in `afterAll`.

**Latest result:** `78 passed, 2 skipped` (~1.2 min). The 78 includes **API-NC-11**, deliberately marked *expected-to-fail* to encode the open JSON-LD 500 defect (§6.1) — so the run is green yet the defect stays visible.

**Skipped (need a local env with time control — see §7):**
| ID | Reason |
|---|---|
| API-CF-05 | Confirmation-code expiry requires waiting >10 min or manipulating `expires_at`. |
| API-ME-04 | Expired-JWT check requires forging/ageing a token (~1 h lifetime, signing key not available). |

**Coverage:** all API cases from §3 are implemented except the two skips above (28 auth, 39 notes CRUD/list, 6 cross-cutting).

### 8.2 UI E2E suite

**Stack & layout** (Page Object Model on the framework's element controllers):
| Path | Purpose |
|------|---------|
| `src/PO/notesApp/authPage.ts` | Landing page — sign-up / sign-in forms + status |
| `src/PO/notesApp/accountPage.ts` | Shared account chrome (nav, logout, title, status) |
| `src/PO/notesApp/notesPage.ts` | Notes view — create form, search/sort/pagination, note cards, update/delete modals |
| `src/PO/notesApp/profilePage.ts` | Profile view (email + id) |
| `src/helpers/ui.ts` | Programmatic login (`loginToNotes`, resilient to transient boot errors), API seed/cleanup helpers |
| `src/tests/ui/*.spec.ts` | The 30 UI test cases, one file per flow group |

**How to run:**
```bash
npx playwright install chromium   # one-time, browser needed for UI
npm run test:e2e                  # or: npx playwright test src/tests/ui --workers=2
```

**Approach & test-data:** a **dedicated UI account** (`accounts.ui`, provisioned by `global-setup`) keeps the UI list small and deterministic and isolates UI from the API suite. Auth-form flows drive the real sign-up/sign-in/confirm UI (with MailHog for the confirmation link); feature tests log in programmatically by seeding the SPA's `localStorage` token (faster, focused). List/search/pagination tests seed via the API with unique markers and clean up by marker, so assertions are deterministic under parallelism.

**Latest result:** `30 passed` (~1 min, 2 workers), stable across repeated runs.

**Coverage vs §4:** implemented 30 of 31 — auth & session (10), notes CRUD (7), list/search/sort/pagination (8), profile & navigation (3), robustness/XSS/token-handling (2).
- **UI-NOTE-02** is implemented as the empty-*content* validation path (title is `required` at the HTML level; empty content reaches the API → the app surfaces the validation error).
- **UI-SEC-02** (graceful handling of a server error) is **deferred** — hard to trigger deterministically against the healthy deployed instance; revisit with `APP_MODE=broken` or a fault-injecting proxy.

**Notable UI observations (from §6 context):**
- The notes list shows a per-page count (e.g. "5 notes") and `Page N` **without a total page count**, because `/api/notes` returns no pagination metadata (§6.5). Pagination tests assert on the actual per-page item counts and Prev/Next enabled state, not on a total-pages label.

### 8.3 Continuous Integration (IMPLEMENTED)

GitHub Actions workflow at `.github/workflows/ci.yml` runs both suites against the deployed instance.

- **Triggers:** push & PR to `main`, manual `workflow_dispatch`, and a nightly `schedule` (07:00 UTC) since the target is a long-running deployment.
- **Jobs (parallel):** `api-tests` (Node 20, `npm ci`, `playwright test src/tests/api` — no browser download) and `ui-tests` (Node 20, cached Chromium via `playwright install --with-deps chromium`, `playwright test src/tests/ui --workers=2`).
- **Config:** target URLs come from repository **Variables** (`API_BASE_URL` / `BASE_URL` / `MAILHOG_URL`) with the deployed instance as the default — **no secrets required**. In CI, `CI=true` enables `retries: 1` (absorbs transient blips on the shared instance) and adds the `github` reporter for inline annotations.
- **Artifacts:** the HTML report is uploaded per job (`playwright-report-api` / `-ui`); traces + screenshots (`test-results-*`) are uploaded on failure. Retention 7 days.

## 9. Next steps

- Decide on **broken-mode** coverage (§7); enable **UI-SEC-02** and the two skipped time-based API cases (API-CF-05, API-ME-04) on a local `make up` env with time/fault control.
- Add a solution **README** (setup / how-to-run / CI badge) for reviewers.
- Optional: `axe` accessibility pass and cross-browser projects (WebKit/Firefox) for the top happy-path flows.
