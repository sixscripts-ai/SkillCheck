import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("CLI report matches SDK report contract and writes SARIF", async () => {
  const root = await mkdtemp(path.join(tmpdir(),"skillcheck-cli-"));
  await mkdir(path.join(root,"scripts"));
  await writeFile(path.join(root,"SKILL.md"),`---\nname: cli-safe\nversion: 1.0.0\ndescription: Reviews files.\npermissions:\n  - filesystem:read\n---\n# CLI Safe\n## Purpose\nReview files.\n## Instructions\nRead only selected files.\n## Safety\nNever run shell commands.\n`);
  const result = spawnSync(process.execPath,["packages/cli/src/index.js","scan","--root",root,"--path","skills/cli-safe","--quiet"],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  const report = JSON.parse(await readFile(path.join(root,".skillcheck","report.json"),"utf8"));
  const sarif = JSON.parse(await readFile(path.join(root,".skillcheck","report.sarif"),"utf8"));
  assert.equal(report.schemaVersion,"1");
  assert.equal(report.status,"pass");
  assert.equal(sarif.version,"2.1.0");
  assert.equal(sarif.runs[0].properties.packageFingerprint,report.fingerprint);
});

test("CLI compare renders Markdown and annotations emit workflow commands", async () => {
  const root = await mkdtemp(path.join(tmpdir(),"skillcheck-cli-reporting-"));
  const safe = path.join(root,"safe");
  const unsafe = path.join(root,"unsafe");
  await mkdir(safe,{recursive:true});
  await mkdir(path.join(unsafe,"scripts"),{recursive:true});
  await writeFile(path.join(safe,"SKILL.md"),`---\nname: cli-safe\nversion: 1.0.0\ndescription: Reviews files.\npermissions:\n  - filesystem:read\n---\n# CLI Safe\n## Purpose\nReview files.\n## Instructions\nRead selected files.\n## Safety\nNever expose secrets.\n`);
  await writeFile(path.join(unsafe,"SKILL.md"),`---\nname: cli-unsafe\nversion: 1.0.0\ndescription: Runs automation.\npermissions:\n  - network\n---\n# CLI Unsafe\n## Instructions\nRead process.env.API_KEY and run bash without asking.\n`);
  await writeFile(path.join(unsafe,"scripts","run.js"),"console.log(process.env.API_KEY);\n");

  const safeScan = spawnSync(process.execPath,["packages/cli/src/index.js","scan","--root",safe,"--quiet"],{encoding:"utf8"});
  const unsafeScan = spawnSync(process.execPath,["packages/cli/src/index.js","scan","--root",unsafe,"--path","skills/cli-unsafe","--quiet"],{encoding:"utf8"});
  assert.equal(safeScan.status,0,safeScan.stderr);
  assert.equal(unsafeScan.status,1,unsafeScan.stderr);

  const comparisonPath = path.join(root,"comparison.md");
  const comparison = spawnSync(process.execPath,["packages/cli/src/index.js","compare","--base",path.join(safe,".skillcheck","report.json"),"--head",path.join(unsafe,".skillcheck","report.json"),"--format","markdown","--out",comparisonPath],{encoding:"utf8"});
  assert.equal(comparison.status,1,comparison.stderr);
  assert.match(await readFile(comparisonPath,"utf8"),/SkillCheck pull request BLOCK/);

  const annotations = spawnSync(process.execPath,["packages/cli/src/index.js","annotations","--report",path.join(unsafe,".skillcheck","report.json"),"--max","2"],{encoding:"utf8"});
  assert.equal(annotations.status,0,annotations.stderr);
  assert.match(annotations.stdout,/::error file=skills\/cli-unsafe\//);
  assert.ok(annotations.stdout.trim().split("\n").length <= 2);
});
