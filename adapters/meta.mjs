export async function scan(page, company) {
  await page.goto(company.careers_url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle').catch(() => {});

  const offers = await page.locator('a[href*="/profile/job_details/"]').evaluateAll((anchors) => {
    const locationSelectors = [
      'span[data-testid="job-location"]',
      'span[data-testid="location"]',
    ];

    function normalizeLocation(value) {
      const text = String(value || '').trim();
      if (!text) return '';
      if (/multiple locations/i.test(text)) return '';
      if (/\+\s*\d+\s+more/i.test(text)) return '';
      if (/\+\s*\d+\s+locations?/i.test(text)) return '';
      return text;
    }

    function getLocation(cardRoot) {
      for (const selector of locationSelectors) {
        const node = cardRoot.querySelector?.(selector);
        const value = normalizeLocation(node?.textContent);
        if (value) return value;
      }

      return '';
    }

    return anchors
      .map((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href || !href.includes('/profile/job_details/')) return null;

        const cardRoot = anchor;
        const heading = cardRoot.querySelector?.('h3');
        const title = (
          heading?.textContent?.trim() ||
          anchor.getAttribute('aria-label') ||
          anchor.getAttribute('title') ||
          ''
        ).trim();
        if (!title) return null;

        return {
          title,
          url: new URL(href, window.location.href).href,
          company: '',
          location: getLocation(cardRoot),
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
