# PTG-16: SEO Audit → Content Task Connector

Linear: https://linear.app/scale-lean/issue/PTG-16/auto-create-practical-travel-gear-content-tasks-from-seo-audit

## Problem

The search-health audit (formerly `plugin-seo-toolkit`, removed in `9a42cc7`)
scored content and listed issues on a dashboard, but nothing turned a finding
into a trackable unit of work. Findings were viewed and forgotten. This design
adds the missing connector: audit finding → durable, deduplicated task.

## What this is (and is not)

**Is:** a design plus a working local prototype. A Node script audits a page
set and materializes one task file per finding into a file-based task store in
this repo. Re-runs are idempotent.

**Is not:** a production integration. No Linear/Asana/GitHub API calls, no
webhooks, no auto-published content, no deploys. Hard boundary from the issue.

## Components

| Piece | Path |
|---|---|
| Audit + connector CLI | `scripts/seo-audit-tasks.mjs` |
| Task store | `tasks/content/*.md` (one file per task) |
| Test page set | `scripts/fixtures/seo-audit-fixture.json` |
| Verifier | `scripts/seo-audit-tasks.test.mjs` (`npm run audit:tasks:test`) |

## Content source

The prototype audits a **seed-format JSON file** (`content.pages[]`,
`content.posts[]`, `content.guides[]`), defaulting to `seed/seed.json` — the
repo's schema/content source of truth — with `--source` to point at any
fixture. Only `status: "published"` entries are audited (missing status counts
as published, matching seed semantics).

Auditing the live D1 database or the running EmDash instance is deliberately
out of scope for the prototype; the audit/connector split means a future
D1-backed loader only replaces `loadEntries()`.

## Task store choice

The repo has no existing task tracker, so per the issue boundary we use the
smallest local durable store that fits: **one markdown file per task** under
`tasks/content/`, with YAML frontmatter (`id`, `type`, `collection`, `slug`,
`url`, `status`, `created`, `source`). Rationale:

- Durable and reviewable in git; a task's lifecycle is visible in history.
- Human-editable status (`open` → `done`) with no tooling.
- The deterministic filename doubles as the dedupe key.
- Trivially migratable later: each file maps 1:1 to a Linear issue if/when a
  real integration is approved.

## Dedupe / idempotency

Task id = `<finding-type>--<collection>--<slug>` (also the filename). The
connector skips any finding whose task file already exists — **including tasks
marked done**. A completed task is not reopened by the same finding type on the
same page; if a regression should re-create work, delete the file (or a future
`--reopen` flag can flip `done` → `open`). This makes repeated audit runs safe
on any schedule.

## Finding types: in scope vs out of scope

Check inventory from the removed plugin's audit (see
`2026-04-14-seo-toolkit-plugin-design.md`):

| Check | Status | Why |
|---|---|---|
| Missing meta description | **In scope (implemented)** | Highest-value, unambiguous fix, cleanly one-task-per-page. Same detection logic as the old audit: no `seo.description` and no `excerpt`. |
| Short / long meta title | Out (next candidate) | Same one-task-per-page shape; add after the connector pattern is validated. |
| Thin content (<300 words) | Out (next candidate) | One-task-per-page, but "fix" is editorial judgment; needs a better task template. |
| Missing featured image | Out | Low severity; batch-fix candidate rather than per-page tasks. |
| Missing image alt text | Out | Finding is per-image, not per-page; needs a different task granularity. |
| Duplicate meta titles | Out | Finding spans two pages; one-task-per-page dedupe model doesn't fit yet. |
| Broken internal links | Out | Already covered by `scripts/check-links.mjs`; merging is a separate decision. |
| Noindex / missing canonical | Out | Informational; usually intentional, would generate noise tasks. |

Adding an in-scope type = one entry in the `CHECKS` registry in
`scripts/seo-audit-tasks.mjs` (detector + task title + done-when criteria).

## Verifier

`npm run audit:tasks:test` runs the fixture page set (6 entries: missing
description, whitespace-only excerpt, described page, excerpted post, draft,
guide) and asserts:

1. Exactly the 3 expected tasks are created (draft and described pages excluded).
2. A second run creates zero new tasks.
3. A task marked `done` is neither recreated nor reopened.
4. `--dry-run` writes nothing.

`npm run audit:tasks` runs the real connector against `seed/seed.json`.

## Future path (not built)

Swap `loadEntries()` for a D1/EmDash API loader; swap the file store for a
Linear adapter keyed on the same task id (stored as a label or in the issue
body for dedupe); schedule via the existing weekly audit cron. Each is an
independent, decision-gated step.
