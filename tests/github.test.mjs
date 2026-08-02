import test from "node:test";
import assert from "node:assert/strict";
import { filesFromGitHub, parseGitHubRepositoryUrl, scanGitHubRepository } from "../packages/sdk/src/index.js";

const skill = `---\nname: github-safe\nversion: 1.0.0\ndescription: Reviews files.\npermissions:\n  - filesystem:read\n---\n# GitHub Safe\n## Purpose\nReview files.\n## Instructions\nRead selected files.\n## Safety\nNever run shell commands.\n`;

function mockFetch(url) {
  if (url.endsWith('/repos/acme/demo')) return response({default_branch:'main'});
  if (url.includes('/git/trees/main')) return response({truncated:false,tree:[{type:'blob',path:'SKILL.md',sha:'abc',size:skill.length}]});
  if (url.endsWith('/git/blobs/abc')) return response({encoding:'base64',content:Buffer.from(skill).toString('base64')});
  return response({},404);
}
function response(body,status=200) { return {ok:status>=200&&status<300,status,json:async()=>body}; }

test('parses public GitHub repository URLs', () => {
  assert.deepEqual(parseGitHubRepositoryUrl('https://github.com/acme/demo/tree/main/skills/test'),{owner:'acme',repo:'demo',ref:'main',packagePath:'skills/test'});
});

test('loads and scans a GitHub repository through an injected fetch', async () => {
  const files = await filesFromGitHub('https://github.com/acme/demo',{fetch:mockFetch});
  assert.equal(files[0].path,'SKILL.md');
  const report = await scanGitHubRepository('https://github.com/acme/demo',{fetch:mockFetch,generatedAt:'2026-08-01T12:00:00.000Z'});
  assert.equal(report.status,'pass');
  assert.equal(report.subject.repository,'acme/demo');
});
