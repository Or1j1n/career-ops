import { existsSync, readFileSync } from 'fs';
import yaml from 'js-yaml';

import { detectApi } from './api.mjs';

const parseYaml = yaml.load;

function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_/']/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeLocationLabels(allowedLocations) {
  if (!Array.isArray(allowedLocations)) return [];
  return allowedLocations
    .map((label) => normalizeText(label).trim())
    .filter((label) => label.length > 0);
}

export function loadScanConfig(path = 'portals.yml') {
  if (!existsSync(path)) {
    throw new Error(`Error: ${path} not found. Run onboarding first.`);
  }

  const config = parseYaml(readFileSync(path, 'utf-8')) || {};
  buildLocationFilter(config.location_filter);
  return config;
}

function mergeTitleFilter(baseTitleFilter, companyTitleFilter) {
  return {
    positive: [
      ...(baseTitleFilter?.positive || []),
      ...(companyTitleFilter?.positive || []),
    ],
    negative: [
      ...(baseTitleFilter?.negative || []),
      ...(companyTitleFilter?.negative || []),
    ],
  };
}

export function buildCompanyTitleFilter(baseTitleFilter, companyTitleFilter) {
  const merged = mergeTitleFilter(baseTitleFilter, companyTitleFilter);
  const positive = merged.positive.map((k) => k.toLowerCase());
  const negative = merged.negative.map((k) => k.toLowerCase());

  return (title) => {
    const lower = String(title || '').toLowerCase();
    const hasPositive = positive.length === 0 || positive.some((k) => lower.includes(k));
    const hasNegative = negative.some((k) => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

export function buildTitleFilter(titleFilter) {
  return buildCompanyTitleFilter(titleFilter);
}

export function buildLocationFilter(allowedLocations) {
  const allowed = normalizeLocationLabels(allowedLocations);
  if (allowed.length === 0) {
    throw new Error('Error: location_filter missing or empty in portals.yml');
  }

  return (location) => {
    if (!location || location.trim() === '') return false;
    const normalized = normalizeText(location);
    if (/\b(texas|tx|united states|usa)\b/.test(normalized)) return false;

    const padded = ` ${normalized} `;
    return allowed.some((label) => padded.includes(` ${label} `));
  };
}

export function resolveScanMethod(company) {
  if (company.scan_method === 'playwright_custom') {
    return { type: 'playwright_custom', adapter: company.scan_adapter };
  }

  if (company.scan_method === 'playwright_generic') {
    return { type: 'playwright_generic' };
  }

  const api = detectApi(company);
  if (api) {
    return { type: 'api', api };
  }

  if (company.scan_method) {
    return { type: 'deferred', method: company.scan_method, explicit: true };
  }

  return { type: 'playwright_generic', implicit: true };
}
