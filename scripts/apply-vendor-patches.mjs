// Apply our versioned billing fixes without an additional patching dependency.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const file of readdirSync(new URL('../patches/', import.meta.url)).filter(name => name.endsWith('.patch')).sort()) {
  const patch = `patches/${file}`;
  const run = args => spawnSync('git', ['apply', '--whitespace=nowarn', ...args, patch], { cwd: root, encoding: 'utf8' });
  if (run(['--reverse', '--check']).status === 0) continue;
  const check = run(['--check']);
  if (check.error || check.status !== 0) throw new Error(`Vendor patch ${file} no longer applies: ${check.error?.message ?? check.stderr}`);
  const result = run([]);
  if (result.error || result.status !== 0) throw new Error(`Vendor patch ${file} failed: ${result.error?.message ?? result.stderr}`);
  console.log(`Applied ${file}`);
}
