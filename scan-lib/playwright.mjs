import { chromium } from 'playwright';

export function getPlaywrightConcurrency(value = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2;
  return Math.max(1, Math.min(3, Math.floor(numeric)));
}

export async function loadCustomAdapter(adapterName) {
  try {
    const module = await import(new URL(`../adapters/${adapterName}.mjs`, import.meta.url));
    if (typeof module.scan !== 'function') {
      throw new Error(`Adapter "${adapterName}" must export scan(page, company)`);
    }
    return module;
  } catch (error) {
    throw new Error(`Failed to load adapter "${adapterName}": ${error.message}`);
  }
}

export async function scanWithPlaywrightGeneric(page, company) {
  await page.goto(company.careers_url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  const offers = await page.locator('a').evaluateAll((anchors) => {
    const locationSelectors = [
      '[data-testid="location"]',
      '[data-automation-id*="location"]',
      '[class*="location"]',
      '[aria-label*="location" i]',
    ];

    function getLocation(anchor) {
      const container = anchor.closest('article, li, tr, div, section') || anchor.parentElement;
      if (!container) return '';

      for (const selector of locationSelectors) {
        const node = container.querySelector(selector);
        const value = node?.textContent?.trim();
        if (value) return value;
      }

      return '';
    }

    return anchors
      .map((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href) return null;

        const url = new URL(href, window.location.href).href;
        const title = (
          anchor.textContent?.trim() ||
          anchor.getAttribute('aria-label') ||
          anchor.getAttribute('title') ||
          ''
        ).trim();

        if (!title) return null;

        return {
          title,
          url,
          company: '',
          location: getLocation(anchor),
        };
      })
      .filter(Boolean);
  });

  return offers.map((offer) => ({
    ...offer,
    company: company.name,
    location: offer.location || '',
  }));
}

export async function runPlaywrightTarget(browser, company) {
  const page = await browser.newPage();

  try {
    if (company.scan_method === 'playwright_custom') {
      const adapter = await loadCustomAdapter(company.scan_adapter);
      return await adapter.scan(page, company);
    }

    return await scanWithPlaywrightGeneric(page, company);
  } finally {
    await page.close();
  }
}

export function applyScanWrites({ offers, dryRun, writePipeline, writeHistory }) {
  if (dryRun || offers.length === 0) {
    return;
  }

  writePipeline(offers);
  writeHistory(offers);
}

export async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true });

  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}
