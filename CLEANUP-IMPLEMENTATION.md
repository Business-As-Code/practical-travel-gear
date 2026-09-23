# EmDash 0.38 reconciliation — release state

## Current authoritative state (2026-09-22)

Production **is on EmDash 0.38.0**. Worker version
`3b3f54bf-f48d-4ff7-8272-4c9992b89d57`, deployment
`367c53e7-c159-4013-aadf-76b92288bb78` received 100% traffic after the
native executor applied `075_entry_edit_locks`, `076_collection_nav_group`,
and `077_plugin_storage_revisions`. Post-apply check: 76 known applied,
zero pending or unknown migrations. These are recorded completed operations,
not instructions to run them again.

Authoritative evidence is in the separate operations workspace
`/home/chrisguill/Projects/practicaltravelgear/ops/`:

- `emdash-production-upgrade-report.md`: completed deployment and recovery record.
- `emdash-production-manifest.json`: immutable deployed source/build mapping
  (125 source files, 571 artifact files). Do not overwrite with a subsequent build.
- `emdash-staging-report.md`: historical remote native cache/purge tests.
- `emdash-repo-cleanup-preflight.md`: current repository preparation, staged
  file inventory, verification, remote drift and release/review gates.

The local purge limitation below was resolved as a **remote validation gate**:
staging proved warm native HIT, private BYPASS, real scheduled publication,
successful native tag invalidation and actual purge-failure handling. Production
readbacks proved warm HIT/private BYPASS, public routes, admin login reachability,
and retained fetch/scheduled handlers. A synthetic production scheduled post and
a valid interactive editor session were deliberately not tested. IMAGES account
quota/billing remains deferred; original-image fallback is preserved. One working
production image does not prove account-wide quota is resolved.

The release remains uncommitted on `cleanup/emdash-038`. `main` is not yet
synchronized with production. GitHub has historical Cloudflare Workers Builds
integration evidence: a push/merge may deploy. Do not commit, push, merge or deploy
without parent review and explicit authorization. Original dirty main must not be
reset or cleaned; recovery and canonical-checkout recommendations are in preflight.

### Retained harnesses and execution boundaries

- `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check` are
  local quality gates. Use production mode (`PTG_STAGING` unset) for release builds.
  Builds replace disposable `dist/`, not the restricted archived deployed artifact.
- `wrangler.local.json`, `smoke-local.mjs`, `verify-local-review.mjs`, and
  `verify-local-scheduled.mjs` are local-only fixtures. The scheduled verifier
  intentionally exits nonzero when native invalidation cannot be established locally.
- `wrangler.stage.json`, `src/worker.stage.ts`, `seed/stage.json`, and `stage_*.py`
  are retained isolated staging sources, not production imports/seeds. Remote
  staging scripts can mutate synthetic fixtures; they are **not** part of npm test.
  `stage-upgrade-034.mjs` also needs its separately prepared local 0.34 fixture.
- `migrate-native-proxy.mjs`, `migrate-native-local.mjs`, and
  `verify-restored-d1.mjs` are version-specific recovery tools, **not routine test
  commands**. Despite its filename, `migrate-native-local.mjs` only constrains
  the HTTP listener to loopback; its DB target depends on the supplied binding
  and may be remote. The proxy can apply production migrations with an explicit
  matching target. Do not execute these during repo cleanup. The proxy pins an
  internal 0.38 dialect filename and migration fingerprint; re-review on upgrades.
- Private generated configs, evidence, database rows and harness secrets stay in
  ignored `.wrangler/` or the restricted active-profile backup/secrets directory.
  Source scripts contain references, not secret values. Do not add those private
  files to Git. No script relocation is required; deployed manifest paths remain valid.

## Historical local implementation log (superseded where noted)

Everything below records the original implementation and local follow-up **before**
staging and production rollout. Its older test counts, undeployed-production
statements, and native-cache rollout blockers are historical, not current status.
Preserved here for diagnostic provenance; use the current evidence above instead.

## Scope and provenance

- Worktree: `/home/chrisguill/Projects/ptg-emdash-cleanup`, branch `cleanup/emdash-038`, starting at `b7ab2c8` (`origin/main`). No commits, pushes, deployments, production API access, credentials, or live migrations were performed by this implementation agent.
- Read both app AGENTS.md files and the PTG, EmDash/Cloudflare, TDD, and debugging skills. Inspected upstream history (`b7ab2c8`, `09af162`, earlier upgrade/scheduling commits) and filesystem diffs against `/home/chrisguill/Projects/practical-travel-gear`.
- The original migrated app was read only; its tracked and untracked work is not disposable. Its backup remains at `/home/chrisguill/Projects/practicaltravelgear/ops/backups/emdash-20260921T210742Z` (backup verification performed by parent, not repeated here).
- Parent reported read-only production evidence: September 18 Worker version `11ed969c-7cf0-485d-9ac7-f28a6019cca0` still contains the custom 0.34 code, not main's 0.37 changes; production has SESSION, IMAGES, DB, MEDIA and LOADER but no CACHE KV binding. This reconciliation does **not** assume main was deployed.

