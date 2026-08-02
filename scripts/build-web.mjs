import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "dist-web");
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "packages", "core", "src"), { recursive: true });
await mkdir(path.join(out, "packages", "sdk", "src"), { recursive: true });
await cp(path.join(root, "apps", "web"), out, { recursive: true });
await cp(path.join(root, "packages", "core", "src"), path.join(out, "packages", "core", "src"), { recursive: true });
await cp(path.join(root, "packages", "sdk", "src"), path.join(out, "packages", "sdk", "src"), { recursive: true });
console.log(`Built ${out}`);
