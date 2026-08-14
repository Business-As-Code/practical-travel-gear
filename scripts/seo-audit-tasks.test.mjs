/**
 * Verifier for the SEO audit → task connector (PTG-16).
 *
 * Run: node --test scripts/seo-audit-tasks.test.mjs
 *
 * Proves: auditing a known page set produces exactly the expected tasks, and
 * re-running the audit (even after a task is marked done) creates no duplicates.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEntries, auditEntries, syncTasks, taskIdFor } from "./seo-audit-tasks.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(here, "fixtures", "seo-audit-fixture.json");

const EXPECTED_TASK_IDS = [
	"missing-description--pages--about",
	"missing-description--posts--packing-cubes-worth-it",
	"missing-description--guides--one-bag-travel",
].sort();

function tmpTasksDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "ptg16-tasks-"));
}

test("audit finds exactly the pages missing descriptions (drafts and described pages excluded)", () => {
	const entries = loadEntries(FIXTURE);
	// 5 published entries; the draft is excluded at load time.
	assert.equal(entries.length, 5);
	const findings = auditEntries(entries);
	assert.deepEqual(findings.map(taskIdFor).sort(), EXPECTED_TASK_IDS);
});

test("connector creates one task file per finding with expected frontmatter", () => {
	const dir = tmpTasksDir();
	const findings = auditEntries(loadEntries(FIXTURE));
	const { created, skipped } = syncTasks(findings, dir, { now: "2026-08-13T00:00:00.000Z" });

	assert.deepEqual(created.slice().sort(), EXPECTED_TASK_IDS);
	assert.equal(skipped.length, 0);
	assert.deepEqual(fs.readdirSync(dir).sort(), EXPECTED_TASK_IDS.map((id) => `${id}.md`));

	const about = fs.readFileSync(path.join(dir, "missing-description--pages--about.md"), "utf8");
	assert.match(about, /^---\n/);
	assert.match(about, /type: missing_description/);
	assert.match(about, /status: open/);
	assert.match(about, /url: \/about/);
	assert.match(about, /\*\*Done when:\*\*/);

	const guide = fs.readFileSync(path.join(dir, "missing-description--guides--one-bag-travel.md"), "utf8");
	assert.match(guide, /url: \/guides\/one-bag-travel/);
});

test("re-running the audit creates no duplicate tasks", () => {
	const dir = tmpTasksDir();
	const findings = auditEntries(loadEntries(FIXTURE));
	syncTasks(findings, dir);

	const second = syncTasks(auditEntries(loadEntries(FIXTURE)), dir);
	assert.equal(second.created.length, 0);
	assert.equal(second.skipped.length, EXPECTED_TASK_IDS.length);
	assert.equal(fs.readdirSync(dir).length, EXPECTED_TASK_IDS.length);
});

test("a task marked done is not recreated or reopened by the same finding", () => {
	const dir = tmpTasksDir();
	syncTasks(auditEntries(loadEntries(FIXTURE)), dir);

	const file = path.join(dir, "missing-description--pages--about.md");
	const done = fs.readFileSync(file, "utf8").replace("status: open", "status: done");
	fs.writeFileSync(file, done);

	syncTasks(auditEntries(loadEntries(FIXTURE)), dir);
	assert.match(fs.readFileSync(file, "utf8"), /status: done/);
	assert.equal(fs.readdirSync(dir).length, EXPECTED_TASK_IDS.length);
});

test("real page set: seed/seed.json produces expected tasks with no duplicates", () => {
	const seed = path.join(here, "..", "seed", "seed.json");
	const dir = "/private/tmp/ptg16-real-run";
	fs.rmSync(dir, { recursive: true, force: true });

	const findings = auditEntries(loadEntries(seed));
	const first = syncTasks(findings, dir, { now: "2026-08-13T00:00:00.000Z" });
	assert.ok(first.created.length >= 1, "expected at least one finding in the real page set");
	assert.ok(first.created.includes("missing-description--pages--about"));

	const second = syncTasks(auditEntries(loadEntries(seed)), dir);
	assert.equal(second.created.length, 0);
	assert.equal(fs.readdirSync(dir).length, first.created.length);
});

test("dry run reports findings but writes nothing", () => {
	const dir = tmpTasksDir();
	const { created } = syncTasks(auditEntries(loadEntries(FIXTURE)), dir, { dryRun: true });
	assert.equal(created.length, EXPECTED_TASK_IDS.length);
	assert.equal(fs.readdirSync(dir).length, 0);
});
