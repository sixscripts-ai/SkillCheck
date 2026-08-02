import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

test("web build contains the SDK-backed scanner", async () => {
  execFileSync(process.execPath,["scripts/build-web.mjs"],{stdio:"inherit"});
  for (const file of ["dist-web/index.html","dist-web/app.js","dist-web/styles.css","dist-web/packages/core/src/scanner.js","dist-web/packages/sdk/src/index.js"]) await access(file);
  const app = await readFile("dist-web/app.js","utf8");
  assert.match(app,/scanPackage/);
  assert.doesNotMatch(app,/fetch\([^)]*api/i);
});
