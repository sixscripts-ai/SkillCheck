# SkillCheck v1

SkillCheck is a deterministic SDK, CLI, GitHub Action, and browser scanner for portable AI agent skill packages. It produces fingerprint-bound evidence that a publishing system can store and verify before releasing the exact package that was scanned and tested.

SkillCheck is being developed as a standalone product. Agent Skill Marketplace may integrate with it later, but SkillCheck does not depend on a marketplace, hosted runtime, or agent builder to be useful.

## Quick start

Install the current release candidate:

```bash
npm install @sixscripts-ai/skillcheck@next
```

Scan a local package:

```bash
npx skillcheck scan --root ./my-skill
```

Every scan writes a report bundle to `.skillcheck/`:

- `report.json` for applications and release gates
- `report.md` for humans and workflow summaries
- `report.sarif` for code-scanning systems

Import the SDK:

```js
import { scanPackage, reportToSarif } from "@sixscripts-ai/skillcheck";
```

See [ROADMAP.md](./ROADMAP.md) for the standalone product plan.

## Public API

```js
import {
  scanPackage,
  fingerprintPackage,
  createReleaseEvidence,
  evaluateReleaseGate,
  compareReports,
  renderComparisonMarkdown,
  renderReportMarkdown,
  reportToGitHubAnnotations,
  reportToSarif,
} from "@sixscripts-ai/skillcheck";

const files = [
  { path: "SKILL.md", content: skillMarkdown },
  { path: "scripts/run.js", content: sourceCode },
];

const report = scanPackage({ files, policy });
const sarif = reportToSarif(report);
const evidence = createReleaseEvidence({
  report,
  evaluations: [{ suite: "quality", score: 100, passed: 8, failed: 0 }],
  sandbox: { id: "run_123", status: "pass", completedAt: new Date().toISOString() },
});

const gate = evaluateReleaseGate({
  report,
  evidence,
  policy,
  currentFingerprint: fingerprintPackage(files),
});
```

## Canonical permission vocabulary

- `filesystem:read`
- `filesystem:write`
- `network`
- `shell`
- `browser`
- `git:write`
- `secrets:read`

Legacy Marketplace values such as `read_files`, `write_files`, and `api_keys` are normalized by the SDK.

## What v1 owns

- Package parsing and normalized file inventory from files, folders, ZIP archives, and public GitHub repositories
- Deterministic SHA-256 package fingerprints
- Policy fingerprints
- Contract and semantic-version checks
- Declared versus inferred permissions
- Instruction, script, manifest, workflow, environment-file, symlink, and install-hook inspection
- Grouped findings with every file and line occurrence
- Deterministic remediation
- JSON, Markdown, and SARIF reports from one report model
- GitHub annotations with exact repository-relative files and lines
- Stable report and evidence schemas
- Integrity-checked evaluation and sandbox evidence
- Exact-draft release decisions
- Base-versus-head risk comparisons
- CLI, GitHub Action, and browser parity

## CLI

```bash
skillcheck scan --root ./my-skill --config skillcheck.config.json
skillcheck scan --zip ./my-skill.zip
skillcheck github --url https://github.com/owner/repository
skillcheck baseline --root ./my-skill
skillcheck compare --base base.json --head head.json
skillcheck compare --base base.json --head head.json --format markdown --out comparison.md
skillcheck annotations --report .skillcheck/report.json --max 50
skillcheck gate --root ./my-skill --report .skillcheck/report.json --evidence evidence.json
```

The comparison output includes score and status transitions, new findings, resolved findings, unchanged findings, added permissions, removed permissions, and a merge recommendation.

For repository development, the same CLI is available at `node packages/cli/src/index.js`.

## GitHub Action

Pin the Action to an immutable release tag:

```yaml
- uses: actions/checkout@v4
- id: skillcheck
  continue-on-error: true
  uses: sixscripts-ai/SkillCheck@v1.0.0-rc.1
  with:
    path: ./skills/my-skill
    config: skillcheck.config.json
    mode: scan
    annotations: "true"
    annotation-limit: "50"

- name: Use SkillCheck outputs
  if: always()
  run: |
    echo "status=${{ steps.skillcheck.outputs.status }}"
    echo "score=${{ steps.skillcheck.outputs.score }}"
    echo "fingerprint=${{ steps.skillcheck.outputs.fingerprint }}"
    echo "sarif=${{ steps.skillcheck.outputs.sarif }}"
```

The Action exposes the generated JSON and SARIF report paths, status, score, package fingerprint, policy fingerprint, and publishability decision. These outputs and annotations are written before a blocked scan exits, so later diagnostic steps can still inspect the report when used with `continue-on-error`.

Repositories using GitHub code scanning can upload the generated SARIF in a later step:

```yaml
permissions:
  contents: read
  security-events: write

- name: Upload SkillCheck SARIF
  if: always() && steps.skillcheck.outputs.sarif != ''
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: ${{ steps.skillcheck.outputs.sarif }}
```

## Browser and repository adapters

The browser uses the same SDK and can scan pasted Markdown, selected files, folders, ZIP archives, or a public GitHub repository URL. Local files remain in the browser. GitHub scanning uses the public GitHub API and supports an optional token in SDK and CLI integrations.

## Integration boundary

Any publishing system should convert its current draft into package files, call `scanPackage`, store the report and fingerprint, attach evaluation and sandbox evidence, and call `evaluateReleaseGate` immediately before public publishing. Scanner rules belong in SkillCheck rather than being duplicated by an integrating product.

## Security boundary

SkillCheck performs static analysis. It does not execute inspected packages, prove runtime behavior, guarantee that code is safe, or replace sandboxing and human review.

## Development

```bash
npm ci --ignore-scripts
npm test
npm run build:web
npm run check
npm run test:package
npm run release:verify
```

`npm run test:package` packs SkillCheck, installs it into a clean temporary consumer project, imports the public SDK, and runs the installed CLI. The release workflow is documented in [RELEASE.md](./RELEASE.md).

Node.js 20 or newer. MIT licensed.
