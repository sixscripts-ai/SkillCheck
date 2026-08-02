import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

test("web build contains the SDK-backed true-red release console", async () => {
  execFileSync(process.execPath, ["scripts/build-web.mjs"], { stdio: "inherit" });
  for (const file of [
    "dist-web/index.html",
    "dist-web/app.js",
    "dist-web/styles.css",
    "dist-web/packages/core/src/scanner.js",
    "dist-web/packages/sdk/src/index.js",
  ]) await access(file);

  execFileSync(process.execPath, ["--check", "dist-web/app.js"], { stdio: "inherit" });

  const [html, app, css] = await Promise.all([
    readFile("dist-web/index.html", "utf8"),
    readFile("dist-web/app.js", "utf8"),
    readFile("dist-web/styles.css", "utf8"),
  ]);

  assert.match(html, /Know what your agent can do/);
  assert.match(html, /Choose the package you plan to release/);
  assert.match(html, /Static release decision/);
  assert.match(html, /Exact package fingerprint/);
  assert.match(html, /CI setup/i);
  assert.doesNotMatch(html, /shield-stage|Marketplace Home|Explore Skills|Popular Categories/i);

  assert.match(app, /scanPackage/);
  assert.match(app, /filesFromZip/);
  assert.match(app, /scanGitHubRepository/);
  assert.match(app, /skillcheck:v1:report-history/);
  assert.doesNotMatch(app, /fetch\([^)]*api/i);

  assert.match(css, /--red:\s*#ff0000/i);
  assert.match(css, /font-size:\s*16px/);
  assert.match(css, /Avenir Next/);
  assert.match(css, /prefers-reduced-motion/);
});
