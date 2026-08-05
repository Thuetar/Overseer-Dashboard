import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStorageFileUrl,
  deleteStorageFile,
  fetchStorageSnapshot,
  formatBytes
} from '../src/lib/storageDataSource.js';

test('loads filesystem stats and the file listing', async () => {
  const requested = [];
  const fetcher = async (url, options) => {
    requested.push({ url, method: options.method ?? 'GET' });
    const isListing = url.endsWith('/files');
    return {
      ok: true,
      json: async () => isListing
        ? { files: [{ path: '/log.txt', type: 'file' }], truncated: false }
        : { total_bytes: 4096, used_bytes: 1024, free_bytes: 3072 }
    };
  };

  const snapshot = await fetchStorageSnapshot(
    { baseUrl: 'http://tankman.local', refreshIntervalSeconds: 30 },
    { fetcher, timeoutMs: 100 }
  );

  assert.deepEqual(requested, [
    { url: 'http://tankman.local/api/storage', method: 'GET' },
    { url: 'http://tankman.local/api/storage/files', method: 'GET' }
  ]);
  assert.equal(snapshot.stats.free_bytes, 3072);
  assert.equal(snapshot.files[0].path, '/log.txt');
  assert.equal(snapshot.receivedAt instanceof Date, true);
});

test('builds encoded download URLs and deletes files', async () => {
  const config = { baseUrl: 'http://tankman.local/', refreshIntervalSeconds: 30 };
  const url = buildStorageFileUrl(config, '/logs/today 1.txt');
  assert.equal(url, 'http://tankman.local/api/storage/file?path=%2Flogs%2Ftoday+1.txt');

  let request;
  const result = await deleteStorageFile(config, '/log.txt', {
    timeoutMs: 100,
    fetcher: async (requestedUrl, options) => {
      request = { url: requestedUrl, method: options.method };
      return { ok: true, json: async () => ({ ok: true, path: '/log.txt' }) };
    }
  });
  assert.deepEqual(request, {
    url: 'http://tankman.local/api/storage/file?path=%2Flog.txt',
    method: 'DELETE'
  });
  assert.equal(result.ok, true);
});

test('formats storage byte values', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.00 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.00 MB');
  assert.equal(formatBytes(undefined), '—');
});
