export async function scan(page, company) {
  await page.goto(company.careers_url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle').catch(() => {});

  const offers = await page.locator('a[href*="job"]').evaluateAll((anchors) => {
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
