import { EVIDENCE_SCHEMA_VERSION, SCANNER_VERSION } from "./constants.js";
import { assertReport, signEvidence } from "./report.js";

export function createReleaseEvidence(input) {
  const report = assertReport(input.report);
  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    scannerVersion: SCANNER_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
    fingerprint: report.fingerprint,
    policyFingerprint: report.policyFingerprint,
    report: {
      score: report.score,
      status: report.status,
      findingCount: report.findings.length,
      blockingCount: report.findings.filter((finding) => finding.severity === "error").length,
    },
    evaluations: normalizeEvaluations(input.evaluations ?? []),
    sandbox: input.sandbox ? {
      id: String(input.sandbox.id ?? ""),
      status: input.sandbox.status === "pass" ? "pass" : "fail",
      completedAt: String(input.sandbox.completedAt ?? input.createdAt ?? new Date().toISOString()),
      provider: input.sandbox.provider ? String(input.sandbox.provider) : null,
    } : null,
    source: input.source ?? null,
    integrity: "",
  };
  evidence.integrity = signEvidence(evidence);
  return evidence;
}

function normalizeEvaluations(values) {
  return values.map((value) => ({
    suite: String(value.suite ?? "default"),
    score: Number(value.score ?? 0),
    passed: Number(value.passed ?? 0),
    failed: Number(value.failed ?? 0),
    completedAt: String(value.completedAt ?? new Date().toISOString()),
    reference: value.reference ? String(value.reference) : null,
  }));
}
