import { spawnSync } from "node:child_process";
import process from "node:process";
const result = spawnSync(process.execPath,["packages/cli/src/index.js","scan","--root","fixtures/unsafe","--quiet"],{stdio:"inherit"});
if (result.status === 0) throw new Error("Unsafe fixture was not blocked.");
console.log("Unsafe fixture correctly blocked.");
