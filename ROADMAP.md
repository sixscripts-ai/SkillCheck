# SkillCheck standalone product roadmap

SkillCheck is an independent release-safety product for AI agent skill packages. Its core promise is simple: inspect the exact package that will ship, explain what it can do, and block release when the package or its evidence does not satisfy policy.

## Product principles

- Keep anonymous local scanning available without an account.
- Keep the SDK, CLI, browser, and GitHub Action on one deterministic engine.
- Treat package, policy, and evidence fingerprints as release-critical data.
- Fail closed when reports are stale, evidence is missing, or policy changes.
- Explain every decision with concrete files, lines, permissions, and remediation.
- Never require Agent Skill Marketplace for SkillCheck to be useful.

## Completed foundation

- Validate the npm package from clean consumer projects.
- Exercise the composite GitHub Action as a consumer would use it.
- Pin public setup examples to immutable release tags.
- Improve npm and repository metadata.
- Generate JSON, Markdown, and SARIF from one deterministic report.
- Emit bounded pull-request annotations with exact repository-relative locations.
- Compare base and head reports with score, status, finding, and permission changes.

## Now: report and pull-request experience

- Improve finding explanations and remediation guidance.
- Add downloadable comparison reports in the browser.
- Add first-class base-versus-head scanning to the GitHub Action.
- Add a stable pull-request summary contract for other integrations.
- Test SARIF upload against an unrelated consumer repository.
- Validate annotations and merge recommendations on real pull requests.

## Next: persistent product

- Optional authentication and saved projects.
- Scan history and approved baselines.
- Custom organization policies.
- Private GitHub repository connections.
- Scheduled rescans and evidence-expiration alerts.
- Team audit logs and evidence retention.

## Later: guided remediation and commercial features

- AI-assisted explanations and visible patch proposals.
- Evaluation-case recommendations.
- Organization dashboards and role-based access.
- Slack and email notifications.
- Compliance exports and approval workflows.
- Pro and Team plans while retaining a useful free scanner.

## Non-goals for the current release cycle

- Building a second scanner inside another product.
- Hosting or executing third-party agent packages.
- Silently changing user files or suppressing deterministic findings.
- Expanding into a full skill marketplace before the standalone workflow is proven.

## Stable v1 promotion gate

Promote the release candidate to `1.0.0` only after all of the following are true:

1. The npm package installs and runs in a clean external project.
2. The GitHub Action passes a safe package and blocks an unsafe package.
3. Browser scanning is verified at desktop and mobile widths.
4. Package and policy fingerprints remain deterministic across environments.
5. Stale report and stale evidence rejection are verified.
6. SARIF upload and exact-line annotations work in an unrelated repository.
7. At least one real standalone repository uses SkillCheck successfully.
