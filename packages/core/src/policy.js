import { DEFAULT_POLICY } from "./constants.js";
import { normalizePermissions } from "./permissions.js";
import { sha256, stableStringify } from "./hash.js";

export function normalizePolicy(input = {}) {
  const policy = {
    ...DEFAULT_POLICY,
    ...input,
    blockOn: Array.isArray(input.blockOn) ? [...new Set(input.blockOn)] : [...DEFAULT_POLICY.blockOn],
    allowPermissions: normalizePermissions(input.allowPermissions ?? DEFAULT_POLICY.allowPermissions),
    requiredSections: Array.isArray(input.requiredSections) ? [...new Set(input.requiredSections.map(String))] : [...DEFAULT_POLICY.requiredSections],
  };
  if (!Number.isFinite(policy.minimumScore) || policy.minimumScore < 0 || policy.minimumScore > 100) throw new Error("minimumScore must be between 0 and 100.");
  if (!Number.isFinite(policy.maximumEvidenceAgeMs) || policy.maximumEvidenceAgeMs < 0) throw new Error("maximumEvidenceAgeMs must be non-negative.");
  return policy;
}

export function fingerprintPolicy(policy) {
  return `sha256:${sha256(stableStringify(normalizePolicy(policy)))}`;
}
