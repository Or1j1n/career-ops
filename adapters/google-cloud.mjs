export async function scan(page, company) {
  await page.goto(company.careers_url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle').catch(() => {});

  const offers = await page.locator('a[href*="jobs/results/"]').evaluateAll((anchors) => {
    const locationSelectors = [
      'div.EAcu5e.Gx4ovb',
      'span.pwO9Dc:not(.vo5qdf)',
      'span.r0wTof',
      '[data-testid="job-location"]',
      '[data-testid="location"]',
    ];

    function getClassName(node) {
      return String(node?.className || node?.getAttribute?.('class') || '');
    }

    function findCardRoot(anchor) {
      let node = anchor.parentElement;

      while (node) {
        const className = getClassName(node);
        if (className.includes('sMn82b') || className.includes('lLd3Je')) {
          return node;
        }
        node = node.parentElement;
      }

      return anchor.parentElement || anchor;
    }

    function normalizeLocation(value) {
      const text = String(value || '').trim();
      if (!text) return '';
      if (/;/.test(text)) return '';
      if (/\+\s*\d+\s+more/i.test(text)) return '';
      if (/\+\s*\d+\s+locations?/i.test(text)) return '';
      if (/multiple locations/i.test(text)) return '';
      const afterPipe = text.includes('|') ? text.split('|').pop() : text;
      const normalized = afterPipe.replace(/^place\s*/i, '').trim();
      if (!normalized) return '';
      if (/;/.test(normalized)) return '';
      if (/\+\s*\d+\s+more/i.test(normalized)) return '';
      if (/\+\s*\d+\s+locations?/i.test(normalized)) return '';
      if (/multiple locations/i.test(normalized)) return '';
      return normalized;
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
        if (!href || !href.includes('jobs/results/')) return null;

        const cardRoot = findCardRoot(anchor);
        const heading = cardRoot?.querySelector?.('h3.QJPWVe');
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
