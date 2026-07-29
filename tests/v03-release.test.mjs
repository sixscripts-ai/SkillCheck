import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("v0.3 release candidate is deployable", async () => {
  const [html, app, css] = await Promise.all([
    read("../web/v03/index.html"),
    read("../web/v03/app.js"),
    read("../web/v03/styles.css"),
  ]);
  assert.match(html, /SkillCheck v0\.3 RC/);
  assert.match(html, /Static SKILL\.md analysis only/);
  assert.match(app, /schemaVersion:2/);
  assert.match(app, /baseline\.scope-mismatch/);
  assert.match(app, /occurrences/);
  assert.match(app, /setSelectionRange\(0,0\)/);
  assert.match(css, /@media\(max-width:700px\)/);
});
