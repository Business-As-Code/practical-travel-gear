import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Kysely, sql } from 'kysely';
import { createDialect } from 'emdash/db/sqlite';
import { createDirectMigrationExecutor, getCoreMigrationIdentity } from 'emdash/migrations';

// Audit the installed native policy, not an imitation. No remote bindings.
test('native check policy rejects pending migrations without writes and accepts an already migrated read-only DB', async () => {
  await mkdir('.wrangler', { recursive: true });
  const directory = await mkdtemp('.wrangler/policy-test-');
  const file = resolve(directory, 'fixture.sqlite');
  const output = resolve(directory, 'policy.mjs');
  let db;
  try {
    await build({ entryPoints: ['node_modules/emdash/src/database/migrations/policy.ts'], outfile: output,
      bundle: true, platform: 'node', format: 'esm', packages: 'external' });
    const policy = await import(pathToFileURL(output).href);
    assert.equal(policy.resolveRuntimeMigrationMode(undefined, { dev: false }), 'auto');
    const source = readFileSync('astro.config.mjs', 'utf8');
    const ast = ts.createSourceFile('astro.config.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let integration;
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'emdash') integration = node.arguments[0];
      ts.forEachChild(node, visit);
    }
    visit(ast);
    const property = (object, name) => object?.properties?.find(p => p.name?.getText(ast) === name)?.initializer;
    const runtime = property(property(integration, 'migrations'), 'runtime')?.text;
    const mode = policy.resolveRuntimeMigrationMode({ runtime }, { dev: false });
    assert.equal(mode, 'check');
    db = new Kysely({ dialect: await createDialect({ url: file }) });
    await sql`PRAGMA query_only = ON`.execute(db);
    await assert.rejects(policy.enforceRuntimeMigrationPolicy(db, mode), { name: 'PendingMigrationsError' });
    const tables = await sql`SELECT name FROM sqlite_master WHERE type = 'table'`.execute(db);
    assert.deepEqual(tables.rows, []);
    await db.destroy();
    db = undefined;
    const identity = await getCoreMigrationIdentity();
    const executor = createDirectMigrationExecutor({
      target: { kind: 'sqlite', label: 'disposable-policy-test', fingerprint: file },
      createDialect: () => createDialect({ url: file }),
    });
    try {
      const applied = await executor.execute({ action: 'apply', i18n: null,
        artifact: { emdashVersion: identity.emdashVersion, migrationSetFingerprint: identity.fingerprint } });
      assert.deepEqual(applied.pending, []);
    } finally { await executor.dispose?.(); }
    db = new Kysely({ dialect: await createDialect({ url: file }) });
    await sql`PRAGMA query_only = ON`.execute(db);
    await policy.enforceRuntimeMigrationPolicy(db, mode);
    const changes = await sql`SELECT total_changes() AS count`.execute(db);
    assert.equal(changes.rows[0].count, 0);
  } finally { await db?.destroy(); await rm(directory, { recursive: true, force: true }); }
});