## Dependency decisions

- `emdash` and `@emdash-cms/cloudflare` pinned exactly to `0.38.0`; installed with `npm install --save-exact emdash@0.38.0 @emdash-cms/cloudflare@0.38.0` and subsequent `npm install`.
- Kept the existing upstream lock's Astro `7.3.2`, `@astrojs/cloudflare` `14.3.1`, `@astrojs/react` `6.0.5`, Wrangler `4.131.1` instead of copying original Astro 6 / adapter 13 internals or following npm's misleading historical `latest` EmDash tag.
- npm peer evidence: EmDash requires Astro >=6 prerelease and Node >=22.16; Cloudflare package requires Astro >=6 and Wrangler >=4.99. Host is Node `26.7.0`, npm `11.19.0`.
- Updated local `plugin-agentmail` peer from obsolete `^0.29.0` to `^0.38.0`. `npm ls` now reports a clean matched dependency tree. No integration, plugin settings, secrets or jobs were recreated.
- npm audit returned **0 vulnerabilities**. Installation reports upstream deprecated Oslo/Arctic packages and install-script approval notices for esbuild/workerd; installed binaries actually ran successfully for typecheck/build/local Worker.

## Reconciliation decisions

| Area | Decision and paths |
| --- | --- |
| Scheduling | Keep `createScheduledHandler({ generalCron: "*/5 * * * *" })` from `@emdash-cms/cloudflare/worker`. Its source calls native scheduled tasks and incrementally invalidates published collection/entry tags through the Astro provider. Do not restore SQL `scheduled-publish.ts`, visitor-triggered publishing, or production-fetching `prewarm.ts`. |
| HTML cache | Keep main's Astro/Workers native cache provider, route rules and `src/lib/edge-cache.ts` private-response safeguards. Do not restore competing Cache API HTML cache or URL normalization. Native cache still requires deployment/staging validation; see blocker below. |
| Object cache | Remove `kvCache({binding:"CACHE"})` and the speculative CACHE namespace from `astro.config.mjs` / `wrangler.jsonc`. No resource provisioning. SESSION remains separate. |
| Images | Restore `ResponsiveImage.astro`, `responsive-image.ts`, IMAGES binding and `/img` early Worker handler. Preserve bounded widths/srcsets, lazy cards and priority article/homepage heroes. Rewrite transform handling to use native `media` tags, short CDN freshness and browser revalidation rather than the original year-long immutable Cache API layer. Preserve original content-type on fallback and reload a consumed stream after a failed transform. Foreign-host images cannot masquerade as local R2 objects; invalid widths fail before storage IO. |
| Listings | Restore original slim homepage, posts/category/tag listings and card author names. Extract testable SQL to `src/lib/listing-query.ts`; `listing-cards.ts` only supplies DB. Avoid Portable Text bodies and N+1 taxonomy hydration on these listings. Retain main's cheap archive-term lookup, restore missing taxonomy pagination, stable ID ordering for date ties, explicit cache tags, bounded integer page input. Surface schema errors rather than silently using a full-body fallback. Preserve explicit image `src` instead of replacing it with the media row ID. |
| Other reads | Keep main's bounded native search and guides pagination. Keep metadata-only, keyset-batched RSS/sitemaps/llms feeds. These supersede the original disabled search and broader collection scans. |
| Routes | Restore expanded WP redirect map, legacy prefix/author aliases, `/authors`, author details, `/subscribe`, `/feed`, `/rss`, seller-free `/ads.txt`. Preserve exact redirect priority (`/page/2` explicitly goes to `/`; generic `/page/3` goes to `/posts`). Root catch-all only canonicalizes recognized WP date URLs; arbitrary nested URLs are real 404s, not misleading last-segment redirects. Missing content returns a 404 at the requested URL with no-store. |
| Subscription/footer | Replace main's nonfunctional signup form with the original honest RSS subscription. Keep CMS-managed social/menu/footer/tag data and main's count-free taxonomy reads rather than hardcoding those lists. |
| Hero enhancement | Preserve existing `hero-scenes.ts` and `public/hero-scenes/hiking-hydration.js`, article wiring, reduced-motion/save-data gates and poster fallback. No article copy was changed. Browser/WebGL/CDN visual behavior was not exercised. |
| Static cache headers | Do not copy original year-long immutable `/images/*` rule for mutable filenames. Astro build already generates immutable headers for fingerprinted `/_astro/*`. |
| Sitemap repair | Local Worker smoke exposed an upstream-main bug: core `ec_pages` has no `excerpt` column, so sitemap-pages failed and fell through to the 404 handler. `feed-entries.ts` now selects `NULL AS excerpt` for pages. Regression test uses a real SQLite pages schema without excerpt. Add authors/subscribe to page sitemap. |

