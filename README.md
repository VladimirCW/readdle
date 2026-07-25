# QA Automation — Notes App (PS AQA Tech Task)

Automated **API** and **UI E2E** test suites for the notes application (Symfony + API Platform backend, vanilla-JS SPA, MySQL, MailHog).

- **API suite** — full contract coverage of the 6 endpoints (auth + notes CRUD), including validation, boundaries, auth/authorization, ownership isolation, search/sort/pagination.
- **UI E2E suite** — the important end-to-end user flows through the browser (sign-up → email confirmation → sign-in, notes CRUD, search/sort/pagination, profile, session handling, XSS safety).

The full, reviewable list of scenarios lives in **[TEST_CASES.md](documentation/TEST_CASES.md)** (also documents the automation status and the defects found).

<!-- Once pushed to GitHub, replace <owner>/<repo> to enable the badge:
![Tests](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)
-->

## Application under test

| What | URL |
|------|-----|
| App UI | http://ec2-18-220-190-172.us-east-2.compute.amazonaws.com:4444/ |
| API docs (Swagger UI / JSON) | `…:4444/api/doc` · `…:4444/api/doc.json` |
| MailHog (captured emails) | http://ec2-18-220-190-172.us-east-2.compute.amazonaws.com:8025/ |

Read-only smoke account: `test@test.test` / `12345678`. All other accounts are provisioned automatically (see [Test data](#test-data--accounts)).

## Tech stack

- **[Playwright Test](https://playwright.dev)** (TypeScript) — one runner for both API and UI.
- **axios** service layer for the API suite; Playwright's browser driver for UI.
- **Page Object Model** for the UI, built on the framework's element controllers (`src/controlers`, `src/helpers/element.ts`).
- **MailHog HTTP API** integration to read sign-up confirmation codes.
- **log4js** logging, **dotenv** config, **ESLint** for static analysis.

## Prerequisites

- **Node.js 20+** (developed/tested on 20 and 22)
- npm

## Setup

```bash
npm install

# Browsers are only needed for the UI suite:
npx playwright install chromium

# Optional: create a local env file. Defaults already point at the deployed
# instance, so this is only needed to override URLs/accounts.
cp environments/.env.example environments/.env
```

## Configuration

Configuration is environment-driven (loaded from `environments/.env` if present, otherwise the defaults in `src/config/testConfig.ts`, which point at the deployed instance). No secrets are required to run against the public demo instance.

| Variable | Purpose | Default |
|----------|---------|---------|
| `TEST_HOST` | Scheme + host of the instance under test (no port); API/app `:4444` and MailHog `:8025` URLs are derived from it | deployed EC2 instance |
| `API_BASE_URL` / `BASE_URL` / `MAILHOG_URL` | Optional per-URL overrides; take precedence over `TEST_HOST` | derived from `TEST_HOST` |
| `ACCOUNT_A_*` / `ACCOUNT_B_*` / `ACCOUNT_UI_*` | Dedicated test accounts (auto-provisioned) | `aqa-account-*@example.com` |
| `SMOKE_EMAIL` / `SMOKE_PASSWORD` | Read-only smoke account (auto-provisioned) | `test@test.test` |
| `LOG_LEVEL` | `all\|trace\|debug\|info\|warn\|error` | `info` |
| `WORKERS_AMOUNT` | Number of parallel Playwright workers | Playwright default (half the CPU cores) |

## Running the tests

```bash
npm test            # API suite, then UI suite (recommended full run)
npm run test:api    # API suite only  (pure HTTP — no browser needed)
npm run test:e2e    # UI E2E suite only (Chromium; workers from WORKERS_AMOUNT)
npm run report      # open the last HTML report
npm run test:headed # UI suite in a headed browser (debugging)
npm run lint        # ESLint
```

A **global setup** (`src/tests/global-setup.ts`) runs once before any test to health-check the API and idempotently provision the dedicated accounts.

## Running in Docker

The image is based on the official Playwright image (browsers preinstalled), with `ENTRYPOINT ["npm", "run"]` and `CMD ["test"]` — so the container runs `npm run test` by default, and any argument after the image name replaces the script name:

```bash
npm run docker:build                             # docker build -t readdle-tests .
npm run docker:test                              # docker run --rm readdle-tests  → npm run test

docker run --rm readdle-tests test:api           # API suite only
docker run --rm readdle-tests test:e2e           # UI E2E suite only
docker run --rm readdle-tests lint               # any other package.json script works too

# Forward extra Playwright flags through npm's `--` separator:
docker run --rm readdle-tests test:api -- --grep "SMOKE_1"

# Override env defaults with -e:
docker run --rm -e LOG_LEVEL=debug readdle-tests

# Or feed a local env file at run time instead of individual -e flags:
docker run --rm --env-file environments/.env readdle-tests

# ...or mount it read-only, so dotenv reads it exactly as in a local run:
docker run --rm -v "$(pwd)/environments/.env:/app/environments/.env:ro" readdle-tests

# Reports and traces are written inside the container and lost when it exits.
# Mount the output folders to keep them on the host:
docker run --rm \
  -v "$(pwd)/playwright-report:/app/playwright-report" \
  -v "$(pwd)/test-results:/app/test-results" \
  readdle-tests
# ...then open the HTML report on the host as usual:  npm run report
```

> **Note:** `test:ui` launches Playwright's interactive UI mode, which is not usable in a headless container as-is. To use it, expose the UI server and open it in your browser:
> `docker run --rm -p 8080:8080 readdle-tests test:ui -- --ui-host=0.0.0.0 --ui-port=8080`

`environments/.env` is intentionally **not** copied into the image (a `COPY`'d env file would bake credentials into image layers and freeze configuration at build time). Configure the container at run time instead: individual `-e` variables, `--env-file`, or a read-only mount, as shown above (see [Configuration](#configuration) for the variable list). Note that Docker's `--env-file` parses values literally (no quote stripping, unlike dotenv) — the `.env.example` format is compatible.

## Results (latest local run)

| Suite | Result |
|-------|--------|
| API (`test:api`) | **78 passed, 2 skipped** (~1.2 min) |
| UI E2E (`test:e2e`) | **30 passed** (~1 min) |

- The 2 API skips (`API-CF-05` code expiry, `API-ME-04` expired JWT) require time control not available against the deployed instance — see [TEST_CASES.md §8.1](documentation/TEST_CASES.md).
- One case (`API-NC-11`) is intentionally marked *expected-to-fail* to encode a real open defect (see [Findings](#findings)); the suite stays green while keeping the bug visible.
- After each run, an HTML report is written to `playwright-report/` (`npm run report` to open); traces/screenshots for failures land in `test-results/`.

## Project structure

```
src/
  config/         # logger + env-driven test config (URLs, accounts)
  data/constants/ # endpoints, messages, limits, UI routes
  controlers/     # element primitives (Input, Button, Label, Link)
  helpers/        # element waiters/assertions, api + ui helpers
  services/
    notesApi/     # AuthApiService, NotesApiService (axios)
    mailhog/      # MailhogService (reads confirmation codes)
  PO/notesApp/    # Page Objects: Auth, Account, Notes, Profile
  tests/
    global-setup.ts
    api/          # *.spec.ts — one file per endpoint group
    ui/           # *.spec.ts — one file per user flow
environments/     # .env / .env.example
.github/workflows/ci.yml
documentation/
  TEST_CASES.md   # the reviewable test-case catalogue + status
```

## Test data & accounts

Account creation is **not** done per test:

- **Account A / B** — dedicated, long-lived accounts for authenticated API testing (B is used for ownership-isolation checks). Provisioned once by global setup.
- **Account UI** — dedicated account for the UI suite, keeping its notes list small and deterministic and isolating UI from API runs.
- **Smoke account** (`test@test.test`) — read-only checks, never mutated.
- Account **lifecycle** specs (sign-up / confirmation / duplicate / unverified) create their own **disposable** users and read codes from MailHog.

Notes created during tests are cleaned up (by id or by unique marker) in teardown, so the suites are re-runnable and leave no residue.

## Continuous Integration

GitHub Actions — [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

- Two parallel jobs: **api-tests** (no browser) and **ui-tests** (cached Chromium, 2 workers).
- Triggers: push & PR to `main`, manual `workflow_dispatch`, and a nightly schedule.
- Target URLs come from repository **Variables** (fall back to the deployed instance) — no secrets needed.
- `CI=true` enables one retry (absorbs transient blips on the shared instance) and a GitHub reporter for inline annotations.
- Artifacts: HTML report per job, plus traces/screenshots on failure.

## Findings

The suites confirmed several issues against the deployed instance (full detail in [TEST_CASES.md §6](documentation/TEST_CASES.md)):

1. **500 on JSON-LD negotiation** — notes endpoints return `500 "Serialization for the format 'jsonld' is not supported"` unless the client sends `Accept: application/json` (encoded as the expected-fail `API-NC-11`).
2. **Contract mismatch** — `POST /api/auth/confirm` returns `201` though the API doc advertises `200`.
3. **Inconsistent error envelopes** across endpoints (`{error}` vs `{code,message}` vs `{violations}`).
4. `GET /api/notes` returns a plain array with **no pagination metadata**, so the UI shows a per-page count and `Page N` without a total-page count.

## Notes & assumptions

- Tests target the **deployed instance** and assume it is healthy (`APP_MODE=healthy`). The app also has a `broken` mode (randomised status codes/shapes, blanked note content) — covering it is an open decision (see [TEST_CASES.md §7](documentation/TEST_CASES.md)).
- Running against a local `make up` environment would additionally enable the time-based cases currently skipped.
