import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXPECTED_SHA256 = "117f5c1d75629fa385986ee7402017a35773560e7959ce8a89f0d2aecc2acd50";
const PART_PREFIX = "release-v03-final.part-";

function readString(block, start, length) {
  const end = block.indexOf(0, start);
  return block.subarray(start, end === -1 || end > start + length ? start + length : end).toString("utf8");
}

function readOctal(block, start, length) {
  const value = readString(block, start, length).replace(/\0/g, "").trim();
  return value ? Number.parseInt(value, 8) : 0;
}

function safeTarget(root, archivePath) {
  const normalized = archivePath.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..") || normalized.includes("\0")) {
    throw new Error(`Unsafe release path: ${archivePath}`);
  }
  const target = resolve(root, normalized);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error(`Release path escapes repository: ${archivePath}`);
  return target;
}

async function extractTar(buffer, root) {
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const archivePath = prefix ? `${prefix}/${name}` : name;
    const size = readOctal(header, 124, 12);
    const mode = readOctal(header, 100, 8) || 0o644;
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) throw new Error(`Truncated release entry: ${archivePath}`);
    const target = safeTarget(root, archivePath);
    if (type === "5") {
      await mkdir(target, { recursive: true });
    } else if (type === "0" || type === "\0") {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, buffer.subarray(dataStart, dataEnd));
      await chmod(target, mode & 0o777);
    } else {
      throw new Error(`Unsupported release entry type '${type}' for ${archivePath}`);
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
}

export async function bootstrapV03(root = resolve(fileURLToPath(new URL("..", import.meta.url)))) {
  const partNames = (await readdir(root)).filter((name) => name.startsWith(PART_PREFIX)).sort();
  if (!partNames.length) {
    const engine = resolve(root, "core", "engine.js");
    try {
      await readFile(engine);
      return { expanded: false, root };
    } catch {
      throw new Error("SkillCheck v0.3 source parts are missing.");
    }
  }
  const encoded = (await Promise.all(partNames.map((name) => readFile(resolve(root, name), "utf8")))).join("").replace(/\s+/g, "");
  const archive = Buffer.from(encoded, "base64");
  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== EXPECTED_SHA256) throw new Error(`SkillCheck v0.3 source checksum mismatch: ${actual}`);
  await extractTar(gunzipSync(archive), root);
  return { expanded: true, root, parts: partNames.length, sha256: actual };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  const result = await bootstrapV03();
  console.log(result.expanded ? `Expanded verified SkillCheck v0.3 source from ${result.parts} parts.` : "SkillCheck v0.3 source is already expanded.");
}
