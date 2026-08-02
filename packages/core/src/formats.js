const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
const INFORMATION_URI = "https://github.com/sixscripts-ai/SkillCheck";

export function reportToSarif(report, options = {}) {
  assertReportShape(report);
  const informationUri = options.informationUri ?? INFORMATION_URI;
  const uriBaseId = options.uriBaseId ?? "%SRCROOT%";
  const pathPrefix = normalizePathPrefix(options.pathPrefix ?? report.subject?.path);
  const rules = [];
  const seenRuleIds = new Set();
  const results = [];

  for (const finding of report.findings) {
    if (!seenRuleIds.has(finding.id)) {
      seenRuleIds.add(finding.id);
      rules.push({
        id: finding.id,
        name: finding.id.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
        shortDescription: { text: finding.title },
        fullDescription: { text: finding.remediation },
        help: { text: finding.remediation },
        defaultConfiguration: { level: sarifLevel(finding.severity) },
        properties: compactObject({
          permission: finding.permission,
          severity: finding.severity,
        }),
      });
    }

    for (const occurrence of finding.occurrences) {
      results.push({
        ruleId: finding.id,
        level: sarifLevel(finding.severity),
        message: { text: finding.title },
        locations: [{
          physicalLocation: {
            artifactLocation: {
              uri: joinArtifactPath(pathPrefix, occurrence.file),
              uriBaseId,
            },
            region: { startLine: Math.max(1, Number(occurrence.line) || 1) },
          },
        }],
        properties: compactObject({
          evidence: occurrence.evidence,
          remediation: finding.remediation,
          permission: finding.permission,
          declared: finding.declared,
          fingerprint: report.fingerprint,
          policyFingerprint: report.policyFingerprint,
        }),
      });
    }
  }

  return {
    version: "2.1.0",
    $schema: SARIF_SCHEMA,
    runs: [{
      tool: {
        driver: {
          name: "SkillCheck",
          version: report.scannerVersion,
          informationUri,
          rules,
        },
      },
      automationDetails: { id: `skillcheck/${report.fingerprint}` },
      invocations: [{
        executionSuccessful: true,
        properties: {
          status: report.status,
          score: report.score,
          publishable: Boolean(report.gate?.publishable),
        },
      }],
      results,
      properties: {
        schemaVersion: report.schemaVersion,
        policyVersion: report.policyVersion,
        policyFingerprint: report.policyFingerprint,
        packageFingerprint: report.fingerprint,
        generatedAt: report.generatedAt,
      },
    }],
  };
}

export function reportToGitHubAnnotations(report, options = {}) {
  assertReportShape(report);
  const maximum = normalizeMaximum(options.maximum ?? options.maxAnnotations ?? 50);
  const pathPrefix = normalizePathPrefix(options.pathPrefix ?? report.subject?.path);
  const annotations = [];
  for (const finding of report.findings) {
    for (const occurrence of finding.occurrences) {
      annotations.push({
        level: githubLevel(finding.severity),
        file: joinArtifactPath(pathPrefix, occurrence.file),
        line: Math.max(1, Number(occurrence.line) || 1),
        title: `SkillCheck ${finding.id}`,
        message: `${finding.title} ${finding.remediation}`.trim(),
        evidence: occurrence.evidence,
        ruleId: finding.id,
      });
      if (annotations.length >= maximum) return annotations;
    }
  }
  return annotations;
}

