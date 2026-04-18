export async function scan(page, company) {
  await page.goto(company.careers_url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle').catch(() => {});

  const offers = await page.locator('a[href*="/jobs/"]').evaluateAll((anchors) => {
    const locationSelectors = [
      '[data-testid="location"]',
      '[data-qa="job-location"]',
      '[class*="location"]',
      '[aria-label*="location" i]',
      '[aria-label*="lieu" i]',
    ];

    function getLocation(anchor) {
      const container = anchor.closest('article, li, div, section');
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

        const title = (
          anchor.textContent?.trim() ||
          anchor.getAttribute('aria-label') ||
          anchor.getAttribute('title') ||
          ''
        ).trim();
        if (!title) return null;

        return {
          title,
          url: new URL(href, window.location.href).href,
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
