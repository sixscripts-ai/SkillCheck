import test from "node:test";
import assert from "node:assert/strict";
import { filesFromZip } from "../packages/sdk/src/index.js";

function storedZip(name, content) {
  const encoder = new TextEncoder();
  const n = encoder.encode(name);
  const c = encoder.encode(content);
  const local = new Uint8Array(30 + n.length + c.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true); lv.setUint16(8,0,true);
  lv.setUint32(18,c.length,true); lv.setUint32(22,c.length,true); lv.setUint16(26,n.length,true);
  local.set(n,30); local.set(c,30+n.length);
  const central = new Uint8Array(46+n.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true);
  cv.setUint32(20,c.length,true); cv.setUint32(24,c.length,true); cv.setUint16(28,n.length,true); cv.setUint32(42,0,true);
  central.set(n,46);
  const eocd = new Uint8Array(22); const ev = new DataView(eocd.buffer);
  ev.setUint32(0,0x06054b50,true); ev.setUint16(8,1,true); ev.setUint16(10,1,true);
  ev.setUint32(12,central.length,true); ev.setUint32(16,local.length,true);
  const zip = new Uint8Array(local.length+central.length+eocd.length); zip.set(local); zip.set(central,local.length); zip.set(eocd,local.length+central.length);
  return zip;
}

test("reads a stored ZIP package", async () => {
  const files = await filesFromZip(storedZip("SKILL.md","---\nname: zip\n---\n"));
  assert.equal(files[0].path,"SKILL.md");
  assert.match(files[0].content,/name: zip/);
});

test("rejects ZIP traversal paths", async () => {
  await assert.rejects(() => filesFromZip(storedZip("../SKILL.md","bad")),/Unsafe ZIP path/);
});
