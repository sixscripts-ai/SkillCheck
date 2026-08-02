import { EVIDENCE_SCHEMA_VERSION, REPORT_SCHEMA_VERSION, SCANNER_VERSION, SEVERITY_WEIGHT } from "./constants.js";
import { sha256, stableStringify } from "./hash.js";

export function groupFindings(occurrences, declaredPermissions, policy) {
  const groups = new Map();
  for (const occurrence of occurrences) {
    const undeclared = occurrence.permission && !declaredPermissions.includes(occurrence.permission);
    let severity = occurrence.severity;
    let message = occurrence.message;
    if (undeclared && policy.requireDeclaredPermissions) {
      severity = severity === "error" ? "error" : "warning";
      message = `${message} Permission is not declared.`;
    }
    if (occurrence.permission && !policy.allowPermissions.includes(occurrence.permission)) severity = "error";
    const key = `${occurrence.ruleId}|${severity}|${occurrence.permission ?? ""}`;
    const group = groups.get(key) ?? {
      id: occurrence.ruleId,
      severity,
      permission: occurrence.permission,
      title: message,
      remediation: occurrence.remediation,
      declared: occurrence.permission ? declaredPermissions.includes(occurrence.permission) : null,
      occurrences: [],
    };
    group.occurrences.push({file:occurrence.file,line:occurrence.line,evidence:occurrence.evidence});
    groups.set(key, group);
  }
  return [...groups.values()].sort((a,b) => severityRank(b.severity)-severityRank(a.severity) || a.id.localeCompare(b.id));
}

export function scoreFindings(findings) {
  const penalty = findings.reduce((sum,finding) => sum + SEVERITY_WEIGHT[finding.severity] + Math.min(6, finding.occurrences.length - 1), 0);
  return Math.max(0, 100 - penalty);
}

export function reportStatus(score, findings, policy) {
  if (findings.some((finding) => policy.blockOn.includes(finding.severity))) return "block";
  if (score < policy.minimumScore || findings.some((finding) => finding.severity === "warning")) return "review";
  return "pass";
}

export function assertReport(report) {
  const required = ["schemaVersion","scannerVersion","policyVersion","policyFingerprint","fingerprint","generatedAt","score","status","declaredPermissions","inferredPermissions","findings","packageRisks","remediation","gate"];
  for (const key of required) if (!(key in report)) throw new Error(`Invalid SkillCheck report: missing ${key}.`);
  if (report.schemaVersion !== REPORT_SCHEMA_VERSION) throw new Error(`Unsupported report schema: ${report.schemaVersion}.`);
  return report;
}

export function signEvidence(evidence) {
  const unsigned = {...evidence};
  delete unsigned.integrity;
  return `sha256:${sha256(stableStringify(unsigned))}`;
}

export function assertEvidence(evidence) {
  if (evidence.schemaVersion !== EVIDENCE_SCHEMA_VERSION) throw new Error(`Unsupported evidence schema: ${evidence.schemaVersion}.`);
  if (evidence.integrity !== signEvidence(evidence)) throw new Error("Evidence integrity check failed.");
  return evidence;
}

function severityRank(severity) { return severity === "error" ? 3 : severity === "warning" ? 2 : 1; }
export { REPORT_SCHEMA_VERSION, SCANNER_VERSION };
