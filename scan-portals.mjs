import fs from 'fs';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

const portalsPath = '/c/dev/career-ops/portals.yml';
const scanHistoryPath = '/c/dev/career-ops/data/scan-history.tsv';
const pipelinePath = '/c/dev/career-ops/data/pipeline.md';
const applicationsPath = '/c/dev/career-ops/data/applications.md';

// Load config
const config = yaml.load(fs.readFileSync(portalsPath, 'utf8'));
const scanHistory = fs.readFileSync(scanHistoryPath, 'utf8').split('\n');
const pipeline = fs.readFileSync(pipelinePath, 'utf8');
const applications = fs.readFileSync(applicationsPath, 'utf8');

// Build dedup sets
const seenUrls = new Set(scanHistory.slice(1).filter(l => l.trim()).map(l => l.split('\t')[0]));
const pipelineUrls = new Set(
  pipeline.split('\n')
    .filter(l => l.match(/^\s*-\s*\[/))
    .map(l => l.match(/https?:\/\/[^\s|]+/)?.[0])
    .filter(Boolean)
);
const appliedUrls = new Set(
  applications.split('\n')
    .filter(l => l.startsWith('|') && !l.startsWith('| #'))
    .map(l => {
      const match = l.match(/\[(\d+)\]\(([^)]+)\)/);
      return match ? match[2] : null;
    })
    .filter(Boolean)
);

console.log(`[SCAN] Dedup sets loaded: ${seenUrls.size} in history, ${pipelineUrls.size} in pipeline, ${appliedUrls.size} applied`);

// Title filter function
function passesFilter(title) {
  const titleLower = title.toLowerCase();
  const hasPositive = config.title_filter.positive.some(k => titleLower.includes(k.toLowerCase()));
  const hasNegative = config.title_filter.negative.some(k => titleLower.includes(k.toLowerCase()));
  return hasPositive && !hasNegative;
}

async function scanCareerUrl(browser, company, careersUrl) {
  try {
    const page = await browser.newPage();
    await page.goto(careersUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    
    // Generic job extraction (works for most ATS)
    const jobs = await page.locator('a').evaluateAll((els) => {
      return els
        .filter(el => {
          const href = el.getAttribute('href');
          const text = el.textContent;
          return href && text && (
            href.includes('/job') || 
            href.includes('/position') || 
            href.includes('/jobs')
          );
        })
        .map(el => ({
          title: el.textContent.trim(),
          url: new URL(el.getAttribute('href'), el.ownerDocument.location).href
        }))
        .filter((j, i, a) => a.findIndex(x => x.url === j.url) === i); // Dedup by URL
    }).catch(() => []);

    await page.close();
    return jobs;
  } catch (e) {
    console.error(`[ERROR] Failed to scan ${company}: ${e.message}`);
    return [];
  }
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  
  for (const company of config.tracked_companies) {
    if (!company.enabled || !company.careers_url) continue;
    
    console.log(`[SCAN] ${company.name}...`);
    const jobs = await scanCareerUrl(browser, company.name, company.careers_url);
    
    for (const job of jobs) {
      const isDup = seenUrls.has(job.url) || pipelineUrls.has(job.url) || appliedUrls.has(job.url);
      const passes = passesFilter(job.title);
      
      if (!isDup && passes) {
        results.push({
          url: job.url,
          company: company.name,
          title: job.title,
          status: 'added'
        });
        seenUrls.add(job.url);
      } else if (isDup) {
        results.push({ url: job.url, company: company.name, title: job.title, status: 'skipped_dup' });
      } else if (!passes) {
        results.push({ url: job.url, company: company.name, title: job.title, status: 'skipped_title' });
      }
    }
  }
  
  await browser.close();
  
  // Write results
  const newLines = results
    .filter(r => r.status === 'added' || r.status === 'skipped_dup' || r.status === 'skipped_title')
    .map(r => `${r.url}\t2026-04-12\tplaywright\t${r.title}\t${r.company}\t${r.status}`);
  
  if (newLines.length > 0) {
    fs.appendFileSync(scanHistoryPath, newLines.join('\n') + '\n');
  }
  
  const added = results.filter(r => r.status === 'added');
  console.log(`\n[RESULTS] Found ${jobs} total across all companies, ${added.length} new relevant jobs, ${results.filter(r => r.status === 'skipped_dup').length} duplicates, ${results.filter(r => r.status === 'skipped_title').length} filtered`);
  
  process.exit(0);
})();
