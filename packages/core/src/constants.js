export const SCANNER_VERSION = "1.0.0-rc.1";
export const REPORT_SCHEMA_VERSION = "1";
export const EVIDENCE_SCHEMA_VERSION = "1";

export const CANONICAL_PERMISSIONS = Object.freeze([
  "filesystem:read",
  "filesystem:write",
  "network",
  "shell",
  "browser",
  "git:write",
  "secrets:read",
]);

export const PERMISSION_ALIASES = Object.freeze({
  read_files: "filesystem:read",
  "filesystem:read": "filesystem:read",
  write_files: "filesystem:write",
  "filesystem:write": "filesystem:write",
  network: "network",
  shell: "shell",
  browser: "browser",
  git_write: "git:write",
  "git:write": "git:write",
  api_keys: "secrets:read",
  secrets: "secrets:read",
  "secrets:read": "secrets:read",
});

export const DEFAULT_POLICY = Object.freeze({
  id: "skillcheck-default-v1",
  version: "1.0.0",
  minimumScore: 80,
  blockOn: ["error"],
  requireDeclaredPermissions: true,
  allowPermissions: [...CANONICAL_PERMISSIONS],
  requiredSections: ["Purpose", "Instructions", "Safety"],
  maximumEvidenceAgeMs: 24 * 60 * 60 * 1000,
  requireEvaluationEvidence: true,
  requireSandboxEvidence: true,
  minimumEvaluationScore: 80,
});

export const SEVERITY_WEIGHT = Object.freeze({
  info: 0,
  warning: 8,
  error: 22,
});
