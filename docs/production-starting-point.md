# Production starting point — 2026-10-06

The production release pins `emdash` and `@emdash-cms/cloudflare` to 1.1.0. Wrangler is 4.148.0. Use Node 24.18.0 (`mise exec node@24.18.0 -- npm …`).

The normal working checkout is `/home/chrisguill/code/practical-travel-gear`. Production runs the `practical-travel-gear` Worker, D1 database `d84b7ddc-76d7-4d64-92bb-c3e7fc7d4dec`, and the existing R2 media bucket. Production builds check the database schema; they never seed or apply migrations automatically.

## What was fixed

- Visible tag links fetch ten indexed rows. Archive lookups resolve one term without counting every term. Published listings use partial indexes and load metadata only.
- The versioned vendor patch removes unbounded taxonomy prefetch and replaces the expensive 404 cleanup query. It also returns a marked, uncached 503 if CMS initialization fails. Do not remove the patch when upgrading; review the corresponding upstream implementations first.
- CMS query errors are checked before deciding that an article/page/guide is missing. Marked backend failures get one retry for GET/HEAD; writes and genuine 404s are never retried.
- Scanner paths stop before CMS/D1 work. Public search shares persistent per-client quotas across HTML, API and suggestion requests: 20 per ten seconds and 60 per minute. Counters live in the `PublicSearchLimiter` SQLite Durable Object.
- Dependency updates and the sharp 0.35.5 override remove the reported advisories. Vendor patches apply using Git during installation; a mismatched patch fails installation.

## Verification

The release passed a clean install, 56 tests, typechecking and production build. Staging verified published versus private content, images, authenticated/private cache separation, scheduled publication and actual native cache invalidation. Production probes covered the homepage, listings, articles, taxonomies, feeds, sitemaps and search. See `emdash-upgrade-2026-10-06.json` for exact evidence and deployment identity.

The Python default user agent is rejected by Cloudflare with error 1010. Browser-like requests pass. This is separate from the application's scanner protection. Zone security settings and the original billing invoice remain inaccessible with the current OAuth permissions; no specific zone configuration or invoice amount is asserted.

The earlier intermittent backend error was not reproduced consistently. The release fixes confirmed error-handling defects and passed post-deployment probes; these checks do not prove that a platform timeout can never recur. Persistent backend failures remain uncached and retryable.

## Deploy and monitor

```sh
mise exec node@24.18.0 -- npm ci
mise exec node@24.18.0 -- npm run deploy
mise exec node@24.18.0 -- node scripts/migrate-d1.mjs --check --wrangler-config wrangler.jsonc --json
mise exec node@24.18.0 -- node scripts/cloudflare-usage-audit.mjs --after 2026-10-06T21:39:07.558Z --output .wrangler/usage-audit.json
```

The usage audit compares D1 against the preceding 24 hours and reports Workers requests, limiter requests, and limiter SQL reads/writes/duration. It explicitly labels incomplete windows; daily estimates from a short window are extrapolations. D1 totals include cron, admin and audit reads, so dividing them by Workers requests is not a direct page-query measurement. A one-time local timer checks the first full day after this release, allowing additional reporting delay. Inspect its status with `systemctl --user status ptg-usage-check-20261007.timer` and its result at `.wrangler/usage-audit-2026-10-07.json`; this requires the machine to be running and Wrangler authentication to remain usable.

Future database upgrades require a reviewed migration status, backup, rehearsal, and explicit target fingerprint. `scripts/migrate-d1.mjs` uses Wrangler authentication in memory with EmDash's supported migration executor. It does not write credentials into files.

## Recovery and preserved work

The pre-upgrade logical database backup is outside Git at `/home/chrisguill/.hermes/profiles/practical-travel-gear/backups/emdash-110-20261006/production.sqlite`. Its metadata records the Cloudflare recovery bookmark, integrity checks and checksum. The rehearsal applied migrations 090/091 while preserving all 73 original data tables checked, including FTS. The logical backup was collected across multiple reads; the D1 Time Travel bookmark is the point-in-time recovery reference. R2 media was not changed by this release; this is a database backup, not a new media backup.

The original dirty main workspace, including untracked files, is preserved by local Git stash commit `8c7fb6cc316c0030a38dc711f6ef7b6d09ca07d0`, also referenced by local branch `backup/workspace-before-emdash-110`. To recover it, create a separate checkout at its original parent and apply that stash commit there. Do not apply it directly over production's main branch. Existing alternative upgrade worktrees are preserved and may contain stale dependencies.

A rollback must preserve the Durable Object binding, exported class and migration history. Database migrations add redirect tables/triggers; reverting Worker code does not undo schema changes. Prefer a reviewed roll-forward to blindly deploying an older checkout.
