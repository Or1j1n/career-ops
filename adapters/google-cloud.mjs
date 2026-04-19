export async function scan(page, company) {
  await page.goto(company.careers_url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle').catch(() => {});

  const offers = await page.locator('a[href*="jobs/results/"]').evaluateAll((anchors) => {
    const locationSelectors = [
      '.r0wTof',
      '[data-testid="job-location"]',
      '[data-testid="location"]',
    ];

    function getLocation(anchor) {
      const container = anchor.closest?.('article, li, div, section') || anchor.parentElement;
      if (!container) return '';

      for (const selector of locationSelectors) {
        const node = container.querySelector?.(selector);
        const value = node?.textContent?.trim();
        if (value) return value;
      }

      return '';
    }

    return anchors
      .map((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href || !href.includes('jobs/results/')) return null;

        const container = anchor.closest?.('article, li, div, section') || anchor.parentElement || anchor;
        const heading = container?.querySelector?.('h3.QJPWVe');
        const ariaLabel = anchor.getAttribute('aria-label') || '';
        const normalizedHref = /^https?:\/\//i.test(href) || href.startsWith('/') ? href : `/${href}`;
        const title = (
          heading?.textContent?.trim() ||
          ariaLabel.replace(/^Learn more about\s*/i, '').trim() ||
          anchor.getAttribute('title') ||
          ''
        ).trim();
        if (!title) return null;

        return {
          title,
          url: new URL(normalizedHref, window.location.href).href,
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
