import { sha256, stableStringify } from "./hash.js";

const TEXT_EXTENSIONS = new Set([".md",".txt",".json",".yaml",".yml",".toml",".js",".mjs",".cjs",".ts",".tsx",".py",".sh",".bash",".zsh",".ps1",".html",".css"]);

export function normalizePackageFiles(files = []) {
  const seen = new Set();
  return files.map((file) => {
    const path = normalizePath(file.path ?? file.name ?? "");
    if (!path) throw new Error(`Invalid package path: ${file.path ?? file.name ?? "(empty)"}`);
    if (seen.has(path)) throw new Error(`Duplicate package path: ${path}`);
    seen.add(path);
    const content = typeof file.content === "string" ? file.content.replace(/\r\n/g, "\n") : "";
    return {
      path,
      content,
      size: Number.isFinite(file.size) ? Number(file.size) : new TextEncoder().encode(content).byteLength,
      kind: file.kind ?? inferKind(path),
      symlinkTarget: file.symlinkTarget ?? null,
    };
  }).sort((a,b) => a.path.localeCompare(b.path));
}

export function normalizePath(value) {
  const normalized = String(value).replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === ".." || part.includes("\0"))) return "";
  return parts.join("/");
}

export function inferKind(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith("skill.md")) return "skill";
  if (/\.(js|mjs|cjs|ts|tsx|py|sh|bash|zsh|ps1)$/.test(lower)) return "script";
  if (/(^|\/)package\.json$/.test(lower)) return "manifest";
  if (/(^|\/)\.github\/workflows\/.+\.ya?ml$/.test(lower)) return "workflow";
  if (/(^|\/)\.env(?:\.|$)/.test(lower)) return "environment";
  if (TEXT_EXTENSIONS.has(extension(lower))) return "text";
  return "binary";
}

export function fingerprintPackage(files) {
  const normalized = normalizePackageFiles(files).map(({path,content,size,kind,symlinkTarget}) => ({path,content,size,kind,symlinkTarget}));
  return `sha256:${sha256(stableStringify(normalized))}`;
}

export function findSkillFile(files) {
  return files.find((file) => /(^|\/)skill\.md$/i.test(file.path)) ?? files.find((file) => file.path.toLowerCase().endsWith(".md"));
}

function extension(path) {
  const index = path.lastIndexOf(".");
  return index < 0 ? "" : path.slice(index);
}
