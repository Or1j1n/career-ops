export async function scan(page, company) {
  await page.goto(company.careers_url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle').catch(() => {});

  const offers = await page.locator('a').evaluateAll((anchors) => {
    return anchors
      .map((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href || !href.includes('/job/')) return null;

        const container = anchor.closest?.('article, li, div, section') || anchor.parentElement || anchor;
        const heading = container?.querySelector?.('h3.careers-joblistResponsive-subheading');
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
