# SkillCheck v1

SkillCheck is a deterministic SDK, CLI, GitHub Action, and browser scanner for portable AI agent skill packages. It produces fingerprint-bound evidence that a publishing system can store and verify before releasing the exact package that was scanned and tested.

## Stable public API

```js
import {
  scanPackage,
  fingerprintPackage,
  createReleaseEvidence,
  evaluateReleaseGate,
} from "@sixscripts-ai/skillcheck";

const files = [
  { path: "SKILL.md", content: skillMarkdown },
  { path: "scripts/run.js", content: sourceCode },
];

const report = scanPackage({ files, policy });
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
skillcheck gate --root ./my-skill --report .skillcheck/report.json --evidence evidence.json
```

For repository development, the same CLI is available at `node packages/cli/src/index.js`.

## GitHub Action

```yaml
- uses: actions/checkout@v4
- uses: sixscripts-ai/SkillCheck@main
  with:
    path: ./skills/my-skill
    config: skillcheck.config.json
    mode: scan
```

## Browser and repository adapters

The browser uses the same SDK and can scan pasted Markdown, selected files, folders, ZIP archives, or a public GitHub repository URL. Local files remain in the browser. GitHub scanning uses the public GitHub API and supports an optional token in SDK and CLI integrations.

## Marketplace integration boundary

Agent Skill Marketplace should convert the current Builder draft into package files, call `scanPackage`, store the report and fingerprint, attach evaluation and sandbox evidence, and call `evaluateReleaseGate` immediately before public publishing. Scanner rules do not belong in Marketplace.

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
