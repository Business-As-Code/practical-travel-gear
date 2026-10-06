// Use Wrangler's current login only in memory with EmDash's supported migration executor.
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
if (!args.includes('--wrangler-config')) throw new Error('An explicit Wrangler config is required.');
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const emdash = fileURLToPath(new URL('../node_modules/emdash/dist/cli/index.mjs', import.meta.url));
const { token } = JSON.parse(execFileSync(process.execPath, [wrangler, 'auth', 'token', '--json'], { encoding: 'utf8' }));
if (!token) throw new Error('Wrangler login is required.');
const result = spawnSync(process.execPath, [emdash, 'migrate', ...args], {
  stdio: 'inherit', env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
