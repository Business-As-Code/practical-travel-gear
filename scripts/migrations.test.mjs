import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createDialect } from 'emdash/db/sqlite';
import { createDirectMigrationExecutor, getCoreMigrationIdentity } from 'emdash/migrations';

test('installed 0.38 migrations apply locally, retain revision triggers and are repeatable', async () => {
  await mkdir('.wrangler', {recursive:true});
  const directory=await mkdtemp('.wrangler/migration-test-');
  const file=`${directory}/fixture.sqlite`;
  const identity=await getCoreMigrationIdentity();
  assert.equal(identity.emdashVersion,'0.38.0');
  const execute=async action => {
    const executor=createDirectMigrationExecutor({target:{kind:'sqlite',label:'disposable-local-test',fingerprint:file},createDialect:()=>createDialect({url:file})});
    try { return await executor.execute({action,i18n:null,artifact}); }
    finally { await executor.dispose?.(); }
  };
  const artifact={emdashVersion:identity.emdashVersion,migrationSetFingerprint:identity.fingerprint};
  let sqlite;
  try {
    const before=await execute('check');
    assert.equal(before.knownApplied.length,0);
    assert.equal(before.pending.length,identity.names.length);
    const applied=await execute('apply');
    assert.equal(applied.pending.length,0);
    assert.equal(applied.knownApplied.length,identity.names.length);
    const again=await execute('apply');
    assert.deepEqual(again.executed,[]);
    assert.deepEqual(again.unknownApplied,[]);
    sqlite=new DatabaseSync(file);
    assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='_emdash_entry_locks'").get());
    assert.ok(sqlite.prepare('PRAGMA table_info(_emdash_collections)').all().some(c=>c.name==='edit_locking'));
    sqlite.exec("INSERT INTO options(name,value) VALUES('cleanup-fixture','one')");
    const revision=sqlite.prepare("SELECT revision FROM options WHERE name='cleanup-fixture'").get().revision;
    assert.notEqual(revision,'0');
    sqlite.exec("UPDATE options SET value='two' WHERE name='cleanup-fixture'");
    assert.notEqual(sqlite.prepare("SELECT revision FROM options WHERE name='cleanup-fixture'").get().revision,revision);
    assert.ok(sqlite.prepare('PRAGMA table_info(_plugin_storage)').all().some(c=>c.name==='revision'));
  } finally { sqlite?.close(); await rm(directory,{recursive:true,force:true}); }
});
