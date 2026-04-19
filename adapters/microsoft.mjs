export async function scan(page, company) {
  await page.goto(company.careers_url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle').catch(() => {});

  const offers = await page.locator('a').evaluateAll((anchors) => {
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
          location: 'Paris',
        };
      })
      .filter(Boolean);
  });

  return offers.map((offer) => ({
    ...offer,
    company: company.name,
  }));
}
