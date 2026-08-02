# SkillCheck release process

This checklist is the release gate for `@sixscripts/skillcheck` and the `sixscripts-ai/SkillCheck` GitHub Action.

## 1. Verify the release candidate

Run from a clean checkout:

```bash
npm ci --ignore-scripts
npm run release:verify
```

The release verification must pass on Node.js 20 and 22. It covers unit tests, fixtures, CLI behavior, the static web build, and installation into a clean external consumer project.

Review the Vercel preview manually at desktop and mobile widths. Exercise package upload, folder upload, pasted Markdown, public GitHub scanning, report filters, JSON download, report history, policy copy, and CI workflow copy.

## 2. Confirm release metadata

The following versions must agree:

- Root `package.json`
- `package-lock.json`
- `packages/core/package.json`
- `packages/sdk/package.json`
- `packages/cli/package.json`
- `packages/core/src/constants.js`
- Browser version label

Confirm that report and evidence schema versions are intentionally unchanged or have migration notes.

## 3. Merge the release pull request

The pull request must be mergeable and have passing release-gate, web-smoke, and Vercel checks. Merge into `main` only after manual preview review.

## 4. Tag the release candidate

```bash
git checkout main
git pull --ff-only
git tag -a v1.0.0-rc.1 -m "SkillCheck v1.0.0-rc.1"
git push origin v1.0.0-rc.1
```

## 5. Publish the npm release candidate

Authenticate with the npm account that owns the `@sixscripts` scope, then run:

```bash
npm publish --access public --tag next
```

Verify from a directory outside the repository:

```bash
mkdir skillcheck-release-verification
cd skillcheck-release-verification
npm init -y
npm install @sixscripts/skillcheck@next
node -e "import('@sixscripts/skillcheck').then(m => console.log(m.SCANNER_VERSION))"
npx skillcheck help
```

## 6. Verify the GitHub Action externally

Use the tag from a separate repository:

```yaml
- uses: actions/checkout@v4
- uses: sixscripts-ai/SkillCheck@v1.0.0-rc.1
  with:
    path: .
    config: skillcheck.config.json
    mode: scan
```

Confirm that the safe fixture passes, the unsafe fixture blocks, and the report is added to the workflow summary.

## 7. Promote to v1.0.0

After the release candidate has been used successfully from npm, the CLI, the browser, the GitHub Action, and Agent Skill Marketplace:

1. Change all release versions to `1.0.0`.
2. Run `npm run release:verify` on Node.js 20 and 22.
3. Merge the promotion pull request.
4. Tag `v1.0.0`.
5. Run `npm publish --access public --tag latest`.
6. Move the floating `v1` GitHub tag to the final release commit.

Do not publish a release if package fingerprints, policy fingerprints, evidence integrity, stale-evidence rejection, or clean consumer installation tests fail.
