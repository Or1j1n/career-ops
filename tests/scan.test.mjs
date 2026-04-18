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

test('resolveScanMethod falls back to implicit playwright_generic and detectApi covers Group A ATS boards', () => {
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
