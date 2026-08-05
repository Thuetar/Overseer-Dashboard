import { normalizeDataSourceConfig } from './deviceDataSource.js';

const REQUEST_TIMEOUT_MS = 8000;

async function fetchJson(url, options, fetcher, timeoutMs) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      ...options
    });
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`.trim();
      try {
        const errorBody = await response.json();
        message = errorBody.message || message;
      } catch {
        // The status text remains the best available error message.
      }
      throw new Error(message);
    }
    return await response.json();
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function endpoint(config, path) {
  const normalized = normalizeDataSourceConfig(config);
  if (!normalized.baseUrl) {
    throw new Error('Configure a device address before managing files.');
  }
  return `${normalized.baseUrl}${path}`;
}

export function buildStorageFileUrl(config, path) {
  const query = new URLSearchParams({ path: String(path ?? '') });
  return endpoint(config, `/api/storage/file?${query}`);
}

export async function fetchStorageSnapshot(config, options = {}) {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const [stats, listing] = await Promise.all([
    fetchJson(endpoint(config, '/api/storage'), {}, fetcher, timeoutMs),
    fetchJson(endpoint(config, '/api/storage/files'), {}, fetcher, timeoutMs)
  ]);

  return {
    stats,
    files: Array.isArray(listing.files) ? listing.files : [],
    truncated: Boolean(listing.truncated),
    receivedAt: new Date()
  };
}

export async function deleteStorageFile(config, path, options = {}) {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  return fetchJson(buildStorageFileUrl(config, path), { method: 'DELETE' }, fetcher, timeoutMs);
}

export function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}
