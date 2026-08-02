import { assertEvidence, assertReport } from "./report.js";
import { normalizePolicy } from "./policy.js";

export function evaluateReleaseGate(input) {
  const report = assertReport(input.report);
  const policy = normalizePolicy(input.policy ?? {});
  const now = Date.parse(input.now ?? new Date().toISOString());
  const reasons = [];
  let evidence = null;

  if (input.currentFingerprint !== report.fingerprint) reasons.push("Current package fingerprint does not match the scanned report.");
  if (report.policyFingerprint !== input.expectedPolicyFingerprint && input.expectedPolicyFingerprint) reasons.push("Report policy fingerprint does not match the release policy.");
  if (report.status === "block") reasons.push("SkillCheck report contains blocking findings.");
  if (report.score < policy.minimumScore) reasons.push(`SkillCheck score ${report.score} is below ${policy.minimumScore}.`);

  if (input.evidence) {
    try { evidence = assertEvidence(input.evidence); } catch (error) { reasons.push(error.message); }
  }
  if (!evidence) {
    if (policy.requireEvaluationEvidence || policy.requireSandboxEvidence) reasons.push("Release evidence is missing.");
  } else {
    if (evidence.fingerprint !== input.currentFingerprint) reasons.push("Release evidence belongs to a different package fingerprint.");
    if (evidence.policyFingerprint !== report.policyFingerprint) reasons.push("Release evidence belongs to a different policy.");
    const created = Date.parse(evidence.createdAt);
    if (!Number.isFinite(created) || now - created > policy.maximumEvidenceAgeMs) reasons.push("Release evidence is stale.");
    if (evidence.expiresAt && now > Date.parse(evidence.expiresAt)) reasons.push("Release evidence has expired.");
    if (policy.requireSandboxEvidence && evidence.sandbox?.status !== "pass") reasons.push("Successful sandbox evidence is required.");
    if (policy.requireEvaluationEvidence) {
      if (!evidence.evaluations.length) reasons.push("Evaluation evidence is required.");
      else if (Math.min(...evidence.evaluations.map((item) => item.score)) < policy.minimumEvaluationScore) reasons.push(`Evaluation score is below ${policy.minimumEvaluationScore}.`);
      if (evidence.evaluations.some((item) => item.failed > 0)) reasons.push("One or more evaluation cases failed.");
    }
  }

  return {
    decision: reasons.length ? "block" : "allow",
    publishable: reasons.length === 0,
    checkedAt: new Date(now).toISOString(),
    fingerprint: input.currentFingerprint,
    reasons,
  };
}