export function renderReportMarkdown(report) {
  assertReportShape(report);
  const counts = severityCounts(report.findings);
  const lines = [
    `# SkillCheck ${report.status.toUpperCase()}`,
    "",
    "## Release decision",
    "",
    `- Publishable: **${report.gate?.publishable ? "yes" : "no"}**`,
    `- Score: **${report.score}/100**`,
    `- Findings: **${report.findings.length}** (${counts.error} error, ${counts.warning} warning, ${counts.info} info)`,
    `- Package fingerprint: \`${report.fingerprint}\``,
    `- Policy fingerprint: \`${report.policyFingerprint}\``,
    "",
    "## Permissions",
    "",
    `- Declared: ${inlineList(report.declaredPermissions)}`,
    `- Inferred: ${inlineList(report.inferredPermissions)}`,
    "",
  ];

  if (report.gate?.reasons?.length) {
    lines.push("## Gate reasons", "", ...report.gate.reasons.map((reason) => `- ${reason}`), "");
  }

  if (!report.findings.length) {
    lines.push("## Findings", "", "No findings.", "");
  } else {
    lines.push("## Findings", "");
    for (const finding of report.findings) {
      lines.push(
        `### ${finding.severity.toUpperCase()} · \`${finding.id}\``,
        "",
        finding.title,
        "",
        `Remediation: ${finding.remediation}`,
        "",
        ...finding.occurrences.map((item) => `- \`${item.file}:${item.line}\` — ${item.evidence}`),
        "",
      );
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderComparisonMarkdown(comparison) {
  assertComparisonShape(comparison);
  const delta = signedNumber(comparison.scoreDelta);
  const lines = [
    `# SkillCheck pull request ${comparison.recommendation.toUpperCase()}`,
    "",
    "## Change summary",
    "",
    `- Score: **${comparison.baseScore}/100 → ${comparison.headScore}/100** (${delta})`,
    `- Status: **${comparison.baseStatus} → ${comparison.headStatus}**`,
    `- New findings: **${comparison.newFindings.length}**`,
    `- Resolved findings: **${comparison.resolvedFindings.length}**`,
    `- Unchanged findings: **${comparison.unchangedFindings.length}**`,
    `- Added permissions: ${inlineList(comparison.addedPermissions)}`,
    `- Removed permissions: ${inlineList(comparison.removedPermissions)}`,
    `- Base fingerprint: \`${comparison.baseFingerprint}\``,
    `- Head fingerprint: \`${comparison.headFingerprint}\``,
    "",
  ];

  appendFindingSection(lines, "New findings", comparison.newFindings);
  appendFindingSection(lines, "Resolved findings", comparison.resolvedFindings);
  return `${lines.join("\n").trimEnd()}\n`;
}

function appendFindingSection(lines, heading, findings) {
  lines.push(`## ${heading}`, "");
  if (!findings.length) {
    lines.push("None.", "");
    return;
  }
  for (const finding of findings) {
    lines.push(`- **${finding.severity.toUpperCase()}** \`${finding.id}\`: ${finding.title}`);
  }
  lines.push("");
}

function assertReportShape(report) {
  if (!report || typeof report !== "object" || !Array.isArray(report.findings)) {
    throw new Error("Invalid SkillCheck report.");
  }
}

function assertComparisonShape(comparison) {
  const requiredArrays = ["newFindings", "resolvedFindings", "unchangedFindings", "addedPermissions", "removedPermissions"];
  if (!comparison || typeof comparison !== "object" || requiredArrays.some((key) => !Array.isArray(comparison[key]))) {
    throw new Error("Invalid SkillCheck comparison.");
  }
}

function severityCounts(findings) {
  return findings.reduce((counts, finding) => {
    if (finding.severity in counts) counts[finding.severity] += 1;
    return counts;
  }, { error: 0, warning: 0, info: 0 });
}

function sarifLevel(severity) {
  return severity === "error" ? "error" : severity === "warning" ? "warning" : "note";
}

function githubLevel(severity) {
  return severity === "error" ? "error" : severity === "warning" ? "warning" : "notice";
}

function normalizeArtifactUri(value) {
  return String(value ?? "SKILL.md").replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function normalizePathPrefix(value) {
  const normalized = normalizeArtifactUri(value ?? ".");
  if (!normalized || normalized === ".") return "";
  const segments = normalized.split("/").filter((segment) => segment && segment !== ".");
  if (segments.includes("..")) return "";
  return segments.join("/");
}

function joinArtifactPath(prefix, file) {
  const normalizedFile = normalizeArtifactUri(file);
  return prefix ? `${prefix}/${normalizedFile}` : normalizedFile;
}

function normalizeMaximum(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 50;
  return Math.min(parsed, 1000);
}

function inlineList(values) {
  return values?.length ? values.map((value) => `\`${value}\``).join(", ") : "none";
}

function signedNumber(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${number}` : String(number);
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
}
