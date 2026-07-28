export const DATA_SOURCE_STORAGE_KEY = 'coach-overseer.data-source';

export const DEFAULT_DATA_SOURCE = Object.freeze({
  baseUrl: '',
  refreshIntervalSeconds: 30
});

const MIN_REFRESH_SECONDS = 5;
const MAX_REFRESH_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 8000;

export function normalizeDataSourceConfig(value = {}) {
  const baseUrl = String(value.baseUrl ?? '').trim().replace(/\/+$/, '');
  const requestedInterval = Number(value.refreshIntervalSeconds);
  const refreshIntervalSeconds = Number.isFinite(requestedInterval)
    ? Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, Math.round(requestedInterval)))
    : DEFAULT_DATA_SOURCE.refreshIntervalSeconds;

  if (baseUrl) {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('The data source must use an http:// or https:// address.');
    }
  }

  return { baseUrl, refreshIntervalSeconds };
}

export function loadDataSourceConfig(storage = globalThis.localStorage) {
  if (!storage) return { ...DEFAULT_DATA_SOURCE };

  try {
    const stored = storage.getItem(DATA_SOURCE_STORAGE_KEY);
    return stored ? normalizeDataSourceConfig(JSON.parse(stored)) : { ...DEFAULT_DATA_SOURCE };
  } catch {
    return { ...DEFAULT_DATA_SOURCE };
  }
}

export function saveDataSourceConfig(value, storage = globalThis.localStorage) {
  const config = normalizeDataSourceConfig(value);
  storage?.setItem(DATA_SOURCE_STORAGE_KEY, JSON.stringify(config));
  return config;
}

async function fetchJson(url, fetcher, timeoutMs) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`.trim());
    }

    return await response.json();
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function fetchDeviceSnapshot(config, options = {}) {
  const normalized = normalizeDataSourceConfig(config);
  if (!normalized.baseUrl) {
    throw new Error('Configure a device address before refreshing.');
  }

  const fetcher = options.fetcher ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const endpoint = (path) => `${normalized.baseUrl}${path}`;
  const [status, tank, tankConfig] = await Promise.all([
    fetchJson(endpoint('/api/status'), fetcher, timeoutMs),
    fetchJson(endpoint('/api/tank'), fetcher, timeoutMs),
    fetchJson(endpoint('/api/tank/config'), fetcher, timeoutMs)
  ]);

  return {
    status,
    tank,
    tankConfig,
    receivedAt: new Date()
  };
}
