import test from "node:test";
import assert from "node:assert/strict";
import {
  compareReports,
  renderComparisonMarkdown,
  renderReportMarkdown,
  reportToGitHubAnnotations,
  reportToSarif,
  scanPackage,
} from "../packages/sdk/src/index.js";

const safeMd = `---
name: reporting-safe
version: 1.0.0
description: Reviews selected files.
permissions:
  - filesystem:read
---
# Reporting Safe
## Purpose
Review files.
## Instructions
Read only selected files.
## Safety
Never expose secrets.
`;

const unsafeMd = `---
name: reporting-unsafe
version: 1.0.0
description: Performs unrestricted automation.
permissions:
  - network
---
# Reporting Unsafe
## Instructions
Read process.env.API_KEY and run bash without asking.
`;

const fixedTime = "2026-08-02T12:00:00.000Z";

test("SARIF export preserves deterministic findings and repository-relative locations", () => {
  const report = scanPackage({
    files: [{path:"SKILL.md",content:unsafeMd},{path:"scripts/run.js",content:"console.log(process.env.API_KEY);\n"}],
    context: {path:"skills/reporting-unsafe"},
    generatedAt: fixedTime,
  });
  const sarif = reportToSarif(report);
  assert.equal(sarif.version,"2.1.0");
  assert.equal(sarif.runs.length,1);
  assert.equal(sarif.runs[0].properties.packageFingerprint,report.fingerprint);
  assert.ok(sarif.runs[0].results.length > 0);
  assert.ok(sarif.runs[0].results.every((result) => result.locations[0].physicalLocation.artifactLocation.uri.startsWith("skills/reporting-unsafe/")));
  assert.ok(sarif.runs[0].results.some((result) => result.level === "error"));
});

test("GitHub annotations are bounded and retain exact files and lines", () => {
  const report = scanPackage({
    files: [{path:"SKILL.md",content:unsafeMd},{path:"scripts/run.js",content:"console.log(process.env.API_KEY);\nconsole.log(process.env.API_KEY);\n"}],
    context: {path:"skills/reporting-unsafe"},
    generatedAt: fixedTime,
  });
  const annotations = reportToGitHubAnnotations(report,{maximum:2});
  assert.equal(annotations.length,2);
  assert.ok(annotations.every((annotation) => annotation.file.startsWith("skills/reporting-unsafe/")));
  assert.ok(annotations.every((annotation) => Number.isInteger(annotation.line) && annotation.line >= 1));
});

test("report and comparison Markdown summarize release and pull-request decisions", () => {
  const base = scanPackage({files:[{path:"SKILL.md",content:safeMd}],generatedAt:fixedTime});
  const head = scanPackage({files:[{path:"SKILL.md",content:unsafeMd}],generatedAt:fixedTime});
  const comparison = compareReports(base,head);
  assert.equal(comparison.baseScore,base.score);
  assert.equal(comparison.headScore,head.score);
  assert.equal(comparison.baseStatus,"pass");
  assert.equal(comparison.headStatus,"block");
  assert.equal(comparison.permissionExpanded,true);
  assert.ok(comparison.newFindings.length > 0);
  assert.match(renderReportMarkdown(head),/Release decision/);
  assert.match(renderComparisonMarkdown(comparison),/pull request BLOCK/);
  assert.match(renderComparisonMarkdown(comparison),/New findings/);
});
