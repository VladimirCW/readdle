#!/usr/bin/env node
/**
 * Root landing page for the Allure Pages site.
 *
 * Reports are published ONE SUBFOLDER PER TARGET ENVIRONMENT (/<APP_ENV>/), so that
 * a run against DEMO cannot overwrite the report — or the trend history — of a run
 * against another environment. That leaves the bare Pages root with nothing to serve,
 * which is what this script fixes: it (re)writes <site>/index.html as a small page
 * linking every environment's latest report.
 *
 * It is invoked by the "Allure report" job in .github/workflows/ci.yml AFTER the
 * Allure action has generated the site tree, and before the tree is published. Two
 * things happen, in order:
 *
 *   1. <site>/<ENV_NAME>/run.json is written with this run's metadata. The Allure
 *      action copies the WHOLE previous gh-pages tree into <site> before it
 *      regenerates one env's folder, so every other env's run.json survives and the
 *      landing page can describe environments this run never touched.
 *   2. <site>/index.html is rebuilt from every env folder found on disk.
 *
 * Inputs (all env vars; every one is optional except a usable SITE_DIR):
 *   SITE_DIR        site tree to annotate            (default: allure-history)
 *   ENV_NAME        env published by this run        (skip step 1 when empty)
 *   RUN_NUMBER      GitHub run number
 *   RUN_URL         link back to the Actions run
 *   RUN_CONCLUSION  success | failure | ...          (shown as a dot on the card)
 *   REPO            owner/name, for the footer link
 *
 * No dependencies — plain Node, same as pw-summary.mjs.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE_DIR = process.env.SITE_DIR || 'allure-history';
const ENV_NAME = (process.env.ENV_NAME || '').trim();
const REPO = process.env.REPO || '';

if (!existsSync(SITE_DIR)) {
    console.error(`No ${SITE_DIR}/ — nothing to annotate.`);
    process.exit(0);
}

// ---- 1. Record this run against the env it published -----------------------------
if (ENV_NAME && isDir(join(SITE_DIR, ENV_NAME))) {
    const meta = {
        env: ENV_NAME,
        runNumber: process.env.RUN_NUMBER || '',
        runUrl: process.env.RUN_URL || '',
        conclusion: process.env.RUN_CONCLUSION || '',
        publishedAt: new Date().toISOString(),
    };
    writeFileSync(join(SITE_DIR, ENV_NAME, 'run.json'), `${JSON.stringify(meta, null, 2)}\n`);
    console.log(`Wrote ${SITE_DIR}/${ENV_NAME}/run.json (run #${meta.runNumber || '?'}).`);
} else if (ENV_NAME) {
    console.log(`No ${SITE_DIR}/${ENV_NAME}/ — skipping run.json.`);
}

// ---- 2. Rebuild the landing page from what is on disk -----------------------------
// An env folder is a direct subdirectory holding the redirect index.html the Allure
// action writes. Anything else at the root (.git, .nojekyll, a stray file) is skipped,
// so the page never links somewhere that 404s.
const envs = readdirSync(SITE_DIR)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => isDir(join(SITE_DIR, name)))
    .filter((name) => existsSync(join(SITE_DIR, name, 'index.html')))
    .map((name) => ({ name, ...readRun(join(SITE_DIR, name, 'run.json')) }))
    // Most recently published first; envs with no run.json sink to the bottom.
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));

writeFileSync(join(SITE_DIR, 'index.html'), renderLanding(envs));
console.log(
    `Wrote ${SITE_DIR}/index.html — ${envs.length} environment(s): ${
        envs.map((e) => e.name).join(', ') || 'none'
    }`
);

function isDir(p) {
    try {
        return statSync(p).isDirectory();
    } catch {
        return false;
    }
}

function readRun(p) {
    try {
        return JSON.parse(readFileSync(p, 'utf8'));
    } catch {
        return {};
    }
}

function esc(v) {
    return String(v ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
}

/** ISO timestamp -> "2026-09-01 14:03"; empty string when unparsable. */
function fmtDate(iso) {
    const d = new Date(iso || '');
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().replace('T', ' ').slice(0, 16);
}

function renderLanding(envs) {
    const cards = envs.length
        ? envs
              .map((e) => {
                  const dot =
                      e.conclusion === 'success'
                          ? '<span class="dot ok" title="last run passed"></span>'
                          : e.conclusion
                            ? `<span class="dot bad" title="last run: ${esc(e.conclusion)}"></span>`
                            : '';
                  const bits = [
                      e.runNumber ? `run #${esc(e.runNumber)}` : '',
                      fmtDate(e.publishedAt) ? `${esc(fmtDate(e.publishedAt))} UTC` : '',
                  ].filter(Boolean);
                  const meta = bits.length ? bits.join(' · ') : 'no publish metadata recorded';
                  const actions = e.runUrl
                      ? `<a class="run" href="${esc(e.runUrl)}">Actions run ↗</a>`
                      : '';
                  return `<div class="row">
      <a class="env" href="./${encodeURIComponent(e.name)}/">
        <span class="env-name">${dot}${esc(e.name)}</span>
        <span class="env-meta">${meta}</span>
      </a>${actions}
    </div>`;
              })
              .join('\n    ')
        : '<p class="empty">No reports published yet.</p>';

    const footer = REPO
        ? `Published from <a href="https://github.com/${esc(REPO)}/actions">${esc(
              REPO
          )}</a> by the “Tests” workflow.`
        : 'Published by the “Tests” workflow.';

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Allure reports · Notes app tests</title>
<style>
  :root { --bg:#ffffff; --fg:#1f2328; --muted:#57606a; --card:#f6f8fa; --border:#d0d7de; --accent:#0969da; --ok:#1a7f37; --bad:#cf222e; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0d1117; --fg:#e6edf3; --muted:#8b949e; --card:#161b22; --border:#30363d; --accent:#4493f8; --ok:#3fb950; --bad:#f85149; }
  }
  * { box-sizing:border-box; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--fg);
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; }
  .wrap { max-width:720px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--muted); margin:0 0 20px; font-size:13px; }
  .rows { display:flex; flex-direction:column; gap:10px; }
  .row { display:flex; align-items:stretch; gap:10px; }
  a.env { flex:1; display:flex; flex-direction:column; gap:2px; text-decoration:none; color:inherit;
    background:var(--card); border:1px solid var(--border); border-radius:8px; padding:12px 16px; }
  a.env:hover { border-color:var(--accent); }
  .env-name { font-size:17px; font-weight:600; }
  .env-meta { color:var(--muted); font-size:12px; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; vertical-align:middle; }
  .dot.ok { background:var(--ok); } .dot.bad { background:var(--bad); }
  a.run { display:flex; align-items:center; padding:0 14px; white-space:nowrap; font-size:12px;
    color:var(--accent); text-decoration:none; border:1px solid var(--border); border-radius:8px; }
  a.run:hover { border-color:var(--accent); }
  .empty { color:var(--muted); }
  footer { color:var(--muted); font-size:12px; margin-top:28px; }
  footer a { color:var(--accent); }
</style>
</head>
<body>
<div class="wrap">
  <h1>📋 Allure reports</h1>
  <p class="sub">One report per target environment — API and UI E2E results of a run, merged. Open an environment for its latest report, with history &amp; trends.</p>
  <div class="rows">
    ${cards}
  </div>
  <footer>${footer} Access-controlled — sign in to GitHub with read access to this repository.</footer>
</div>
</body>
</html>
`;
}
