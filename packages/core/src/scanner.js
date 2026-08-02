import { REPORT_SCHEMA_VERSION, SCANNER_VERSION } from "./constants.js";
import { parseFrontmatter, sectionNames } from "./frontmatter.js";
import { fingerprintPackage, findSkillFile, normalizePackageFiles } from "./package.js";
import { fingerprintPolicy, normalizePolicy } from "./policy.js";
import { normalizePermissions } from "./permissions.js";
import { inspectPackageStructure, inspectText } from "./rules.js";
import { groupFindings, reportStatus, scoreFindings } from "./report.js";

export function scanPackage(input) {
  const files = normalizePackageFiles(input?.files ?? []);
  if (!files.length) throw new Error("scanPackage requires at least one file.");
  const policy = normalizePolicy(input?.policy ?? {});
  const packageFingerprint = fingerprintPackage(files);
  const skillFile = findSkillFile(files);
  const occurrences = inspectPackageStructure(files);
  let declaredPermissions = [];
  let metadata = {};

  if (!skillFile) {
    occurrences.push(finding("contract.missing-skill","error",null,"Package does not contain SKILL.md.","Add a root SKILL.md file with frontmatter and required sections.",files[0].path,1,"SKILL.md not found"));
  } else {
    const parsed = parseFrontmatter(skillFile.content);
    metadata = parsed.data;
    declaredPermissions = normalizePermissions(parsed.data.permissions ?? []);
    parsed.errors.forEach((error) => occurrences.push(finding("contract.frontmatter","error",null,error,"Add valid YAML frontmatter at the start of SKILL.md.",skillFile.path,1,error)));
    if (!metadata.name) occurrences.push(finding("contract.name","error",null,"Frontmatter name is required.","Add a stable lowercase skill name.",skillFile.path,1,"name missing"));
    if (!metadata.description) occurrences.push(finding("contract.description","error",null,"Frontmatter description is required.","Describe when the skill should be used and what it produces.",skillFile.path,1,"description missing"));
    if (!metadata.version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(metadata.version))) occurrences.push(finding("contract.version","error",null,"A semantic version is required.","Set version to a semantic value such as 1.0.0.",skillFile.path,1,String(metadata.version ?? "version missing")));
    const sections = sectionNames(skillFile.content).map((section) => section.toLowerCase());
    for (const section of policy.requiredSections) {
      if (!sections.includes(section.toLowerCase())) occurrences.push(finding(`contract.section.${slug(section)}`,"warning",null,`Required section is missing: ${section}.`,`Add a ## ${section} section with concrete operating constraints.`,skillFile.path,1,section));
    }
  }

  for (const file of files) if (file.content && file.kind !== "binary") occurrences.push(...inspectText(file));
  const inferredPermissions = normalizePermissions(occurrences.map((item) => item.permission).filter(Boolean));
  const findings = groupFindings(occurrences, declaredPermissions, policy);
  const score = scoreFindings(findings);
  const status = reportStatus(score, findings, policy);
  const packageRisks = findings.filter((finding) => finding.id.startsWith("package.") || finding.id.startsWith("risk."));
  const remediation = [...new Set(findings.map((finding) => finding.remediation))];
  const reasons = [];
  if (status === "block") reasons.push("One or more blocking findings remain.");
  if (score < policy.minimumScore) reasons.push(`Score ${score} is below the required ${policy.minimumScore}.`);

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    scannerVersion: SCANNER_VERSION,
    policyVersion: policy.version,
    policyFingerprint: fingerprintPolicy(policy),
    fingerprint: packageFingerprint,
    generatedAt: input?.generatedAt ?? new Date().toISOString(),
    subject: {
      repository: input?.context?.repository ?? null,
      ref: input?.context?.ref ?? null,
      path: input?.context?.path ?? ".",
      skillName: metadata.name ?? null,
      version: metadata.version ?? null,
      fileCount: files.length,
      totalBytes: files.reduce((sum,file) => sum + file.size, 0),
    },
    score,
    status,
    declaredPermissions,
    inferredPermissions,
    findings,
    packageRisks,
    remediation,
    gate: {
      publishable: status === "pass" && score >= policy.minimumScore,
      reasons,
    },
  };
}

function finding(ruleId,severity,permission,message,remediation,file,line,evidence) { return {ruleId,severity,permission,message,remediation,file,line,evidence}; }
function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
