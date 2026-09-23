import assert from 'node:assert/strict';
import test from 'node:test';

test('publishing success without native purge cannot pass deployment validation', async () => {
  const { scheduledValidationReport } = await import('./scheduled-validation.mjs');
  const report = scheduledValidationReport({rows: [{id:'due',status:'published'}], migrations:['test']});
  assert.equal(report.publication.status, 'passed');
  assert.equal(report.nativeInvalidation.status, 'unverified');
  assert.equal(report.deploymentReady, false);
  assert.equal(report.exitCode, 1);
  assert.match(report.nativeInvalidation.reason, /purge|invalidation/);
});
