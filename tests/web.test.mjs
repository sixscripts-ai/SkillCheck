import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

test("web build contains the SDK-backed scanner and refined release UX", async () => {
  execFileSync(process.execPath, ["scripts/build-web.mjs"], { stdio: "inherit" });
  for (const file of [
    "dist-web/index.html",
    "dist-web/app.js",
    "dist-web/styles.css",
    "dist-web/base.css",
    "dist-web/theme-refresh.css",
    "dist-web/packages/core/src/scanner.js",
    "dist-web/packages/sdk/src/index.js",
  ]) await access(file);

  execFileSync(process.execPath, ["--check", "dist-web/app.js"], { stdio: "inherit" });

  const [html, app, styleEntry, baseCss, themeCss] = await Promise.all([
    readFile("dist-web/index.html", "utf8"),
    readFile("dist-web/app.js", "utf8"),
    readFile("dist-web/styles.css", "utf8"),
    readFile("dist-web/base.css", "utf8"),
    readFile("dist-web/theme-refresh.css", "utf8"),
  ]);

  assert.match(html, /Ship agent skills/);
  assert.match(html, /Scan a package/);
  assert.match(html, /Static release decision/);
  assert.match(html, /Evidence chain/);
  assert.match(html, /CI Setup/);
  assert.doesNotMatch(html, /Explore Skills|Popular Categories|Marketplace Home/i);

  assert.match(app, /scanPackage/);
  assert.match(app, /filesFromZip/);
  assert.match(app, /scanGitHubRepository/);
  assert.match(app, /skillcheck:v1:report-history/);
  assert.doesNotMatch(app, /fetch\([^)]*api/i);

  assert.match(styleEntry, /base\.css/);
  assert.match(styleEntry, /theme-refresh\.css/);
  assert.match(baseCss, /prefers-reduced-motion/);
  assert.match(themeCss, /--red:\s*#ff4655/i);
  assert.match(themeCss, /Avenir Next/);
  assert.match(themeCss, /body\s*\{[^}]*font-size:\s*15px/is);
  assert.match(themeCss, /linear-gradient/);
});
