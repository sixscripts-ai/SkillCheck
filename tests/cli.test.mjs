import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("CLI report matches SDK report contract", async () => {
  const root = await mkdtemp(path.join(tmpdir(),"skillcheck-cli-"));
  await mkdir(path.join(root,"scripts"));
  await writeFile(path.join(root,"SKILL.md"),`---\nname: cli-safe\nversion: 1.0.0\ndescription: Reviews files.\npermissions:\n  - filesystem:read\n---\n# CLI Safe\n## Purpose\nReview files.\n## Instructions\nRead only selected files.\n## Safety\nNever run shell commands.\n`);
  const result = spawnSync(process.execPath,["packages/cli/src/index.js","scan","--root",root,"--quiet"],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  const report = JSON.parse(await readFile(path.join(root,".skillcheck","report.json"),"utf8"));
  assert.equal(report.schemaVersion,"1");
  assert.equal(report.status,"pass");
});
