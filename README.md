# QA Automation — Notes App (PS AQA Tech Task)

Automated **API** and **UI E2E** test suites for the notes application (Symfony + API Platform backend, vanilla-JS SPA, MySQL, MailHog).

- **API suite** — full contract coverage of the 6 endpoints (auth + notes CRUD), including validation, boundaries, auth/authorization, ownership isolation, search/sort/pagination.
- **UI E2E suite** — the important end-to-end user flows through the browser (sign-up → email confirmation → sign-in, notes CRUD, search/sort/pagination, profile, session handling, XSS safety).

The full, reviewable list of scenarios lives in **[TEST_CASES.md](documentation/TEST_CASES.md)** (also documents the automation status and the defects found).

[![Tests](https://github.com/VladimirCW/readdle/actions/workflows/ci.yml/badge.svg)](https://github.com/VladimirCW/readdle/actions/workflows/ci.yml)

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
- **[Allure](https://allurereport.org)** reporting (`allure-playwright`) — one merged API + UI report, published to GitHub Pages with history & trends.
- **log4js** logging, **dotenv** config, **ESLint** for static analysis.

## Prerequisites

- **Node.js 20+** (developed/tested on 20 and 22)
- npm
- **Java 8+** — *optional*, only to render an Allure report **locally** (`npm run allure:serve`). The Allure 2 CLI is a Java tool; the CI-published report needs nothing installed.

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

### Allure report

Every run also writes raw Allure results to `allure-results/` (in addition to the Playwright HTML report). To render them locally — needs [Java](#prerequisites):

```bash
npm run allure:clean    # wipe allure-results/ + allure-report/ FIRST — see the note below
npm test                # (or test:api / test:e2e) — writes allure-results/
npm run allure:serve    # generate + open in one step (temporary report)

npm run allure:report   # or: generate into allure-report/ and open that
```

> **Note:** the reporter **appends** to `allure-results/` and never cleans it, which is deliberate — it is what lets `npm run test:api` and `npm run test:e2e` (two separate Playwright processes, exactly like the two CI jobs) merge into **one** report. The flip side is that results from *earlier* runs also linger, so run `npm run allure:clean` before a run you intend to report on.

In CI you never need any of this — the report is generated and published for you, see [Results in CI](#results-in-ci).

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
  -v "$(pwd)/allure-results:/app/allure-results" \
  readdle-tests
# ...then open the HTML report on the host as usual:  npm run report
# (or render the Allure results on the host:          npm run allure:serve)
```

> **Note:** `test:ui` launches Playwright's interactive UI mode, which is not usable in a headless container as-is. To use it, expose the UI server and open it in your browser:
> `docker run --rm -p 8080:8080 readdle-tests test:ui -- --ui-host=0.0.0.0 --ui-port=8080`

`environments/.env` is intentionally **not** copied into the image (a `COPY`'d env file would bake credentials into image layers and freeze configuration at build time). Configure the container at run time instead: individual `-e` variables, `--env-file`, or a read-only mount, as shown above (see [Configuration](#configuration) for the variable list). Note that Docker's `--env-file` parses values literally (no quote stripping, unlike dotenv) — the `.env.example` format is compatible.

### Targeting an app running on your laptop (localhost)

Inside a container, `localhost` / `127.0.0.1` refers to the **container itself**, not your machine — so `TEST_HOST=http://localhost` would make the tests look for the app inside the container and fail with connection-refused errors. To reach an app running on the host, use Docker's special hostname for it:

```bash
docker run --rm -e TEST_HOST=http://host.docker.internal readdle-tests
```

`TEST_HOST` stays scheme + host with no port — the app URL (`:4444`) and MailHog URL (`:8025`) are derived from it, and both route back to the host's localhost.

Keep the two audiences separate: in `environments/.env` (local runs) use `http://localhost` or `http://127.0.0.1`; for Docker runs pass `host.docker.internal` via `-e` as above. Don't put `host.docker.internal` into `.env` — it doesn't resolve outside containers, and the file isn't copied into the image anyway.

> **Notes:**
> - `host.docker.internal` works out of the box on Docker Desktop (Windows/macOS). On plain Linux, add `--add-host=host.docker.internal:host-gateway` to `docker run`, or use `--network host` so plain `localhost` works.
> - The app and MailHog must accept connections from the Docker network (listening on `0.0.0.0`, not bound strictly to `127.0.0.1`) — check this first if the connection is refused.

## Results (latest local run)

| Suite | Result |
|-------|--------|
| API (`test:api`) | **78 passed, 2 skipped** (~1.2 min) |
| UI E2E (`test:e2e`) | **30 passed** (~1 min) |

- The 2 API skips (`API-CF-05` code expiry, `API-ME-04` expired JWT) require time control not available against the deployed instance — see [TEST_CASES.md §8.1](documentation/TEST_CASES.md).
- One case (`API-NC-11`) is intentionally marked *expected-to-fail* to encode a real open defect (see [Findings](#findings)); the suite stays green while keeping the bug visible.
- After each run, an HTML report is written to `playwright-report/` (`npm run report` to open) and raw Allure results to `allure-results/` ([`npm run allure:serve`](#allure-report) to render); traces/screenshots for failures land in `test-results/`.

### Results in CI

Everything a run produces lands on **that run's own page** in the [**Tests**](https://github.com/VladimirCW/readdle/actions/workflows/ci.yml) workflow — one dispatch, one run, one place to look:

- Its **Summary** page carries the passed / failed / flaky / skipped counts per suite plus the list of failed tests (written by the `summary` job), and the links to the Allure report below it (written by the `allure` job).
- The Playwright HTML reports are attached to the same run as the `playwright-report-api` / `playwright-report-ui` artifacts, alongside `allure-results-*` and, for failures, `test-results-*` (traces + screenshots).

#### Allure report on GitHub Pages

The **Tests** workflow also publishes a browsable **Allure report** to GitHub Pages, from the same run — no separate workflow and no test re-run. Its `allure` job downloads the Allure results of **both** test jobs, merges them into one results set, and generates a single report covering the whole run, so API and UI share one set of trend charts:

- **One report per target environment**, under a subfolder — a `DEMO` run lands at `https://<owner>.github.io/readdle/DEMO/` — so a run against one environment can never overwrite another's report *or* its trend history.
- **The root** `https://<owner>.github.io/readdle/` is a landing page linking every environment's latest report, generated by [`allure-landing.mjs`](.github/scripts/allure-landing.mjs).
- **History & trends persist**: the previous report tree is pulled from the `gh-pages` branch before generating, and the last **30** runs per environment are kept.
- Both links are written to the run's **Summary** page too, so the report is one click from the run that produced it.
- Re-publishing without re-running the suite: open the run and use **Re-run jobs** on the `allure` job alone (works while that run's artifacts are inside their 7-day retention window).

**One-time repo setup** — the header comment in [`ci.yml`](.github/workflows/ci.yml) has the full detail:

1. **Settings → Actions → General → Workflow permissions** → *Read and write permissions* (lets the job push `gh-pages`).
2. Run the workflow once, so the `gh-pages` branch gets created.
3. **Settings → Pages → Source** — either option works, the workflow detects which one is live:
   - *GitHub Actions* (recommended) — the `deploy-pages` job serves the site, so one dispatch stays one run in the Actions list. Also add this workflow's branch under **Settings → Environments → github-pages**; that environment ships allowing only `gh-pages`, which is not the branch the workflow runs on, and a missed step blocks the job with a protection-rule error.
   - *Deploy from a branch* → `gh-pages` / `(root)` — GitHub builds the push itself in its own extra run, and `deploy-pages` skips.

> **Exposure:** a Pages site is **public on the internet** unless the org is on GitHub Enterprise Cloud with private Pages enabled — check with `gh api repos/<owner>/readdle/pages --jq .public`; a private site is served from a random `*.pages.github.io` host that requires a signed-in account with read access. The report carries environment URLs, test data and failure screenshots, so re-check this whenever Pages is reconfigured.

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
.github/
  workflows/      # ci.yml — the only workflow: tests + summary + Allure/Pages publish
  scripts/        # pw-summary.mjs (run summary), allure-landing.mjs (Pages root page),
                  # set-dotenv-secret.ps1 (upload DOTENV_B64_* secret)
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
- Triggers: **manual only** (`workflow_dispatch` — Actions tab or `gh workflow run Tests`); automatic runs on push/PR/schedule are intentionally disabled.
- Configuration: each job materializes `environments/.env` before the run — from the per-environment secret `DOTENV_B64_<APP_ENV>` when it exists (the whole `.env` file, base64-encoded, e.g. `base64 -w0 environments/.env`; `<APP_ENV>` is chosen by the `app_env` dispatch input, default `DEMO`), otherwise from repository **Variables** / the deployed-instance defaults — no secrets needed for the public demo instance.
- The optional `test_host` dispatch input retargets a single run at another instance (scheme + host, no port — `:4444`/`:8025` URLs are derived from it). It is exported as real env vars, so it takes precedence over everything: the `DOTENV_B64` secret, repository Variables, and the defaults.
- `CI=true` enables one retry (absorbs transient blips on the shared instance), a GitHub reporter for inline annotations, and a JSON report (`playwright-report/report.json`).
- Artifacts: HTML report and Allure results per job, plus traces/screenshots on failure.
- Three reporting jobs close the run, all reading the artifacts the test jobs uploaded — no test re-run:
  - **summary** parses the JSON reports via [`pw-summary.mjs`](.github/scripts/pw-summary.mjs) and writes per-suite pass/fail/flaky/skipped counts plus the failed-test list to the run's Summary page.
  - **allure** merges both jobs' Allure results into one report and pushes it to `gh-pages`; **deploy-pages** serves it. See [Allure report on GitHub Pages](#allure-report-on-github-pages) for the layout and the one-time setup.
  - All of them run even when a suite failed (that is when reports matter most); only a *cancelled* run publishes nothing.
- **One workflow, one run.** The summary and the Allure publish used to be separate workflows chained on `workflow_run`, which meant one dispatch produced several runs and the counts landed on a different page than the tests that produced them. Folding them in also fixed a real gap: `workflow_run` only fires for workflow files on the repo's **default** branch, so the old summary silently never ran for a dispatch from a feature branch.

### `DOTENV_B64_<APP_ENV>` — per-environment config secret

Each job builds `environments/.env` before the run from a per-environment repo secret, and `dotenv` loads that file in `playwright.config.ts` — so when the secret exists it fully drives the run's configuration (URLs, accounts, log level; see [Configuration](#configuration)). Use it for run-time config that must not live in the repo.

- **Name:** `DOTENV_B64_<APP_ENV>` — the suffix is exactly the `app_env` you pick at dispatch, e.g. the default `DEMO` → `DOTENV_B64_DEMO`, `STAGE` → `DOTENV_B64_STAGE`. GitHub secret names allow only letters, digits and underscores, so keep `app_env` values to that alphabet.
- **Value:** the whole `.env` contents, **base64-encoded** (a single opaque line — avoids newline/quoting issues and stays cleanly masked in logs).
- **Optional per env:** if the secret for the selected environment isn't set, the run falls back to repository **Variables** / the deployed-instance defaults — so you can adopt secrets one environment at a time.

Create / update the secret (needs the [GitHub CLI](https://cli.github.com/) with repo admin, `gh auth login`). Put the local dotenv file at `environments/.<APP_ENV>.env` (gitignored, so it never gets committed), then run the helper script — it reads that file (falling back to `environments/.env`), base64-encodes it, and sets `DOTENV_B64_<APP_ENV>` in one shot (contents never logged, only a byte count):

```powershell
# PowerShell. Arg = the app_env; runnable from any directory.
.\.github\scripts\set-dotenv-secret.ps1 DEMO
.\.github\scripts\set-dotenv-secret.ps1 -AppEnv STAGE -Path C:\tmp\stage.env   # override source file
```

<details>
<summary>Manual equivalents (if you'd rather not use the script)</summary>

```powershell
# PowerShell
$appEnv = 'DEMO'
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("environments\.$appEnv.env"))
$b64 | gh secret set "DOTENV_B64_$appEnv"
```

```bash
# bash / Linux / macOS
appEnv=DEMO
base64 -w0 "environments/.$appEnv.env" | gh secret set "DOTENV_B64_$appEnv"
```

Or via the GitHub UI: **Settings → Secrets and variables → Actions → New repository secret** — name it `DOTENV_B64_<APP_ENV>` and paste the base64 string as the value.

</details>

**Onboarding a new environment:** create `DOTENV_B64_<newEnv>` as above, then dispatch **Tests** with `app_env: <newEnv>` — the dynamic secret lookup in [`ci.yml`](.github/workflows/ci.yml) keys off exactly that value.

## Findings

The suites confirmed several issues against the deployed instance (full detail in [TEST_CASES.md §6](documentation/TEST_CASES.md)):

1. **500 on JSON-LD negotiation** — notes endpoints return `500 "Serialization for the format 'jsonld' is not supported"` unless the client sends `Accept: application/json` (encoded as the expected-fail `API-NC-11`).
2. **Contract mismatch** — `POST /api/auth/confirm` returns `201` though the API doc advertises `200`.
3. **Inconsistent error envelopes** across endpoints (`{error}` vs `{code,message}` vs `{violations}`).
4. `GET /api/notes` returns a plain array with **no pagination metadata**, so the UI shows a per-page count and `Page N` without a total-page count.

## Notes & assumptions

- Tests target the **deployed instance** and assume it is healthy (`APP_MODE=healthy`). The app also has a `broken` mode (randomised status codes/shapes, blanked note content) — covering it is an open decision (see [TEST_CASES.md §7](documentation/TEST_CASES.md)).
- Running against a local `make up` environment would additionally enable the time-based cases currently skipped.
