import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DATA_SOURCE_STORAGE_KEY,
  fetchDeviceSnapshot,
  loadDataSourceConfig,
  normalizeDataSourceConfig,
  saveDataSourceConfig
} from '../src/lib/deviceDataSource.js';

test('normalizes device addresses and refresh bounds', () => {
  assert.deepEqual(normalizeDataSourceConfig({
    baseUrl: ' http://tankman.local/// ',
    refreshIntervalSeconds: 2
  }), {
    baseUrl: 'http://tankman.local',
    refreshIntervalSeconds: 5
  });

  assert.throws(
    () => normalizeDataSourceConfig({ baseUrl: 'ftp://tankman.local' }),
    /http:\/\/ or https:\/\//
  );
});

test('persists and restores the source configuration', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };

  const saved = saveDataSourceConfig({
    baseUrl: 'http://192.168.1.38/',
    refreshIntervalSeconds: 15
  }, storage);

  assert.equal(values.has(DATA_SOURCE_STORAGE_KEY), true);
  assert.deepEqual(loadDataSourceConfig(storage), saved);
});

test('loads all existing device read endpoints into one snapshot', async () => {
  const requested = [];
  const fetcher = async (url) => {
    requested.push(url);
    return {
      ok: true,
      json: async () => ({ endpoint: new URL(url).pathname })
    };
  };

  const snapshot = await fetchDeviceSnapshot(
    { baseUrl: 'http://tankman.local', refreshIntervalSeconds: 30 },
    { fetcher, timeoutMs: 100 }
  );

  assert.deepEqual(requested, [
    'http://tankman.local/api/status',
    'http://tankman.local/api/tank',
    'http://tankman.local/api/tank/config'
  ]);
  assert.equal(snapshot.status.endpoint, '/api/status');
  assert.equal(snapshot.tank.endpoint, '/api/tank');
  assert.equal(snapshot.tankConfig.endpoint, '/api/tank/config');
  assert.equal(snapshot.receivedAt instanceof Date, true);
});
