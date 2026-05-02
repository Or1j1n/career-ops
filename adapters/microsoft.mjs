export async function scan(page, company) {
  await page.goto(company.careers_url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle').catch(() => {});

  const offers = await page.locator('a').evaluateAll((anchors) => {
    const locationSelectors = [
      '[data-testid*="location" i]',
      '[aria-label*="location" i]',
      '[class*="location" i]',
      '[class*="Location"]',
    ];

    function getClassName(node) {
      return String(node?.className || node?.getAttribute?.('class') || '');
    }

    function findCardRoot(anchor) {
      let node = anchor.parentElement;
      while (node) {
        const className = getClassName(node);
        if (
          className.includes('careers-joblistResponsive-columnList') ||
          className.includes('careers-joblistResponsive-columncontainer')
        ) {
          return node;
        }
        node = node.parentElement;
      }

      return anchor.parentElement || anchor;
    }

    function normalizeLocation(value) {
      const text = String(value || '').trim();
      if (!text) return '';
      if (/multiple locations/i.test(text)) return '';
      if (/\+\s*\d+\s+(more|locations?)/i.test(text)) return '';
      return text;
    }

    function getLocation(cardRoot) {
      for (const selector of locationSelectors) {
        const node = cardRoot?.querySelector?.(selector);
        const value = normalizeLocation(node?.textContent || node?.getAttribute?.('aria-label'));
        if (value) return value;
      }

      return '';
    }

    return anchors
      .map((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href || !href.includes('/job/')) return null;

        const cardRoot = findCardRoot(anchor);
        const heading = cardRoot?.querySelector?.('h3.careers-joblistResponsive-subheading');
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
  }));
}
