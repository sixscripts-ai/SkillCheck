import { inferKind, normalizePath } from "../../core/src/package.js";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const DEFAULT_LIMITS = Object.freeze({
  maxEntries: 500,
  maxTotalBytes: 25 * 1024 * 1024,
  maxFileBytes: 2 * 1024 * 1024,
  maxCompressionRatio: 100,
});

export async function filesFromZip(input, options = {}) {
  const limits = {...DEFAULT_LIMITS, ...options};
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findSignature(view, EOCD, Math.max(0, bytes.length - 65557));
  if (eocd < 0) throw new Error("ZIP end-of-central-directory record was not found.");
  const entryCount = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entryCount > limits.maxEntries) throw new Error(`ZIP contains more than ${limits.maxEntries} entries.`);

  const files = [];
  let cursor = centralOffset;
  let totalBytes = 0;
  for (let index = 0; index < entryCount; index++) {
    if (view.getUint32(cursor, true) !== CENTRAL) throw new Error("Invalid ZIP central directory entry.");
    const compression = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const externalAttributes = view.getUint32(cursor + 38, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const rawName = decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (rawName.endsWith("/")) continue;

    const path = normalizePath(rawName);
    if (!path || rawName.startsWith("/") || /^[A-Za-z]:[\\/]/.test(rawName)) throw new Error(`Unsafe ZIP path rejected: ${rawName}`);
    if (uncompressedSize > limits.maxFileBytes) throw new Error(`ZIP entry exceeds ${limits.maxFileBytes} bytes: ${path}`);
    totalBytes += uncompressedSize;
    if (totalBytes > limits.maxTotalBytes) throw new Error(`ZIP expands beyond ${limits.maxTotalBytes} bytes.`);
    if (compressedSize === 0 ? uncompressedSize > 0 : uncompressedSize / compressedSize > limits.maxCompressionRatio) throw new Error(`ZIP compression ratio is unsafe: ${path}`);
    if (view.getUint32(localOffset, true) !== LOCAL) throw new Error(`Invalid ZIP local header: ${path}`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const contentBytes = compression === 0 ? compressed : compression === 8 ? await inflateRaw(compressed) : unsupported(compression, path);
    if (contentBytes.length !== uncompressedSize) throw new Error(`ZIP size mismatch: ${path}`);
    const unixMode = externalAttributes >>> 16;
    const isSymlink = (unixMode & 0o170000) === 0o120000;
    const kind = inferKind(path);
    files.push({
      path,
      content: kind === "binary" && !isSymlink ? "" : decode(contentBytes),
      size: contentBytes.length,
      kind,
      symlinkTarget: isSymlink ? decode(contentBytes) : null,
    });
  }
  return files;
}

function findSignature(view, signature, minimum) {
  for (let offset = view.byteLength - 4; offset >= minimum; offset--) if (view.getUint32(offset, true) === signature) return offset;
  return -1;
}

async function inflateRaw(bytes) {
  if (typeof process !== "undefined" && process.versions?.node) {
    const { inflateRawSync } = await import("node:zlib");
    return new Uint8Array(inflateRawSync(bytes));
  }
  if (typeof DecompressionStream !== "undefined") {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error("Deflated ZIP entries are not supported in this runtime.");
}

function unsupported(compression, path) {
  throw new Error(`Unsupported ZIP compression method ${compression}: ${path}`);
}
function decode(bytes) { return new TextDecoder("utf-8", {fatal:false}).decode(bytes); }
