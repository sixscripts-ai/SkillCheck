import { scanPackage as scan } from "../../core/src/index.js";

export {
  CANONICAL_PERMISSIONS,
  DEFAULT_POLICY,
  EVIDENCE_SCHEMA_VERSION,
  REPORT_SCHEMA_VERSION,
  SCANNER_VERSION,
  assertEvidence,
  assertReport,
  compareReports,
  createReleaseEvidence,
  evaluateReleaseGate,
  fingerprintPackage,
  fingerprintPolicy,
  marketplacePermission,
  normalizePackageFiles,
  normalizePermission,
  normalizePermissions,
  normalizePolicy,
  parseFrontmatter,
  scanPackage,
  sha256,
  stableStringify,
} from "../../core/src/index.js";
export { filesFromZip } from "./zip.js";

export function scanSkillMarkdown(skillMd, options = {}) {
  return scan({
    files: [{path: options.path ?? "SKILL.md", content: skillMd}],
    policy: options.policy,
    context: options.context,
    generatedAt: options.generatedAt,
  });
}
