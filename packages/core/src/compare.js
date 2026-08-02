export function compareReports(base, head) {
  const baseByKey = new Map(base.findings.map((finding) => [key(finding), finding]));
  const headByKey = new Map(head.findings.map((finding) => [key(finding), finding]));
  const newFindings = head.findings.filter((finding) => !baseByKey.has(key(finding)));
  const resolvedFindings = base.findings.filter((finding) => !headByKey.has(key(finding)));
  const unchangedFindings = head.findings.filter((finding) => baseByKey.has(key(finding)));
  const addedPermissions = head.inferredPermissions.filter((permission) => !base.inferredPermissions.includes(permission));
  const removedPermissions = base.inferredPermissions.filter((permission) => !head.inferredPermissions.includes(permission));
  const blocked = head.status === "block" || newFindings.some((finding) => finding.severity === "error") || addedPermissions.length > 0;
  return {
    schemaVersion: "1",
    baseFingerprint: base.fingerprint,
    headFingerprint: head.fingerprint,
    baseScore: base.score,
    headScore: head.score,
    scoreDelta: head.score - base.score,
    baseStatus: base.status,
    headStatus: head.status,
    newFindings,
    resolvedFindings,
    unchangedFindings,
    addedPermissions,
    removedPermissions,
    permissionExpanded: addedPermissions.length > 0,
    recommendation: blocked ? "block" : newFindings.length || head.score < base.score || head.status === "review" ? "review" : "approve",
  };
}

function key(finding) {
  return `${finding.id}|${finding.severity}|${finding.permission ?? ""}`;
}
