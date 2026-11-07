import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasDescription, intervalFrom, insertNewRows, kickExtractor, discoverWithRetry } from '../pipeline.js';

test('listing discovery recovers transient failures and bounds persistent failures', async () => {
  let calls = 0;
  const retries: number[] = [];
  const fetcher = async () => ++calls < 3 ? new Response('', { status: 503 }) : Response.json({ jobs: [{ id: 1 }] });
  assert.deepEqual(await discoverWithRetry('https://example.test', attempt => retries.push(attempt), fetcher as typeof fetch, async () => {}), { jobs: [{ id: 1 }] });
  assert.deepEqual(retries, [1, 2]);
  calls = 0;
  await assert.rejects(discoverWithRetry('https://example.test', () => {}, (async () => { calls++; throw new Error('fetch failed'); }) as typeof fetch, async () => {}), /fetch failed/);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(discoverWithRetry('https://example.test', () => {}, (async () => { calls++; return new Response('', { status: 403 }); }) as typeof fetch, async () => {}), /403/);
  assert.equal(calls, 1);
});

test('page spacing has safe bounds and a two-second default', () => {
  assert.equal(intervalFrom(undefined), 2000);
  assert.equal(intervalFrom(5000), 5000);
  for (const value of [0, -1, 999, 30001, 'bad', Infinity]) assert.throws(() => intervalFrom(value));
});
test('company and deadline alone cannot pass detail readiness', () => {
  assert.equal(hasDescription({ company: 'Example', deadline: '2026-12-01' }), false);
  assert.equal(hasDescription({ description: 'No detailed description available.' }), false);
  assert.equal(hasDescription({ description_html: '<p>' + 'Job responsibilities and qualifications. '.repeat(8) + '</p>' }), true);
});
test('sync ignores conflicts and only reports confirmed new rows', async () => {
  const existing = { id: 'old', extraction_status: 'done' };
  const reported: any[] = [];
  const client = { from: () => ({ upsert: (rows: any[], options: any) => {
    assert.equal(options.ignoreDuplicates, true);
    assert.equal(rows.length, 2);
    return { select: async () => ({ data: rows.filter(row => row.id !== 'old'), error: null }) };
  } }) };
  await insertNewRows(client, 'raw_jobs', 'id', [{ id: 'old' }, { id: 'new' }, { id: 'new' }], rows => reported.push(...rows));
  assert.deepEqual(reported, [{ id: 'new' }]);
  assert.equal(existing.extraction_status, 'done');
});
test('partial sync retains confirmed inserts when a later batch fails', async () => {
  let batch = 0; const reported: any[] = [];
  const client = { from: () => ({ upsert: (rows: any[]) => ({ select: async () => ++batch === 1
    ? { data: rows, error: null } : { data: null, error: new Error('database unavailable') } }) }) };
  await assert.rejects(insertNewRows(client, 'raw_jobs', 'id', Array.from({ length: 51 }, (_, i) => ({ id: String(i) })), rows => reported.push(...rows)));
  assert.equal(reported.length, 50);
});
function extractorClient(result: any) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { enabled: true } }) }) }) }),
    rpc: async () => ({ data: 'test-only-token' }), functions: { invoke: async (_name: string, options: any) => {
      assert.equal(options.headers['X-Kazio-Extractor-Token'], 'test-only-token');
      return { data: result };
    } } };
}
test('extractor uses its internal credential and reports processed output', async () => {
  assert.deepEqual(await kickExtractor(extractorClient({ processed: 1, results: [{ status: 'done' }] }), 'ndangira'), { status: 'requested', processed: 1 });
});
test('HTTP success cannot hide extractor capacity or row failures', async () => {
  await assert.rejects(kickExtractor(extractorClient({ stopped: 'no_ai_capacity' }), 'ndangira'), /no_ai_capacity/);
  await assert.rejects(kickExtractor(extractorClient({ results: [{ status: 'failed', error: 'bad description' }] }), 'ndangira'), /bad description/);
});
