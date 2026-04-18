# IDF Scanner Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single `scan.mjs` workflow that truly scans the user's priority Île-de-France companies through ATS APIs, generic Playwright extraction, and custom Playwright adapters, while enforcing a strict IDF location filter.

**Architecture:** Keep `scan.mjs` as the CLI entry point, but move reusable logic into small `scan-lib/*.mjs` modules. API boards, generic Playwright pages, and custom adapters all normalize to the same job shape before filters, deduplication, and file writes. Custom Playwright adapters live in `adapters/{name}.mjs` and are loaded with dynamic `import()`.

**Tech Stack:** Node.js 18+ ESM, Playwright, js-yaml, Node built-in test runner (`node --test`), existing `npm run verify` pipeline checks.

---

## Planned File Layout

- Modify: `scan.mjs`
  CLI entry point, argument parsing, orchestration, summary logging.
- Create: `scan-lib/config.mjs`
  Config loading, `title_filter`, strict `location_filter`, explicit method resolution.
- Create: `scan-lib/api.mjs`
  `detectApi()`, ATS API fetchers, API response parsers.
- Create: `scan-lib/playwright.mjs`
  Browser lifecycle, concurrency cap, generic page extraction, custom adapter loader, dry-run-safe execution helpers.
- Create: `adapters/microsoft.mjs`
  Custom scanner for Microsoft careers pages.
- Create: `adapters/aws.mjs`
  Custom scanner for Amazon jobs pages.
- Create: `adapters/google-cloud.mjs`
  Custom scanner for Google careers pages.
- Create: `adapters/salesforce.mjs`
  Custom scanner for Salesforce careers pages.
- Create: `adapters/meta.mjs`
  Custom scanner for Meta careers pages.
- Modify: `portals.yml`
  Add strict IDF `location_filter`, explicit methods for Group B companies, add `S3NS` and `Illuin`.
- Create: `tests/scan.test.mjs`
  Unit tests for config validation, method resolution, adapter loading, dry-run behavior, and Group A ATS detection.
- Modify: `package.json`
  Add `test:scan` script.
- Modify: `test-all.mjs`
  Recurse into `scan-lib/`, `adapters/`, and `tests/` for syntax checks.
- Delete: `scan-portals.mjs`
  Remove deprecated prototype.

### Task 1: Extract Strict Scanner Config and ATS Detection

**Files:**
- Create: `scan-lib/config.mjs`
- Create: `scan-lib/api.mjs`
- Create: `tests/scan.test.mjs`
- Modify: `scan.mjs`

- [ ] **Step 1: Write the failing tests for strict IDF config and ATS detection**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLocationFilter, resolveScanMethod } from '../scan-lib/config.mjs';
import { detectApi } from '../scan-lib/api.mjs';

test('location filter rejects missing config', () => {
  assert.throws(() => buildLocationFilter(), /location_filter/);
  assert.throws(() => buildLocationFilter([]), /location_filter/);
});

test('location filter accepts IDF labels and rejects broad labels', () => {
  const acceptIdf = buildLocationFilter([
    'paris',
    'ile-de-france',
    'hauts-de-seine',
    'seine-saint-denis',
    'val-de-marne',
    'val-d\'oise',
    'seine-et-marne',
    'yvelines',
    'essonne',
    'la defense',
  ]);

  assert.equal(acceptIdf('Paris, France'), true);
  assert.equal(acceptIdf('La Défense, France'), true);
  assert.equal(acceptIdf('Hauts-de-Seine, France'), true);
  assert.equal(acceptIdf('Remote - EMEA'), false);
  assert.equal(acceptIdf('France'), false);
  assert.equal(acceptIdf('Lyon, France'), false);
});

test('resolveScanMethod prefers explicit custom adapters and falls back to ATS detection', () => {
  assert.deepEqual(
    resolveScanMethod({
      careers_url: 'https://careers.microsoft.com/',
      scan_method: 'playwright_custom',
      scan_adapter: 'microsoft',
    }),
    { type: 'playwright_custom', adapter: 'microsoft' }
  );

  assert.deepEqual(
    resolveScanMethod({ careers_url: 'https://jobs.lever.co/mistral' }),
    {
      type: 'api',
      api: {
        type: 'lever',
        url: 'https://api.lever.co/v0/postings/mistral',
      },
    }
  );
});

