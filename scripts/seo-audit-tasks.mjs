#!/usr/bin/env node
/**
 * SEO audit → content task connector (PTG-16).
 *
 * Runs a search-health audit over a seed-format content file and turns each
 * finding into a durable task file under tasks/content/. One task per page per
 * finding type, deduplicated by deterministic task id, so re-running the audit
 * never creates duplicates.
 *
 * Local prototype only: reads a JSON page set (seed/seed.json by default or a
 * fixture), writes markdown task files. No network, no production systems.
 *
 * Usage:
 *   node scripts/seo-audit-tasks.mjs [--source <path>] [--tasks-dir <path>] [--dry-run] [--json]
 *
 * Scope (see docs/superpowers/specs/2026-08-13-ptg-16-audit-task-connector-design.md):
 *   In scope:  missing_description — page has no SEO meta description and no excerpt.
 *   Out of scope for now: short/long titles, missing images, alt text, thin
 *   content, duplicate titles, broken links, noindex, canonical.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// Route shape mirrors src/pages: posts and pages serve at /:slug, guides at /guides/:slug.
const COLLECTION_URL_PREFIX = { posts: "", pages: "", guides: "guides/" };

/**
 * Check registry. Each check receives a normalized entry and returns a finding
 * detail string, or null when the entry passes. Adding a finding type to the
 * connector means adding one entry here.
 */
export const CHECKS = {
	missing_description: {
		severity: "warning",
		taskTitle: (entry) => `Write a meta description for "${entry.title}"`,
		run(entry) {
			const description = entry.seo?.description || entry.data?.excerpt || "";
			if (description.trim() === "") {
				return "No SEO meta description and no excerpt. Search engines will improvise a snippet.";
			}
			return null;
		},
		doneWhen:
			"The entry has either an SEO meta description (~120-160 chars, includes the primary keyword) or an excerpt, saved and published in the EmDash admin.",
	},
};

export function loadEntries(sourcePath) {
	const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
	const content = raw.content ?? {};
	const entries = [];
	for (const [collection, list] of Object.entries(content)) {
		if (!Array.isArray(list)) continue;
		for (const item of list) {
			// Missing status is treated as published (matches emdash seed behavior).
			if (item.status && item.status !== "published") continue;
			entries.push({
				collection,
				slug: item.slug ?? item.id,
				title: item.data?.title ?? item.slug ?? item.id,
				data: item.data ?? {},
				seo: item.seo ?? item.data?.seo ?? null,
			});
		}
	}
	return entries;
}

export function auditEntries(entries) {
	const findings = [];
	for (const entry of entries) {
		for (const [type, check] of Object.entries(CHECKS)) {
			const detail = check.run(entry);
			if (detail !== null) {
				findings.push({ type, severity: check.severity, entry, detail });
			}
		}
	}
	return findings;
}

export function taskIdFor(finding) {
	const slugSafe = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
	return `${slugSafe(finding.type)}--${slugSafe(finding.entry.collection)}--${slugSafe(finding.entry.slug)}`;
}

export function entryUrl(entry) {
	const prefix = COLLECTION_URL_PREFIX[entry.collection] ?? `${entry.collection}/`;
	return `/${prefix}${entry.slug}`;
}

function renderTask(finding, id, now) {
	const check = CHECKS[finding.type];
	return `---
id: ${id}
type: ${finding.type}
severity: ${finding.severity}
collection: ${finding.entry.collection}
slug: ${finding.entry.slug}
url: ${entryUrl(finding.entry)}
status: open
created: ${now}
source: seo-audit
---

# ${check.taskTitle(finding.entry)}

${finding.detail}

- Page: [${finding.entry.title}](${entryUrl(finding.entry)})
- Edit in admin: \`/_emdash/admin\` → ${finding.entry.collection} → ${finding.entry.slug}

**Done when:** ${check.doneWhen}
`;
}

/**
 * The connector: writes one task file per finding, skipping any finding whose
 * task file already exists (open or done — a completed task is not reopened by
 * the same finding; delete the file to allow re-creation).
 */
export function syncTasks(findings, tasksDir, { dryRun = false, now = new Date().toISOString() } = {}) {
	if (!dryRun) fs.mkdirSync(tasksDir, { recursive: true });
	const created = [];
	const skipped = [];
	for (const finding of findings) {
		const id = taskIdFor(finding);
		const file = path.join(tasksDir, `${id}.md`);
		if (fs.existsSync(file)) {
			skipped.push(id);
			continue;
		}
		if (!dryRun) fs.writeFileSync(file, renderTask(finding, id, now));
		created.push(id);
	}
	return { created, skipped };
}

function parseArgs(argv) {
	const args = { source: "seed/seed.json", tasksDir: "tasks/content", dryRun: false, json: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--source") args.source = argv[++i];
		else if (a === "--tasks-dir") args.tasksDir = argv[++i];
		else if (a === "--dry-run") args.dryRun = true;
		else if (a === "--json") args.json = true;
		else {
			console.error(`Unknown argument: ${a}`);
			process.exit(2);
		}
	}
	return args;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
	const args = parseArgs(process.argv.slice(2));
	const entries = loadEntries(args.source);
	const findings = auditEntries(entries);
	const { created, skipped } = syncTasks(findings, args.tasksDir, { dryRun: args.dryRun });

	if (args.json) {
		console.log(JSON.stringify({ scanned: entries.length, findings: findings.length, created, skipped }, null, 2));
	} else {
		console.log(`Scanned ${entries.length} published entries from ${args.source}`);
		console.log(`Findings: ${findings.length}`);
		for (const id of created) console.log(`  ${args.dryRun ? "would create" : "created"}  ${id}`);
		for (const id of skipped) console.log(`  exists (skipped)  ${id}`);
		console.log(
			args.dryRun
				? "Dry run — no files written."
				: `Tasks dir: ${args.tasksDir} (${created.length} new, ${skipped.length} already tracked)`,
		);
	}
}
