// Parses one or more Playwright JSON reports and writes a Markdown summary
// (per-suite pass/fail counts + the list of failed tests) to $GITHUB_STEP_SUMMARY.
//
// Usage: node pw-summary.mjs "<Label>=<path-to-report.json>" [...]
// Consumed by .github/workflows/test-summary.yml (the "Test summary" workflow).

import { readFileSync, appendFileSync } from 'node:fs';

const summaryFile = process.env.GITHUB_STEP_SUMMARY;

// Context passed in by the workflow so the summary can link back to the run that produced it.
const runUrl = process.env.RUN_URL || '';
const runConclusion = process.env.RUN_CONCLUSION || '';
const runActor = process.env.RUN_ACTOR || '';
const runBranch = process.env.RUN_BRANCH || '';

/** Append a line to the GitHub step summary (and echo to the log). */
function out(line = '') {
    if (summaryFile) {
        appendFileSync(summaryFile, line + '\n');
    }
    console.log(line);
}

// Arguments are "Label=path" pairs (one per uploaded report artifact).
const inputs = process.argv.slice(2).map((arg) => {
    const eq = arg.indexOf('=');
    return eq === -1
        ? { label: arg, path: arg }
        : { label: arg.slice(0, eq), path: arg.slice(eq + 1) };
});
if (!inputs.length) {
    inputs.push({ label: 'Tests', path: 'playwright-report/report.json' });
}

/** Walk the suite tree and collect failed / flaky specs with their file:line. */
function walk(suites, titlePath, file, failedTests, flakyTests) {
    for (const suite of suites || []) {
        const suiteFile = suite.file || file;
        // Top-level file suites have title === file path; don't repeat that in the title path.
        const nextPath = suite.title && suite.title !== suiteFile ? [...titlePath, suite.title] : titlePath;

        for (const spec of suite.specs || []) {
            const statuses = (spec.tests || []).map((t) => t.status);
            const entry = {
                title: [...nextPath, spec.title].join(' › '),
                location: `${suiteFile || spec.file || '?'}:${spec.line ?? '?'}`
            };
            if (statuses.includes('unexpected')) {
                failedTests.push(entry);
            } else if (statuses.includes('flaky')) {
                flakyTests.push(entry);
            }
        }
        walk(suite.suites, nextPath, suiteFile, failedTests, flakyTests);
    }
}

const results = inputs.map(({ label, path }) => {
    let report;
    try {
        report = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
        return { label, path, missing: true, error: err.message };
    }
    const stats = report.stats || {};
    const passed = stats.expected ?? 0;
    const failed = stats.unexpected ?? 0;
    const flaky = stats.flaky ?? 0;
    const skipped = stats.skipped ?? 0;
    const failedTests = [];
    const flakyTests = [];
    walk(report.suites, [], undefined, failedTests, flakyTests);
    return {
        label,
        path,
        passed,
        failed,
        flaky,
        skipped,
        total: passed + failed + flaky + skipped,
        durationMs: stats.duration ?? 0,
        failedTests,
        flakyTests
    };
});

const found = results.filter((r) => !r.missing);
const totals = found.reduce(
    (acc, r) => ({
        passed: acc.passed + r.passed,
        failed: acc.failed + r.failed,
        flaky: acc.flaky + r.flaky,
        skipped: acc.skipped + r.skipped,
        total: acc.total + r.total
    }),
    { passed: 0, failed: 0, flaky: 0, skipped: 0, total: 0 }
);

function durationText(ms) {
    const secs = Math.round(ms / 1000);
    return secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
}

const anyMissing = results.some((r) => r.missing);
const overall =
    totals.failed > 0
        ? '❌ Failed'
        : anyMissing
          ? '⚠️ Report missing'
          : totals.total === 0
            ? '⚠️ No tests'
            : '✅ Passed';

out(`## ${overall} — test summary`);
out('');
const meta = [];
if (runActor) meta.push(`**Triggered by:** @${runActor}`);
if (runBranch) meta.push(`**Branch:** \`${runBranch}\``);
if (runConclusion) meta.push(`**Run status:** ${runConclusion}`);
if (runUrl) meta.push(`[View test run](${runUrl})`);
out(meta.join('  ·  '));
out('');
out('| Suite | ✅ Passed | ❌ Failed | ⚠️ Flaky | ⏭️ Skipped | Σ Total | Duration |');
out('|:--|:--:|:--:|:--:|:--:|:--:|:--:|');
for (const r of results) {
    if (r.missing) {
        out(`| ${r.label} | — | — | — | — | — | — |`);
    } else {
        out(
            `| ${r.label} | ${r.passed} | ${r.failed} | ${r.flaky} | ${r.skipped} | ${r.total} | ${durationText(r.durationMs)} |`
        );
    }
}
if (found.length > 1) {
    out(`| **Total** | **${totals.passed}** | **${totals.failed}** | **${totals.flaky}** | **${totals.skipped}** | **${totals.total}** | |`);
}
out('');

for (const r of results.filter((x) => x.missing)) {
    out(
        `> ⚠️ **${r.label}**: could not read the JSON report at \`${r.path}\` (${r.error}). ` +
            'The job likely crashed before producing a report — check the triggering run for details.'
    );
    out('');
}

for (const r of found) {
    if (r.failedTests.length) {
        out(`### ❌ ${r.label} — failed tests (${r.failedTests.length})`);
        out('');
        for (const t of r.failedTests) {
            out(`- \`${t.location}\` — ${t.title}`);
        }
        out('');
    }
    if (r.flakyTests.length) {
        out(`### ⚠️ ${r.label} — flaky tests (${r.flakyTests.length}) — passed on retry`);
        out('');
        for (const t of r.flakyTests) {
            out(`- \`${t.location}\` — ${t.title}`);
        }
        out('');
    }
}

if (!anyMissing && totals.failed === 0 && totals.flaky === 0 && totals.total > 0) {
    out('All tests passed. 🎉');
}
