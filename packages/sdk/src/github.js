import { inferKind } from "../../core/src/package.js";
import { scanPackage } from "../../core/src/scanner.js";

const DEFAULT_LIMITS = Object.freeze({ maxEntries: 200, maxTotalBytes: 10 * 1024 * 1024, maxFileBytes: 1024 * 1024, concurrency: 8 });

export function parseGitHubRepositoryUrl(value) {
  const url = new URL(value);
  if (url.hostname !== "github.com") throw new Error("Only github.com repository URLs are supported.");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("GitHub URL must include an owner and repository.");
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  let ref = null;
  let packagePath = "";
  if (parts[2] === "tree" && parts[3]) {
    ref = decodeURIComponent(parts[3]);
    packagePath = parts.slice(4).map(decodeURIComponent).join("/");
  }
  return { owner, repo, ref, packagePath };
}

export async function filesFromGitHub(repositoryUrl, options = {}) {
  const parsed = parseGitHubRepositoryUrl(repositoryUrl);
  const limits = {...DEFAULT_LIMITS, ...options};
  const request = options.fetch ?? globalThis.fetch;
  if (typeof request !== "function") throw new Error("A fetch implementation is required.");
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let ref = parsed.ref;
  if (!ref) {
    const repoResponse = await request(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {headers});
    if (!repoResponse.ok) throw new Error(`GitHub repository lookup failed (${repoResponse.status}).`);
    ref = (await repoResponse.json()).default_branch;
  }
  const treeResponse = await request(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, {headers});
  if (!treeResponse.ok) throw new Error(`GitHub tree lookup failed (${treeResponse.status}).`);
  const tree = await treeResponse.json();
  if (tree.truncated) throw new Error("GitHub repository tree is too large or truncated.");
  const prefix = parsed.packagePath ? `${parsed.packagePath.replace(/^\/+|\/+$/g, "")}/` : "";
  const blobs = (tree.tree ?? []).filter((item) => item.type === "blob" && (!prefix || item.path.startsWith(prefix)));
  if (blobs.length > limits.maxEntries) throw new Error(`GitHub package contains more than ${limits.maxEntries} files.`);
  const totalBytes = blobs.reduce((sum, item) => sum + Number(item.size ?? 0), 0);
  if (totalBytes > limits.maxTotalBytes) throw new Error(`GitHub package exceeds ${limits.maxTotalBytes} bytes.`);

  return mapConcurrent(blobs, limits.concurrency, async (item) => {
    const path = prefix ? item.path.slice(prefix.length) : item.path;
    const size = Number(item.size ?? 0);
    const kind = inferKind(path);
    if (size > limits.maxFileBytes) return {path, content:`gitblob:${item.sha}`, size, kind};
    if (kind === "binary") return {path, content:`gitblob:${item.sha}`, size, kind};
    const blobResponse = await request(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/blobs/${item.sha}`, {headers});
    if (!blobResponse.ok) throw new Error(`GitHub blob lookup failed for ${path} (${blobResponse.status}).`);
    const blob = await blobResponse.json();
    const content = blob.encoding === "base64" ? decodeBase64(blob.content ?? "") : String(blob.content ?? "");
    return {path, content, size, kind};
  });
}

export async function scanGitHubRepository(repositoryUrl, options = {}) {
  const files = await filesFromGitHub(repositoryUrl, options);
  const parsed = parseGitHubRepositoryUrl(repositoryUrl);
  return scanPackage({
    files,
    policy: options.policy,
    generatedAt: options.generatedAt,
    context: {repository:`${parsed.owner}/${parsed.repo}`,ref:parsed.ref,path:parsed.packagePath || "."},
  });
}

async function mapConcurrent(values, concurrency, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({length:Math.max(1,Math.min(concurrency,values.length || 1))}, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function decodeBase64(value) {
  const clean = value.replace(/\s/g, "");
  if (typeof Buffer !== "undefined") return Buffer.from(clean, "base64").toString("utf8");
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
