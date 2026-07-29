import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { scanSkill, makeBaseline } from "../web/scanner.js";

const safe = await readFile(new URL("../examples/safe/SKILL.md", import.meta.url), "utf8");
const unsafe = await readFile(new URL("../examples/unsafe/SKILL.md", import.meta.url), "utf8");

test("browser scanner approves the safe fixture", async () => {
  const report = await scanSkill(safe);
  assert.equal(report.status, "pass");
  assert.equal(report.skill.score, 100);
  assert.equal(report.summary.errors, 0);
});

test("browser scanner blocks the unsafe fixture", async () => {
  const report = await scanSkill(unsafe);
  assert.equal(report.status, "fail");
  assert.ok(report.summary.errors >= 1);
  assert.ok(report.skill.findings.some((finding) => finding.id === "security.approval-bypass"));
});

test("browser scanner detects permission expansion", async () => {
  const approved = await scanSkill(safe);
  const baseline = makeBaseline(approved);
  const changed = safe.replace("permissions: []", "permissions: [network]");
  const report = await scanSkill(changed, { baseline });
  assert.equal(report.status, "fail");
  assert.ok(report.regressionFindings.some((finding) => finding.id === "regression.permission-expansion"));
});
