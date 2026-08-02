# SkillCheck standalone product roadmap

SkillCheck is an independent release-safety product for AI agent skill packages. Its core promise is simple: inspect the exact package that will ship, explain what it can do, and block release when the package or its evidence does not satisfy policy.

## Product principles

- Keep anonymous local scanning available without an account.
- Keep the SDK, CLI, browser, and GitHub Action on one deterministic engine.
- Treat package, policy, and evidence fingerprints as release-critical data.
- Fail closed when reports are stale, evidence is missing, or policy changes.
- Explain every decision with concrete files, lines, permissions, and remediation.
- Never require Agent Skill Marketplace for SkillCheck to be useful.

## Now: standalone foundation

- Validate the npm package from clean consumer projects.
- Exercise the composite GitHub Action as a consumer would use it.
- Pin public setup examples to immutable release tags.
- Improve npm and repository metadata.
- Strengthen report clarity, failure states, and remediation guidance.
- Add scan-to-scan and pull-request risk comparisons.
- Add SARIF output for code-scanning integrations.

## Next: persistent product

- Optional authentication and saved projects.
- Scan history and approved baselines.
- Custom organization policies.
- Private GitHub repository connections.
- Scheduled rescans and evidence-expiration alerts.
- Pull-request summaries, annotations, and merge recommendations.
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

Promote `1.0.0-rc.1` to `1.0.0` only after all of the following are true:

1. The npm package installs and runs in a clean external project.
2. The GitHub Action passes a safe package and blocks an unsafe package.
3. Browser scanning is verified at desktop and mobile widths.
4. Package and policy fingerprints remain deterministic across environments.
5. Stale report and stale evidence rejection are verified.
6. At least one real standalone repository uses SkillCheck successfully.
