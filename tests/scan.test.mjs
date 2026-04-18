import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadScanConfig,
  buildLocationFilter,
  resolveScanMethod,
} from '../scan-lib/config.mjs';
import { detectApi } from '../scan-lib/api.mjs';
import {
  applyScanWrites,
  getPlaywrightConcurrency,
  loadCustomAdapter,
} from '../scan-lib/playwright.mjs';

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-ops-scan-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('loadScanConfig throws when portals.yml is missing', () => {
  withTempDir((dir) => {
    assert.throws(
      () => loadScanConfig(path.join(dir, 'portals.yml')),
      /portals\.yml/i,
    );
  });
});

test('loadScanConfig and buildLocationFilter throw when location_filter is missing or empty', () => {
  assert.throws(() => buildLocationFilter(), /location_filter/i);
  assert.throws(() => buildLocationFilter([]), /location_filter/i);

  withTempDir((dir) => {
    const missingPath = path.join(dir, 'missing-location.yml');
    fs.writeFileSync(
      missingPath,
      [
        'title_filter:',
        '  positive: []',
        'tracked_companies: []',
        '',
      ].join('\n'),
    );

    assert.throws(() => loadScanConfig(missingPath), /location_filter/i);

    const emptyPath = path.join(dir, 'empty-location.yml');
    fs.writeFileSync(
      emptyPath,
      [
        'title_filter:',
        '  positive: []',
        'location_filter: []',
        'tracked_companies: []',
        '',
      ].join('\n'),
    );

    assert.throws(() => loadScanConfig(emptyPath), /location_filter/i);
  });
});

test('loadScanConfig accepts the example portals template', () => {
  const config = loadScanConfig('templates/portals.example.yml');

  assert.equal(Array.isArray(config.location_filter), true);
  assert.ok(config.location_filter.length > 0);
});

test('buildLocationFilter accepts strict IDF labels and rejects broad fallback labels', () => {
  const isAllowed = buildLocationFilter([
    'Paris',
    'Ile-de-France',
    'Hauts-de-Seine',
    'Seine-Saint-Denis',
    'Val-de-Marne',
    'Val-d-Oise',
    'Seine-et-Marne',
    'Yvelines',
    'Essonne',
    'La Defense',
  ]);

  assert.equal(isAllowed('Paris'), true);
  assert.equal(isAllowed('Ile-de-France'), true);
  assert.equal(isAllowed('Hauts-de-Seine'), true);
  assert.equal(isAllowed('La Defense'), true);
  assert.equal(isAllowed('Remote - EMEA'), false);
  assert.equal(isAllowed('France'), false);
  assert.equal(isAllowed('Lyon'), false);
  assert.equal(isAllowed(''), true);
});

test('resolveScanMethod prefers explicit playwright_custom and ATS detection', () => {
  const custom = resolveScanMethod({
    name: 'CustomCo',
    scan_method: 'playwright_custom',
    scan_adapter: 'custom-adapter',
  });

  assert.deepEqual(custom, {
    type: 'playwright_custom',
    adapter: 'custom-adapter',
  });

  const greenhouse = resolveScanMethod({
    name: 'GreenhouseCo',
    careers_url: 'https://job-boards.greenhouse.io/greenhouseco',
  });

  assert.deepEqual(greenhouse, {
    type: 'api',
    api: {
      type: 'greenhouse',
      url: 'https://boards-api.greenhouse.io/v1/boards/greenhouseco/jobs',
    },
  });
});

test('resolveScanMethod keeps explicit websearch deferred instead of implicit', () => {
  const deferred = resolveScanMethod({
    name: 'OpenAI',
    scan_method: 'websearch',
    scan_query: 'site:openai.com/careers "Paris"',
  });

  assert.deepEqual(deferred, {
    type: 'deferred',
    method: 'websearch',
    explicit: true,
  });
});

test('resolveScanMethod falls back to implicit playwright_generic and detectApi covers the explicit ATS examples from Task 1', () => {
  const implicit = resolveScanMethod({
    name: 'UnknownCo',
    careers_url: 'https://example.com/careers',
  });

  assert.deepEqual(implicit, {
    type: 'playwright_generic',
    implicit: true,
  });

  assert.deepEqual(detectApi({
    name: 'H Company',
    careers_url: 'https://jobs.lever.co/h-company',
  }), {
    type: 'lever',
    url: 'https://api.lever.co/v0/postings/h-company',
  });

  assert.deepEqual(detectApi({
    name: 'Mistral',
    careers_url: 'https://jobs.lever.co/mistral',
  }), {
    type: 'lever',
    url: 'https://api.lever.co/v0/postings/mistral',
  });

  assert.deepEqual(detectApi({
    name: 'Dust',
    careers_url: 'https://jobs.ashbyhq.com/dust',
  }), {
    type: 'ashby',
    url: 'https://api.ashbyhq.com/posting-api/job-board/dust?includeCompensation=true',
  });

  assert.deepEqual(detectApi({
    name: 'Poolside',
    careers_url: 'https://jobs.ashbyhq.com/poolside',
  }), {
    type: 'ashby',
    url: 'https://api.ashbyhq.com/posting-api/job-board/poolside?includeCompensation=true',
  });

  assert.deepEqual(detectApi({
    name: 'Shift Technology',
    careers_url: 'https://job-boards.greenhouse.io/shifttechnology',
    api: 'https://boards-api.greenhouse.io/v1/boards/shifttechnology/jobs',
  }), {
    type: 'greenhouse',
    url: 'https://boards-api.greenhouse.io/v1/boards/shifttechnology/jobs',
  });
});

test('getPlaywrightConcurrency defaults to 2, respects 1, and caps at 3', () => {
  assert.equal(getPlaywrightConcurrency(), 2);
  assert.equal(getPlaywrightConcurrency(1), 1);
  assert.equal(getPlaywrightConcurrency(10), 3);
});

test('loadCustomAdapter rejects with adapter name when adapter is missing', async () => {
  await assert.rejects(
    () => loadCustomAdapter('missing-adapter'),
    (error) => {
      assert.match(error.message, /missing-adapter/);
      return true;
    },
  );
});

test('applyScanWrites skips writes in dry-run mode', () => {
  let pipelineCalls = 0;
  let historyCalls = 0;

  applyScanWrites({
    offers: [{ url: 'https://example.com/job', title: 'Engineer', company: 'Example', source: 'playwright_generic' }],
    dryRun: true,
    writePipeline: () => {
      pipelineCalls += 1;
    },
    writeHistory: () => {
      historyCalls += 1;
    },
  });

  assert.equal(pipelineCalls, 0);
  assert.equal(historyCalls, 0);
});

test('applyScanWrites skips writes when offers is empty', () => {
  let pipelineCalls = 0;
  let historyCalls = 0;

  applyScanWrites({
    offers: [],
    dryRun: false,
    writePipeline: () => {
      pipelineCalls += 1;
    },
    writeHistory: () => {
      historyCalls += 1;
    },
  });

  assert.equal(pipelineCalls, 0);
  assert.equal(historyCalls, 0);
});
