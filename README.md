# SkillCheck CI

**Make your AI agent prove it works.**

SkillCheck is dependency-free CI for portable AI agent skills. It scans `SKILL.md` files, validates their contracts, infers undeclared capabilities, blocks dangerous instructions, compares approved baselines, and generates JSON, Markdown, and standalone HTML evidence.

## Checks

- Required frontmatter and semantic versions
- Declared versus inferred permissions
- Shell, network, filesystem-write, Git-write, and secret access
- Destructive commands and human-approval bypasses
- Required Purpose, Instructions, and Safety sections
- Score regression, new errors, and permission expansion

## Run locally

```bash
node skillcheck.mjs scan --root . --config skillcheck.config.json
node skillcheck.mjs baseline --root . --out .skillcheck-baseline.json
node skillcheck.mjs dashboard --report .skillcheck/report.html
```

The scanner writes `.skillcheck/report.json`, `report.md`, and `report.html`.

## GitHub Actions

```yaml
name: Agent reliability
on: [pull_request]
permissions:
  contents: read
jobs:
  skillcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: sixscripts-ai/SkillCheck@main
        with:
          path: .
          config: skillcheck.config.json
          baseline: .skillcheck-baseline.json
```

## Permission vocabulary

`filesystem:read`, `filesystem:write`, `network`, `shell`, `git:write`, `secrets:read`, and `browser`.

## Product path

This is the repeatable software layer behind a SixScripts Agent Reliability Sprint. A sprint configures policies and realistic evaluations for a customer; SkillCheck keeps those controls active on every future code change.

## Development

```bash
npm test
npm run check
```

Node.js 20 or newer. MIT licensed.
