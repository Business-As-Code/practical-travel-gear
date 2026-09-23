import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
const ast = ts.createSourceFile('astro.config.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let options;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'emdash') {
    assert.equal(options, undefined, 'only one EmDash integration');
    options = node.arguments[0];
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const property = (object, name) => object?.properties?.find(p => p.name?.getText(ast) === name)?.initializer;

// Read the actual integration option rather than testing an unrelated constant.
const productionMigrationConfig = {
  runtime: property(property(options, 'migrations'), 'runtime')?.text,
};
test('production EmDash integration explicitly checks schema instead of applying migrations', () => {
  assert.equal(productionMigrationConfig.runtime, 'check');
});

test('production-bound version uploads explicitly disable public preview routes', () => {
  const text = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const { config, error } = ts.parseConfigFileTextToJson('wrangler.jsonc', text);
  assert.equal(error, undefined);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.ok(!config.vars?.EMDASH_MIGRATIONS_MODE || config.vars.EMDASH_MIGRATIONS_MODE === 'check');
});
