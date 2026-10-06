import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { checkQuota, initializeQuota } from '../src/lib/search-quota.ts';

test('persistent search counters enforce bursts, minute budgets, client isolation and reset', () => {
  const sqlite = new DatabaseSync(':memory:');
  const sql = { exec(query, ...args) { const statement = sqlite.prepare(query); return /^(?:SELECT|PRAGMA)/i.test(query) ? statement.all(...args) : (statement.run(...args), []); } };
  initializeQuota(sql);
  try {
    for (const now of [0, 10000, 20000]) {
      for (let i = 0; i < 20; i++) assert.equal(checkQuota(sql, 'client-a', now).success, true);
      assert.equal(checkQuota(sql, 'client-a', now).success, false);
    }
    assert.equal(checkQuota(sql, 'client-a', 30000).success, false, 'minute quota survives a new burst window');
    initializeQuota(sql);
    assert.equal(checkQuota(sql, 'client-a', 40000).success, false, 'object restart does not reset persisted counters');
    assert.equal(checkQuota(sql, 'client-b', 40000).success, true);
    assert.equal(checkQuota(sql, 'client-a', 60000).success, true);
  } finally { sqlite.close(); }
});
