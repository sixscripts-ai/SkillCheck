export function compareReports(base, head) {
  const baseKeys = new Set(base.findings.map(key));
  const headKeys = new Set(head.findings.map(key));
  const newFindings = head.findings.filter((finding) => !baseKeys.has(key(finding)));
  const resolvedFindings = base.findings.filter((finding) => !headKeys.has(key(finding)));
  const addedPermissions = head.inferredPermissions.filter((permission) => !base.inferredPermissions.includes(permission));
  const removedPermissions = base.inferredPermissions.filter((permission) => !head.inferredPermissions.includes(permission));
  const blocked = head.status === "block" || newFindings.some((finding) => finding.severity === "error") || addedPermissions.length > 0;
  return {
    schemaVersion: "1",
    baseFingerprint: base.fingerprint,
    headFingerprint: head.fingerprint,
    scoreDelta: head.score - base.score,
    newFindings,
    resolvedFindings,
    addedPermissions,
    removedPermissions,
    recommendation: blocked ? "block" : newFindings.length || head.score < base.score ? "review" : "approve",
  };
}
function key(finding) { return `${finding.id}|${finding.severity}|${finding.permission ?? ""}`; }