## Verification commands and evidence

Automated suites are included in `npm test` (`node --test scripts/*.test.mjs`):

- Existing hosting-cost/cache privacy, freshness, invalidation callback and feed pagination tests.
- `scripts/reconciliation.test.mjs`: restoration contracts, private/nonredirecting 404, image-origin validation, native scheduler wiring, no unprovisioned CACHE, responsive/hero preservation.
- `scripts/listing-cards.test.mjs`: real SQLite metadata-only listing schema, no body column, status/deletion filters, tied-date ordering, byline, source image preservation, pagination and taxonomy filter.
- `scripts/img-transform.test.mjs`: parameter rejection before IO; R2 fallback MIME, native media tags and transform-binding contract (binding test double, not Cloudflare's production image service).
- `scripts/migrations.test.mjs`: actual installed EmDash migration executor against a disposable local SQLite file; full application, empty second apply, lock schema and plugin/options revision triggers. Temporary files are created beneath `.wrangler` and removed.
- Regression/restoration tests were run failing before fixes/ports, then green. The migration API harness initially exposed that executors are single-use; it now creates/disposes one per check/apply.

Production build and check:

```sh
npm install
npm ls astro @astrojs/cloudflare @astrojs/react emdash @emdash-cms/cloudflare wrangler --depth=0
npm test
npm run typecheck
npm run build
git diff --check
```

Local-only Worker smoke uses `wrangler.local.json`, with dummy resource IDs, all database/storage bindings explicitly local, no account ID and no remote Images binding:

```sh
CLOUDFLARE_API_TOKEN= CLOUDFLARE_ACCOUNT_ID= WRANGLER_SEND_METRICS=false \
  npx wrangler dev --config wrangler.local.json --local --port 4329 \
  --persist-to .wrangler/cleanup-local --test-scheduled
node scripts/smoke-local.mjs
node scripts/verify-local-scheduled.mjs
```

- Smoke script refuses non-loopback origins; checks **28** routes/statuses, redirects, 404 headers, all major public endpoints and rejected image requests. Read-back JSON: `.wrangler/local-smoke-results.json` (ignored disposable evidence).
- Scheduled test inserts named **local-only** due/future/deleted fixtures, invokes the real native scheduled handler, reads rows back, verifies only due content published and scheduled_at cleared, then verifies article, homepage, sitemap and RSS rendering. Fixtures are deleted in `finally`; evidence: `.wrangler/local-scheduled-results.json`.
- Local D1 initialized 76 registered migrations through `077_plugin_storage_revisions`, with default collection schema only (no demo article seeding command). Correct package names differ from task shorthand: **072 is media folders; 075 is entry edit locks; 076 collection nav group; 077 plugin storage revisions**. Do not plan a live migration by shorthand numbers alone.
- Fresh SQLite and D1 migration success is **not** proof of upgrading a full restored production 0.34 snapshot; no production database was copied or mutated here.

## Final execution results

- `npm test`: **18 passed, 0 failed** (including real disposable SQLite migration execution).
- `npm run typecheck`: **54 files, 0 errors, 0 warnings, 11 hints**.
- `npm run build`: **success**, final server build completed in 7.42 seconds; only large-chunk warning.
- `node scripts/smoke-local.mjs`: **28 route assertions passed** against the final built Worker.
- `node scripts/verify-local-scheduled.mjs`: **due published, future/deleted retained; 76 local migrations verified**; published fixture rendered in article/homepage/RSS/sitemap. Native purge callback still has the local-runtime blocker below.
- `git diff --check`: **clean**. Work is intentionally uncommitted.

## Known blockers / unverified deployment behavior

1. **Native edge-cache purge cannot be verified in this local runtime.** The real scheduled handler publishes correctly, but local workerd logs `TypeError: cache2.purge is not a function` from the Astro Cloudflare cache provider's `onPublished` callback. EmDash catches/logs this and completes publishing. Unit tests verify tags/callback behavior, not real CDN invalidation. Do not claim publish+edge invalidation is fully verified. This may be a local workerd API gap; production/staging availability is not established by this work. Resolve/test on an approved staging target before production rollout. Do not silently reinstate the obsolete untagged cache as a workaround.
2. The build reports an upstream large-chunk (>500 kB) warning. Astro check reports no errors/warnings but hint diagnostics for inline scripts and control-flow imports/functions it incorrectly considers unused in Astro return paths. Real local routes exercise those paths.
3. Local Wrangler's watcher can briefly observe a half-written `dist` during rebuild and exit with invalid manifest URL. Stop the local server before rebuilding and restart afterward; this was an observed verification harness issue, not a production deploy.
4. Real IMAGES transformations, production cache hit/purge behavior, full imported production schema/data, author account authentication, WebGL visuals and external plugin delivery remain untested. No credentials used and no production calls made here.
5. Production deployment requires separate approval, exact production migration inventory/backup/rollback planning, native cache feature verification, and reconciliation of deployment bindings/config with the parent's read-only production findings. No CACHE KV needs provisioning for this version of the code.

## Reusable lessons

- A newer remote branch is not deployment evidence; preserve valuable dirty original source and reconcile behavior before replacing it.
- Bind metadata-only feed projections to each collection's actual schema; pages need not have post excerpts.
- Real local cron tests must inspect logs as well as published rows: native invalidation callbacks can fail while the sweep reports success.
- Run local smoke against explicit dummy-ID, local-only bindings; stop the Worker before replacing its build output.
- Keep mutable image URLs purgeable at both browser and edge layers; never layer an immutable untagged transform cache over media replacement.

## Independent-review fixes (local follow-up)

- Removed the `/guides/best-basic-camping-chairs` self redirect. `scripts/redirects.test.mjs` walks the entire normalized redirect graph for self-loops and multi-hop cycles; it failed on the reported loop before removal and now passes.
- `src/utils/authors.ts` now uses EmDash 0.38's hydrated `avatarStorageKey`, not `avatarMediaId`, with the existing avatar fallback when the joined key is absent. Installed API declarations confirm single-row byline finders join media. Tests distinguish media IDs from nested storage keys and cover a populated author and orphaned/missing avatar data.
- `src/pages/authors/[slug].astro` queries both stories and guides using `byline.translationGroup ?? byline.id`, per the installed API's credit contract. Tests execute the actual frontmatter with CMS boundaries substituted; a localized ID different from its group failed before the fix. Both translated and legacy fallback identities now pass.
- `src/lib/img-transform.ts` uses `Object.hasOwn` for the format allowlist. `f=constructor` and `f=__proto__` now return 400 before storage IO. The regression first returned 200 before the fix.
- `scripts/verify-local-scheduled.mjs` now reports publication separately from native invalidation, writes `nativeInvalidation.status: "unverified"`, `deploymentReady: false`, and **exits 1** rather than claiming the deployment gate passed. `scripts/scheduled-validation.mjs` and its regression test encode this fail-closed distinction. Fixture deletion is read back.
- Added `scripts/verify-local-review.mjs`: inserts disposable local D1 media/byline/story/guide fixtures with distinct media ID/storage key and byline ID/translation group, exercises the built Worker and real EmDash hydration/query APIs, checks rendered author/avatar/story/guide links, inherited-format rejection and the unseeded canonical chair route's 404. Deletes fixtures and verifies zero remaining rows. Avatar object bytes are not seeded/fetched; this verifies hydrated URL rendering, not R2 delivery.

### Follow-up execution results (supersede earlier test count)

- `npm test`: **23 passed, 0 failed**.
- `npm run typecheck`: **54 files, 0 errors, 0 warnings, 11 hints**.
- `npm run build`: **success**; upstream large-chunk warning remains.
- `node scripts/smoke-local.mjs`: **28 route assertions passed**.
- `node scripts/verify-local-review.mjs`: **passed**, including real populated author and translated credits; cleanup read-back passed.
- `node scripts/probe-cache-runtime.mjs`: both imported and context `purge` are **undefined** at compatibility dates **2026-03-29 and 2026-09-18**. This is not explained by changing the application's compatibility date.
- `node scripts/verify-local-scheduled.mjs`: publication/read-back assertions and **76 migrations** passed; overall **exit 1, DEPLOYMENT BLOCKED**, as intended. Actual Worker logs again show `onPublished failed ... TypeError: cache2.purge is not a function`. The saved JSON explicitly rejects deployment readiness. No shim, legacy SQL scheduler, custom cache, or remote test was added.
- Local server stopped after verification. No commits, deployments, production calls, original-app edits or dependency-pin changes by this follow-up agent; parent's forms **0.2.6** / webhook notifier **0.2.0** pins retained.

Native invalidation remains a genuine deployment gate, not a passing local test or an assumed harmless warning. It needs separately approved runtime/provider resolution and an end-to-end warm-cache invalidation check before rollout.
