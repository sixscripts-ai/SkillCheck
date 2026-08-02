import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skillcheck-consumer-"));
let tarballPath = null;

try {
  const packed = run(npm, ["pack", "--json", "--ignore-scripts"], root);
  const details = JSON.parse(packed.stdout);
  assert.equal(details.length, 1, "Expected npm pack to produce one root package.");
  tarballPath = path.join(root, details[0].filename);

  await writeFile(path.join(temporaryRoot, "package.json"), JSON.stringify({
    name: "skillcheck-consumer-verification",
    private: true,
    type: "module",
  }, null, 2));

  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath], temporaryRoot);

  const fixtureRoot = path.join(temporaryRoot, "fixture");
  await mkdir(fixtureRoot, { recursive: true });
  const skillMarkdown = `---
name: packaged-consumer
version: 1.0.0
description: Reads supplied incident evidence and produces a cited summary.
permissions:
  - filesystem:read
---

# Packaged Consumer

## Purpose
Review files supplied by the user.

## Instructions
Read only the selected evidence and cite each conclusion.

## Safety
Do not execute commands, access secrets, or modify repositories.
`;
  await writeFile(path.join(fixtureRoot, "SKILL.md"), skillMarkdown);

  const verificationFile = path.join(temporaryRoot, "verify.mjs");
  await writeFile(verificationFile, `
import assert from "node:assert/strict";
import {
  fingerprintPackage,
  normalizePermissions,
  renderReportMarkdown,
  reportToGitHubAnnotations,
  reportToSarif,
  scanPackage,
} from "@sixscripts-ai/skillcheck";

const files = [{ path: "SKILL.md", content: ${JSON.stringify(skillMarkdown)} }];
const report = scanPackage({ files, generatedAt: "2026-01-01T00:00:00.000Z" });
const sarif = reportToSarif(report);
assert.equal(report.subject.skillName, "packaged-consumer");
assert.equal(report.fingerprint, fingerprintPackage(files));
assert.deepEqual(normalizePermissions(["read_files", "api_keys"]), ["filesystem:read", "secrets:read"]);
assert.equal(report.schemaVersion, "1");
assert.equal(sarif.version, "2.1.0");
assert.deepEqual(reportToGitHubAnnotations(report), []);
assert.match(renderReportMarkdown(report), /Release decision/);
console.log("Installed SDK verified:", report.status, report.score);
`);
  run(process.execPath, [verificationFile], temporaryRoot);

  const bin = path.join(temporaryRoot, "node_modules", ".bin", process.platform === "win32" ? "skillcheck.cmd" : "skillcheck");
  run(bin, ["scan", "--root", fixtureRoot, "--quiet"], temporaryRoot);
  const report = JSON.parse(await readFile(path.join(fixtureRoot, ".skillcheck", "report.json"), "utf8"));
  const sarif = JSON.parse(await readFile(path.join(fixtureRoot, ".skillcheck", "report.sarif"), "utf8"));
  assert.equal(report.subject.skillName, "packaged-consumer");
  assert.equal(sarif.version, "2.1.0");

  console.log("Clean npm consumer verification passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
  if (tarballPath) await rm(tarballPath, { force: true });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_update_notifier: "false" },
  });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(" ")} failed with exit code ${result.status}.`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }
  return result;
}
