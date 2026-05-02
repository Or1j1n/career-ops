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
  runPlaywrightTarget,
  scanWithPlaywrightGeneric,
} from '../scan-lib/playwright.mjs';
import { scan as scanMicrosoft } from '../adapters/microsoft.mjs';
import { scan as scanGoogleCloud } from '../adapters/google-cloud.mjs';
import { scan as scanMeta } from '../adapters/meta.mjs';

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-ops-scan-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function withWindow(href, fn) {
  const originalWindow = globalThis.window;
  globalThis.window = { location: { href } };

  try {
    return await fn();
  } finally {
    globalThis.window = originalWindow;
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
    'Ile de France',
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
  assert.equal(isAllowed('Ile de France'), true);
  assert.equal(isAllowed('Hauts-de-Seine'), true);
  assert.equal(isAllowed('La Defense'), true);
  assert.equal(isAllowed('Remote - EMEA'), false);
  assert.equal(isAllowed('France'), false);
  assert.equal(isAllowed('Lyon'), false);
  assert.equal(isAllowed('Paris, Texas, United States'), false);
  assert.equal(isAllowed('Paris, TX'), false);
  assert.equal(isAllowed(''), false);
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

test('resolveScanMethod scans OpenAI through Ashby and keeps Salesforce deferred', () => {
  const config = loadScanConfig('portals.yml');
  const byName = new Map((config.tracked_companies || []).map((company) => [company.name, company]));

  assert.deepEqual(resolveScanMethod(byName.get('OpenAI (Paris)')), {
    type: 'api',
    api: {
      type: 'ashby',
      url: 'https://api.ashbyhq.com/posting-api/job-board/openai?includeCompensation=true',
    },
  });

  assert.deepEqual(resolveScanMethod(byName.get('Salesforce (Paris)')), {
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

test('loadCustomAdapter rejects clearly when scan_adapter is missing', async () => {
  await assert.rejects(
    () => loadCustomAdapter(),
    /missing scan_adapter/i,
  );
});

test('loadCustomAdapter rejects unsafe adapter names before dynamic import', async () => {
  for (const adapterName of ['../microsoft', '..\\microsoft', 'microsoft.js', 'bad adapter']) {
    await assert.rejects(
      () => loadCustomAdapter(adapterName),
      /invalid scan_adapter/i,
    );
  }
});

test('custom adapters load for big tech priority companies', async () => {
  const adapters = await Promise.all([
    loadCustomAdapter('microsoft'),
    loadCustomAdapter('aws'),
    loadCustomAdapter('google-cloud'),
    loadCustomAdapter('salesforce'),
    loadCustomAdapter('meta'),
  ]);

  for (const adapter of adapters) {
    assert.equal(typeof adapter, 'function');
  }
});

test('custom adapters do not hardcode Paris as a location', () => {
  for (const adapterPath of [
    'adapters/aws.mjs',
    'adapters/microsoft.mjs',
    'adapters/salesforce.mjs',
  ]) {
    const source = fs.readFileSync(adapterPath, 'utf8');
    assert.equal(
      /location:\s*['"]Paris['"]/.test(source),
      false,
      `${adapterPath} must extract real locations instead of hardcoding Paris`,
    );
  }
});

test('microsoft adapter uses the nearest Microsoft card root and ignores sibling card titles', async () => {
  const sharedWrapper = {
    parentElement: null,
    querySelector(selector) {
      if (selector === 'h3.careers-joblistResponsive-subheading') {
        return { textContent: 'Card A Title' };
      }
      return null;
    },
  };
  const siblingCardA = {
    className: 'careers-joblistResponsive-columncontainer card-a',
    parentElement: sharedWrapper,
    querySelector(selector) {
      if (selector === 'h3.careers-joblistResponsive-subheading') {
        return { textContent: 'Card A Title' };
      }
      return null;
    },
  };
  const siblingCardB = {
    className: 'careers-joblistResponsive-columnList card-b',
    parentElement: sharedWrapper,
    querySelector(selector) {
      if (selector === 'h3.careers-joblistResponsive-subheading') {
        return { textContent: 'Card B Title' };
      }
      if (selector === '[class*="location" i]') {
        return { textContent: 'Paris, France' };
      }
      return null;
    },
  };
  const wrapperOne = {
    parentElement: siblingCardB,
    querySelector(selector) {
      if (selector === 'h3.careers-joblistResponsive-subheading') {
        return { textContent: 'Card A Title' };
      }
      return null;
    },
  };
  const anchor = {
    textContent: 'See details',
    getAttribute(name) {
      if (name === 'href') return '/job/123';
      return null;
    },
    closest() {
      return wrapperOne;
    },
    parentElement: wrapperOne,
  };

  await withWindow('https://careers.microsoft.com/v2/global/en/locations/paris.html', async () => {
    const page = {
      async goto(url, options) {
        assert.deepEqual({ url, options }, {
          url: 'https://careers.microsoft.com/v2/global/en/locations/paris.html',
          options: {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          },
        });
      },
      async waitForLoadState() {},
      locator(selector) {
        assert.equal(selector, 'a');
        return {
          async evaluateAll(callback) {
            return callback([anchor]);
          },
        };
      },
    };

    const offers = await scanMicrosoft(page, {
      name: 'Microsoft (Paris)',
      careers_url: 'https://careers.microsoft.com/v2/global/en/locations/paris.html',
    });

    assert.deepEqual(offers, [{
      title: 'Card B Title',
      url: 'https://careers.microsoft.com/job/123',
      company: 'Microsoft (Paris)',
      location: 'Paris, France',
    }]);
  });
});

test('google cloud adapter uses the nearest Google card root and ignores sibling card data', async () => {
  const sharedWrapper = {
    parentElement: null,
    querySelector(selector) {
      if (selector === 'h3.QJPWVe') {
        return { textContent: 'Card A Google Title' };
      }
      return null;
    },
  };
  const siblingCardA = {
    className: 'lLd3Je card-a',
    parentElement: sharedWrapper,
    querySelector(selector) {
      if (selector === 'h3.QJPWVe') {
        return { textContent: 'Card A Google Title' };
      }
      if (selector === 'div.EAcu5e.Gx4ovb') {
        return { textContent: 'Google | San Francisco, CA, USA' };
      }
      if (selector === 'span.pwO9Dc:not(.vo5qdf)') {
        return { textContent: 'San Francisco, CA, USA' };
      }
      if (selector === 'span.r0wTof') {
        return { textContent: 'San Francisco, CA, USA' };
      }
      return null;
    },
  };
  const siblingCardB = {
    className: 'sMn82b card-b',
    parentElement: sharedWrapper,
    querySelector(selector) {
      if (selector === 'h3.QJPWVe') {
        return { textContent: 'Software Engineering Manager, Geo, Duplex Agentic Platform' };
      }
      if (selector === 'div.EAcu5e.Gx4ovb') {
        return { textContent: 'Google | Mountain View, CA, USA' };
      }
      if (selector === 'span.pwO9Dc:not(.vo5qdf)') {
        return { textContent: 'place Mountain View, CA, USA' };
      }
      if (selector === 'span.r0wTof') {
        return { textContent: 'Mountain View, CA, USA' };
      }
      return null;
    },
  };
  const shallowWrapper = {
    parentElement: siblingCardB,
    querySelector(selector) {
      if (selector === 'h3.QJPWVe') {
        return { textContent: 'Card A Google Title' };
      }
      return null;
    },
  };
  const anchor = {
    textContent: 'Learn more',
    getAttribute(name) {
      if (name === 'href') return 'jobs/results/123';
      if (name === 'aria-label') return 'Learn more about Software Engineering Manager, Geo, Duplex Agentic Platform';
      return null;
    },
    closest() {
      return shallowWrapper;
    },
    parentElement: shallowWrapper,
  };

  await withWindow('https://careers.google.com/jobs/results', async () => {
    const page = {
      async goto(url, options) {
        assert.deepEqual({ url, options }, {
          url: 'https://careers.google.com/jobs/results',
          options: {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          },
        });
      },
      async waitForLoadState() {},
      locator(selector) {
        assert.equal(selector, 'a[href*="jobs/results/"]');
        return {
          async evaluateAll(callback) {
            return callback([anchor]);
          },
        };
      },
    };

    const offers = await scanGoogleCloud(page, {
      name: 'Google Cloud (Paris)',
      careers_url: 'https://careers.google.com/jobs/results',
    });

    assert.deepEqual(offers, [{
      title: 'Software Engineering Manager, Geo, Duplex Agentic Platform',
      url: 'https://careers.google.com/jobs/results/123',
      company: 'Google Cloud (Paris)',
      location: 'Mountain View, CA, USA',
    }]);
  });
});

test('google cloud adapter rejects composite location labels with semicolons and more markers', async () => {
  const card = {
    querySelector(selector) {
      if (selector === 'h3.QJPWVe') {
        return { textContent: 'Site Reliability Engineer' };
      }
      if (selector === 'div.EAcu5e.Gx4ovb') {
        return { textContent: 'Canberra ACT, Australia; Sydney NSW, Australia; +2 more; +1 more' };
      }
      return null;
    },
  };
  const anchor = {
    textContent: 'Learn more',
    getAttribute(name) {
      if (name === 'href') return 'jobs/results/321';
      if (name === 'aria-label') return 'Learn more about Site Reliability Engineer';
      return null;
    },
    closest() {
      return card;
    },
    parentElement: card,
  };

  await withWindow('https://careers.google.com/jobs/results', async () => {
    const page = {
      async goto() {},
      async waitForLoadState() {},
      locator(selector) {
        assert.equal(selector, 'a[href*="jobs/results/"]');
        return {
          async evaluateAll(callback) {
            return callback([anchor]);
          },
        };
      },
    };

    const offers = await scanGoogleCloud(page, {
      name: 'Google Cloud (Paris)',
      careers_url: 'https://careers.google.com/jobs/results',
    });

    assert.deepEqual(offers, [{
      title: 'Site Reliability Engineer',
      url: 'https://careers.google.com/jobs/results/321',
      company: 'Google Cloud (Paris)',
      location: '',
    }]);
  });
});

test('google cloud adapter uses aria-label when no h3 is present', async () => {
  const card = {
    querySelector() {
      return null;
    },
  };
  const anchor = {
    textContent: 'Learn more',
    getAttribute(name) {
      if (name === 'href') return 'jobs/results/789';
      if (name === 'aria-label') return 'Learn more about Technical Account Manager';
      return null;
    },
    closest() {
      return card;
    },
    parentElement: card,
  };

  await withWindow('https://careers.google.com/jobs/results', async () => {
    const page = {
      async goto() {},
      async waitForLoadState() {},
      locator(selector) {
        assert.equal(selector, 'a[href*="jobs/results/"]');
        return {
          async evaluateAll(callback) {
            return callback([anchor]);
          },
        };
      },
    };

    const offers = await scanGoogleCloud(page, {
      name: 'Google Cloud (Paris)',
      careers_url: 'https://careers.google.com/jobs/results',
    });

    assert.deepEqual(offers, [{
      title: 'Technical Account Manager',
      url: 'https://careers.google.com/jobs/results/789',
      company: 'Google Cloud (Paris)',
      location: '',
    }]);
  });
});

test('meta adapter extracts location from the nearest job container without losing the anchor title', async () => {
  const listItem = {
    querySelector(selector) {
      if (selector === 'h3') {
        return { textContent: 'Shared Container Title' };
      }
      if (selector === 'span[data-testid="job-location"]') {
        return { textContent: 'Paris, France' };
      }
      return null;
    },
  };
  const anchor = {
    querySelector(selector) {
      if (selector === 'h3') {
        return { textContent: 'Deployment Strategist' };
      }
      if (selector === 'span[data-testid="job-location"]') {
        return { textContent: 'Sunnyvale, CA +14 locations' };
      }
      return null;
    },
    textContent: 'Apply now',
    getAttribute(name) {
      if (name === 'href') return '/profile/job_details/123';
      if (name === 'aria-label') return 'Shared Wrapper Title';
      return null;
    },
    closest(selector) {
      if (selector === 'div[role="listitem"], li, article') return listItem;
      return null;
    },
    parentElement: listItem,
  };

  await withWindow('https://www.metacareers.com/jobs', async () => {
    const page = {
      async goto(url, options) {
        assert.deepEqual({ url, options }, {
          url: 'https://www.metacareers.com/jobs',
          options: {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          },
        });
      },
      async waitForLoadState() {},
      locator(selector) {
        assert.equal(selector, 'a[href*="/profile/job_details/"]');
        return {
          async evaluateAll(callback) {
            return callback([anchor]);
          },
        };
      },
    };

    const offers = await scanMeta(page, {
      name: 'Meta (Paris)',
      careers_url: 'https://www.metacareers.com/jobs',
    });

    assert.deepEqual(offers, [{
      title: 'Deployment Strategist',
      url: 'https://www.metacareers.com/profile/job_details/123',
      company: 'Meta (Paris)',
      location: 'Paris, France',
    }]);
  });
});

test('portals.yml defines a strict IDF location filter and V1 companies', () => {
  const config = loadScanConfig('portals.yml');

  assert.equal(Array.isArray(config.location_filter), true);
  assert.equal(config.location_filter.includes('paris'), true);
  assert.equal(config.location_filter.includes('hauts-de-seine'), true);

  const companyNames = new Set(
    (config.tracked_companies || []).map((company) => company.name),
  );

  for (const name of [
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
    assert.equal(companyNames.has(name), true, `Missing tracked company: ${name}`);
  }
});

test('applyScanWrites skips writes in dry-run mode', async () => {
  let pipelineCalls = 0;
  let historyCalls = 0;

  await applyScanWrites({
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

test('applyScanWrites skips writes when offers is empty', async () => {
  let pipelineCalls = 0;
  let historyCalls = 0;

  await applyScanWrites({
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

test('applyScanWrites awaits async writers in order', async () => {
  const trace = [];

  await applyScanWrites({
    offers: [{ url: 'https://example.com/job', title: 'Engineer', company: 'Example', source: 'playwright_generic' }],
    dryRun: false,
    writePipeline: async () => {
      trace.push('pipeline:start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      trace.push('pipeline:end');
    },
    writeHistory: async () => {
      trace.push('history:start');
      await new Promise((resolve) => setTimeout(resolve, 0));
      trace.push('history:end');
    },
  });

  assert.deepEqual(trace, [
    'pipeline:start',
    'pipeline:end',
    'history:start',
    'history:end',
  ]);
});

test('scanWithPlaywrightGeneric falls back to empty location when no precise selector matches', async () => {
  const originalWindow = globalThis.window;
  const fakeContainer = {
    querySelector() {
      return null;
    },
  };
  const fakeAnchor = {
    textContent: 'Platform Engineer',
    getAttribute(name) {
      if (name === 'href') return '/jobs/1';
      if (name === 'aria-label') return null;
      if (name === 'title') return null;
      return null;
    },
    closest() {
      return fakeContainer;
    },
    parentElement: fakeContainer,
  };

  globalThis.window = {
    location: {
      href: 'https://example.com/careers',
    },
  };

  const page = {
    gotoCalls: [],
    async goto(url, options) {
      this.gotoCalls.push({ url, options });
    },
    locator(selector) {
      assert.equal(selector, 'a');
      return {
        async evaluateAll(callback) {
          return callback([fakeAnchor]);
        },
      };
    },
  };

  try {
    const offers = await scanWithPlaywrightGeneric(page, {
      name: 'Example',
      careers_url: 'https://example.com/careers',
    });

    assert.deepEqual(page.gotoCalls, [{
      url: 'https://example.com/careers',
      options: {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      },
    }]);
    assert.deepEqual(offers, [{
      title: 'Platform Engineer',
      url: 'https://example.com/jobs/1',
      company: 'Example',
      location: '',
    }]);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('runPlaywrightTarget generic path returns offers and closes the page', async () => {
  const trace = [];
  const page = {
    async goto() {
      trace.push('goto');
    },
    locator(selector) {
      assert.equal(selector, 'a');
      return {
        async evaluateAll() {
          trace.push('evaluateAll');
          return [
            {
              title: 'Staff Engineer',
              url: 'https://example.com/jobs/2',
              company: '',
              location: '',
            },
          ];
        },
      };
    },
    async close() {
      trace.push('close');
    },
  };
  const browser = {
    async newPage() {
      trace.push('newPage');
      return page;
    },
  };

  const offers = await runPlaywrightTarget(browser, {
    name: 'Example',
    careers_url: 'https://example.com/careers',
  });

  assert.deepEqual(offers, [{
    title: 'Staff Engineer',
    url: 'https://example.com/jobs/2',
    company: 'Example',
    location: '',
  }]);
  assert.deepEqual(trace, ['newPage', 'goto', 'evaluateAll', 'close']);
});

test('runPlaywrightTarget dispatches a custom adapter function', async () => {
  const trace = [];
  const page = {
    async goto(url) {
      trace.push(['goto', url]);
    },
    async waitForLoadState() {},
    locator(selector) {
      trace.push(['locator', selector]);
      return {
        async evaluateAll(callback) {
          return callback([{
            textContent: 'Custom Probe',
            getAttribute(name) {
              if (name === 'href') return '/jobs/custom';
              return null;
            },
          }]);
        },
      };
    },
    async close() {
      trace.push('close');
    },
  };
  const browser = {
    async newPage() {
      trace.push('newPage');
      return page;
    },
  };

  const offers = await withWindow('https://example.com/careers', async () => runPlaywrightTarget(browser, {
    name: 'Probe',
    careers_url: 'https://example.com/careers',
    scan_method: 'playwright_custom',
    scan_adapter: 'salesforce',
  }));

  assert.deepEqual(offers, [{
    title: 'Custom Probe',
    url: 'https://example.com/jobs/custom',
    company: 'Probe',
    location: '',
  }]);
  assert.deepEqual(trace, [
    'newPage',
    ['goto', 'https://example.com/careers'],
    ['locator', 'a[href*="job"]'],
    'close',
  ]);
});