test('detectApi still recognizes every Group A ATS board', () => {
  assert.equal(detectApi({ careers_url: 'https://jobs.lever.co/mistral' }).type, 'lever');
  assert.equal(detectApi({ careers_url: 'https://jobs.lever.co/h-company' }).type, 'lever');
  assert.equal(detectApi({ careers_url: 'https://jobs.ashbyhq.com/dust' }).type, 'ashby');
  assert.equal(detectApi({ careers_url: 'https://jobs.ashbyhq.com/poolside' }).type, 'ashby');
  assert.equal(
    detectApi({
      careers_url: 'https://job-boards.greenhouse.io/shifttechnology',
      api: 'https://boards-api.greenhouse.io/v1/boards/shifttechnology/jobs',
    }).type,
    'greenhouse'
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test tests/scan.test.mjs
```

Expected:

```text
ERR_MODULE_NOT_FOUND for ../scan-lib/config.mjs or ../scan-lib/api.mjs
```

- [ ] **Step 3: Implement strict config and ATS helpers**

Create `scan-lib/config.mjs`:

```js
import { readFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';
import { detectApi } from './api.mjs';

const parseYaml = yaml.load;

export function loadScanConfig(path = 'portals.yml') {
  if (!existsSync(path)) {
    throw new Error('portals.yml not found. Run onboarding first.');
  }

  const config = parseYaml(readFileSync(path, 'utf-8')) || {};
  if (!Array.isArray(config.location_filter) || config.location_filter.length === 0) {
    throw new Error('portals.yml must define a non-empty location_filter for IDF scanning');
  }

  return config;
}

export function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = String(title || '').toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

export function buildLocationFilter(allowedLocations) {
  if (!Array.isArray(allowedLocations) || allowedLocations.length === 0) {
    throw new Error('portals.yml must define a non-empty location_filter for IDF scanning');
  }

  const allowed = allowedLocations.map(k => k.toLowerCase());
  return (location) => {
    if (!location || String(location).trim() === '') return true;
    const lower = String(location).toLowerCase();
    return allowed.some(k => lower.includes(k));
  };
}

export function resolveScanMethod(company) {
  if (company.scan_method === 'playwright_custom') {
    return { type: 'playwright_custom', adapter: company.scan_adapter };
  }

  if (company.scan_method === 'playwright_generic') {
    return { type: 'playwright_generic' };
  }

  const api = detectApi(company);
  if (api) return { type: 'api', api };

  return { type: 'playwright_generic' };
}
```

Create `scan-lib/api.mjs`:

```js
export function detectApi(company) {
  if (company.api && company.api.includes('greenhouse')) {
    return { type: 'greenhouse', url: company.api };
  }

  const url = company.careers_url || '';

  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    };
  }

  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    };
  }

  const ghEuMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (ghEuMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghEuMatch[1]}/jobs`,
    };
  }

  return null;
}
```

Modify the top of `scan.mjs` to consume the new helpers:

```js
import { loadScanConfig, buildTitleFilter, buildLocationFilter, resolveScanMethod } from './scan-lib/config.mjs';
import { detectApi } from './scan-lib/api.mjs';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
node --test tests/scan.test.mjs
```

Expected:

```text
# tests 4
# pass 4
# fail 0
```

- [ ] **Step 5: Commit**

```bash
git add scan.mjs scan-lib/config.mjs scan-lib/api.mjs tests/scan.test.mjs
git commit -m "refactor: extract strict scan config and api detection"
```

### Task 2: Add Playwright Runtime, Generic Extraction, and Dry-Run Semantics

**Files:**
- Create: `scan-lib/playwright.mjs`
- Modify: `tests/scan.test.mjs`
- Modify: `scan.mjs`

- [ ] **Step 1: Write the failing tests for concurrency, adapter loading, and dry-run**

Append to `tests/scan.test.mjs`:

```js
import { getPlaywrightConcurrency, loadCustomAdapter, applyScanWrites } from '../scan-lib/playwright.mjs';

test('playwright concurrency is capped at 3 and defaults to 2', () => {
  assert.equal(getPlaywrightConcurrency(), 2);
  assert.equal(getPlaywrightConcurrency(1), 1);
  assert.equal(getPlaywrightConcurrency(3), 3);
  assert.equal(getPlaywrightConcurrency(10), 3);
});

test('loadCustomAdapter rejects missing adapters', async () => {
  await assert.rejects(() => loadCustomAdapter('missing-adapter'), /missing-adapter/);
});

test('applyScanWrites skips file writes in dry-run mode', async () => {
  let pipelineWrites = 0;
  let historyWrites = 0;

  await applyScanWrites({
    offers: [{ title: 'A', url: 'https://example.com', company: 'Example', location: 'Paris', source: 'test' }],
    dryRun: true,
    writePipeline: async () => { pipelineWrites++; },
    writeHistory: async () => { historyWrites++; },
  });

  assert.equal(pipelineWrites, 0);
  assert.equal(historyWrites, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test tests/scan.test.mjs --test-name-pattern "playwright|dry-run|adapter"
```

Expected:

```text
ERR_MODULE_NOT_FOUND for ../scan-lib/playwright.mjs
```

- [ ] **Step 3: Implement the Playwright runtime**

Create `scan-lib/playwright.mjs`:

```js
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLAYWRIGHT_CONCURRENCY = 2;
const MAX_PLAYWRIGHT_CONCURRENCY = 3;

export function getPlaywrightConcurrency(value = DEFAULT_PLAYWRIGHT_CONCURRENCY) {
  return Math.min(Math.max(Number(value) || DEFAULT_PLAYWRIGHT_CONCURRENCY, 1), MAX_PLAYWRIGHT_CONCURRENCY);
}

export async function loadCustomAdapter(adapterName) {
  if (!adapterName) {
    throw new Error('playwright_custom target is missing scan_adapter');
  }

  const moduleUrl = pathToFileURL(join(ROOT, '..', 'adapters', `${adapterName}.mjs`)).href;
  const mod = await import(moduleUrl);
  if (typeof mod.scan !== 'function') {
    throw new Error(`Adapter ${adapterName} must export an async scan(page, company) function`);
  }
  return mod.scan;
}

export async function scanWithPlaywrightGeneric(page, company) {
  await page.goto(company.careers_url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  return page.locator('a').evaluateAll((links, companyName) => {
    return links
      .map((link) => {
        const href = link.getAttribute('href');
        const title = (link.textContent || '').trim();
        const location = (link.closest('article, li, div')?.textContent || '').trim();
        if (!href || !title) return null;
        return {
          title,
          url: new URL(href, document.location.href).href,
          company: companyName,
          location,
        };
      })
      .filter(Boolean);
  }, company.name);
}

export async function runPlaywrightTarget(browser, company) {
  const page = await browser.newPage();
  try {
    if (company.scan_method === 'playwright_custom') {
      const scan = await loadCustomAdapter(company.scan_adapter);
      return await scan(page, company);
    }
    return await scanWithPlaywrightGeneric(page, company);
  } finally {
    await page.close();
  }
}

export async function applyScanWrites({ offers, dryRun, writePipeline, writeHistory }) {
  if (dryRun || offers.length === 0) return;
  await writePipeline(offers);
  await writeHistory(offers);
}

export async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}
```

Modify `scan.mjs` to use a dedicated Playwright concurrency constant:

```js
const API_CONCURRENCY = 10;
const PLAYWRIGHT_CONCURRENCY = 2;
```

Modify the orchestration in `scan.mjs` so `--dry-run` still executes scanners but routes writes through `applyScanWrites(...)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
node --test tests/scan.test.mjs --test-name-pattern "playwright|dry-run|adapter"
```

Expected:

```text
# tests 3
# pass 3
# fail 0
```

- [ ] **Step 5: Commit**

```bash
git add scan.mjs scan-lib/playwright.mjs tests/scan.test.mjs
git commit -m "feat: add playwright scan runtime and dry-run semantics"
```

### Task 3: Add V1 Custom Adapters and Update `portals.yml`

**Files:**
- Create: `adapters/microsoft.mjs`
- Create: `adapters/aws.mjs`
- Create: `adapters/google-cloud.mjs`
- Create: `adapters/salesforce.mjs`
- Create: `adapters/meta.mjs`
- Modify: `portals.yml`
- Modify: `tests/scan.test.mjs`

- [ ] **Step 1: Write the failing tests for adapter loading and required V1 companies**

Append to `tests/scan.test.mjs`:

```js
import fs from 'fs';
import yaml from 'js-yaml';

test('custom adapters load for big tech priority companies', async () => {
  const microsoftScan = await loadCustomAdapter('microsoft');
  const awsScan = await loadCustomAdapter('aws');
  const googleScan = await loadCustomAdapter('google-cloud');
  const salesforceScan = await loadCustomAdapter('salesforce');
  const metaScan = await loadCustomAdapter('meta');

  assert.equal(typeof microsoftScan, 'function');
  assert.equal(typeof awsScan, 'function');
  assert.equal(typeof googleScan, 'function');
  assert.equal(typeof salesforceScan, 'function');
  assert.equal(typeof metaScan, 'function');
});

test('portals.yml defines a strict IDF location filter and V1 companies', () => {
  const config = yaml.load(fs.readFileSync('portals.yml', 'utf8'));
  assert.ok(Array.isArray(config.location_filter));
  assert.ok(config.location_filter.includes('paris'));
  assert.ok(config.location_filter.includes('hauts-de-seine'));

  const names = new Set(config.tracked_companies.map(c => c.name));
  for (const companyName of [
    'OpenAI (Paris)',
    'Microsoft (Paris)',
    'AWS (Amazon Paris)',
    'Google Cloud (Paris)',
    'Salesforce (Paris)',
    'Meta (Paris)',
    'Scaleway',
    'S3NS',
    'Illuin',
  ]) {
    assert.ok(names.has(companyName), `${companyName} missing from portals.yml`);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
node --test tests/scan.test.mjs --test-name-pattern "custom adapters|portals.yml"
```

Expected:

```text
Cannot find module adapters/microsoft.mjs
or assertion failures for missing location_filter / missing S3NS / missing Illuin
```

- [ ] **Step 3: Implement the V1 adapters**

Create `adapters/microsoft.mjs`:

```js
export async function scan(page, company) {
  await page.goto(company.careers_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});

  return page.locator('a').evaluateAll((links, companyName) => {
    return links
      .filter(link => (link.href || '').includes('/job/'))
      .map(link => ({
        title: (link.textContent || '').trim(),
        url: link.href,
        company: companyName,
        location: (link.closest('div, li, article')?.textContent || '').trim(),
      }))
      .filter(job => job.title);
  }, company.name);
}
```

Create `adapters/aws.mjs`:

```js
export async function scan(page, company) {
  await page.goto(company.careers_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});

  return page.locator('a[href*="/jobs/"]').evaluateAll((links, companyName) => {
    return links.map(link => ({
      title: (link.textContent || '').trim(),
      url: link.href,
      company: companyName,
      location: (link.closest('div, li, article')?.textContent || '').trim(),
    })).filter(job => job.title);
  }, company.name);
}
```

Create `adapters/google-cloud.mjs`:

```js
export async function scan(page, company) {
  await page.goto(company.careers_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});

  return page.locator('a[href*="/jobs/results/"]').evaluateAll((links, companyName) => {
    return links.map(link => ({
      title: (link.textContent || '').trim(),
      url: link.href,
      company: companyName,
      location: (link.closest('li, div, article')?.textContent || '').trim(),
    })).filter(job => job.title);
  }, company.name);
}
```

Create `adapters/salesforce.mjs`:

```js
export async function scan(page, company) {
  await page.goto(company.careers_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});

  return page.locator('a[href*="job"]').evaluateAll((links, companyName) => {
    return links.map(link => ({
      title: (link.textContent || '').trim(),
      url: link.href,
      company: companyName,
      location: (link.closest('div, article, li')?.textContent || '').trim(),
    })).filter(job => job.title);
  }, company.name);
}
```

Create `adapters/meta.mjs`:

```js
export async function scan(page, company) {
  await page.goto(company.careers_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});

  return page.locator('a[href*="/jobs/"]').evaluateAll((links, companyName) => {
    return links.map(link => ({
      title: (link.textContent || '').trim(),
      url: link.href,
      company: companyName,
      location: (link.closest('div, article, li')?.textContent || '').trim(),
    })).filter(job => job.title);
  }, company.name);
}
```

Modify `portals.yml` to add the strict filter and the explicit methods:

```yml
location_filter:
  - "paris"
  - "ile-de-france"
  - "île-de-france"
  - "idf"
  - "grand paris"
  - "greater paris"
  - "paris area"
  - "la défense"
  - "la defense"
  - "paris intramuros"
  - "seine-et-marne"
  - "yvelines"
  - "essonne"
  - "hauts-de-seine"
  - "seine-saint-denis"
  - "val-de-marne"
  - "val-d'oise"

tracked_companies:
  - name: OpenAI (Paris)
    careers_url: https://openai.com/careers/search
    scan_method: playwright_generic
    enabled: true

  - name: Microsoft (Paris)
    careers_url: https://careers.microsoft.com/v2/global/en/locations/paris.html
    scan_method: playwright_custom
    scan_adapter: microsoft
    enabled: true

  - name: AWS (Amazon Paris)
    careers_url: https://www.amazon.jobs/fr/location/clichy-france
    scan_method: playwright_custom
    scan_adapter: aws
    enabled: true

  - name: Google Cloud (Paris)
    careers_url: https://www.google.com/about/careers/applications/jobs/results
    scan_method: playwright_custom
    scan_adapter: google-cloud
    enabled: true

  - name: Salesforce (Paris)
    careers_url: https://careers.salesforce.com/fr/
    scan_method: playwright_custom
    scan_adapter: salesforce
    enabled: true

  - name: Meta (Paris)
    careers_url: https://www.metacareers.com/jobs
    scan_method: playwright_custom
    scan_adapter: meta
    enabled: true

  - name: Scaleway
    careers_url: https://www.scaleway.com/en/careers/
    scan_method: playwright_generic
    enabled: true

  - name: S3NS
    careers_url: https://www.s3ns.io/nous-rejoindre
    scan_method: playwright_generic
    enabled: true

  - name: Illuin
    careers_url: https://www.welcometothejungle.com/fr/companies/illuin-tech/jobs
    scan_method: playwright_generic
    enabled: true
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
node --test tests/scan.test.mjs --test-name-pattern "custom adapters|portals.yml"
```

Expected:

```text
# tests 2
# pass 2
# fail 0
```

- [ ] **Step 5: Smoke test one generic and one custom target**

Run:

```bash
node scan.mjs --dry-run --company "OpenAI"
node scan.mjs --dry-run --company "Microsoft"
```

Expected:

```text
Command exits 0 for both companies.
No writes to pipeline.md or scan-history.tsv.
Summary output appears even if extracted jobs count is 0.
```

- [ ] **Step 6: Commit**

```bash
git add adapters/microsoft.mjs adapters/aws.mjs adapters/google-cloud.mjs adapters/salesforce.mjs adapters/meta.mjs portals.yml tests/scan.test.mjs
git commit -m "feat: add v1 IDF priority company scanners"
```

### Task 4: Remove the Prototype and Harden Verification

**Files:**
- Delete: `scan-portals.mjs`
- Modify: `package.json`
- Modify: `test-all.mjs`
- Modify: `scan.mjs`

- [ ] **Step 1: Write the failing test command for scan-specific checks**

Update `package.json` to add a dedicated script:

```json
{
  "scripts": {
    "test:scan": "node --test tests/scan.test.mjs"
  }
}
```

Update `test-all.mjs` to recurse into the new scanner directories:

```js
function collectMjsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return collectMjsFiles(full);
    return entry.name.endsWith('.mjs') ? [full] : [];
  });
}

const syntaxRoots = ['.', 'scan-lib', 'adapters', 'tests']
  .filter(path => existsSync(join(ROOT, path)));

const mjsFiles = syntaxRoots.flatMap(path => collectMjsFiles(join(ROOT, path)));
```

- [ ] **Step 2: Run the verification commands to observe current failures**

Run:

```bash
npm run test:scan
node test-all.mjs --quick
```

Expected:

```text
Either missing npm script, missing recursive syntax coverage, or lingering references to scan-portals.mjs
```

- [ ] **Step 3: Delete the deprecated prototype and finish verification wiring**

Delete `scan-portals.mjs`:

```bash
git rm scan-portals.mjs
```

Keep `saturday-scan.ps1` as-is so the scheduled script still runs the single official command:

```powershell
node scan.mjs
```

Ensure `scan.mjs` summary logs report both API and Playwright targets scanned, for example:

```js
console.log(`Companies scanned:     ${apiTargets.length + playwrightTargets.length}`);
console.log(`API targets:           ${apiTargets.length}`);
console.log(`Playwright targets:    ${playwrightTargets.length}`);
```

- [ ] **Step 4: Run the full verification**

Run:

```bash
npm run test:scan
node --check scan.mjs
npm run verify
node test-all.mjs --quick
```

Expected:

```text
test:scan passes
scan.mjs syntax check passes
verify-pipeline passes
test-all.mjs --quick exits 0
```

- [ ] **Step 5: Commit**

```bash
git add package.json test-all.mjs scan.mjs
git commit -m "test: harden scanner verification and remove prototype"
```

## Self-Review

- Spec coverage:
  - Adapter contract: covered in Task 2 and Task 3.
  - Strict `location_filter`: covered in Task 1 and Task 3.
  - `scan-portals.mjs` deletion: covered in Task 4.
  - Playwright concurrency and `--dry-run`: covered in Task 2.
  - Group A ATS detectability: covered in Task 1.
- Placeholder scan:
  - No placeholder markers or deferred implementation notes remain.
- Type consistency:
  - `scan(page, company)` contract is used consistently across spec, adapters, and loader.
  - `playwright_custom`, `playwright_generic`, and `api` are used consistently as method names.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-idf-scanner-unification.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
