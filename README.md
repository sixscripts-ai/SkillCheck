# SkillCheck CI v0.3

**CI governance for AI agent skills.**

SkillCheck validates `SKILL.md` contracts, scans surrounding executable files, maps declared and inferred permissions, compares approved baselines, and blocks newly introduced pull-request risk.

## Release contents

The v0.3 branch stores the verified release source as eight small encoded parts plus a dependency-free Node bootstrap. Every Vercel build, CLI launch, and composite Action run:

1. Reconstructs the release archive.
2. Verifies SHA-256 `117f5c1d75629fa385986ee7402017a35773560e7959ce8a89f0d2aecc2acd50`.
3. Rejects absolute paths, traversal paths, NUL bytes, and unsupported tar entries.
4. Expands the exact source that passed the release gate.

Run `npm run bootstrap` to inspect the complete source tree locally.

## v0.3 capabilities

- One universal engine for the browser, CLI, and GitHub Action
- Single-file, folder, multi-file, ZIP, local repository, and public GitHub repository scanning
- Instruction and executable-code capability analysis
- Declared-versus-inferred permissions with occurrence-level evidence
- Scoped baselines bound to repository, package path, scanner version, policy version, and configuration fingerprint
- Pull-request reports showing new and resolved risk, permission changes, score delta, and merge recommendation
- Deterministic remediation guidance and click-to-line evidence
- JSON, Markdown, and standalone HTML evidence exports
- Browser-generated GitHub Actions workflow and policy configuration

## Browser

Vercel runs the verified bootstrap and publishes a static app. Local files remain in the browser. Public GitHub mode reads public GitHub API and raw-content endpoints.

## CLI

```bash
npm run bootstrap
node skillcheck.mjs scan --root . --config skillcheck.config.json
node skillcheck.mjs baseline --root . --out .skillcheck-baseline.json
node skillcheck.mjs pr --root . --base-ref origin/main
node skillcheck.mjs github --url https://github.com/owner/repo
```

## GitHub Action

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: sixscripts-ai/SkillCheck@main
  with:
    path: .
    config: skillcheck.config.json
    baseline: .skillcheck-baseline.json
    mode: auto
```

## Security boundary

SkillCheck performs static analysis. It does not execute inspected packages, prove runtime behavior, replace sandboxing, or eliminate human review.

## Validation

The verified release passed 19 Node release-gate tests covering browser/CLI parity, package scanning, malformed frontmatter, negated instructions, duplicate grouping, scoped baselines, pull-request deltas, exports, ZIP traversal, ZIP size limits, and static deployment output.
