import { CANONICAL_PERMISSIONS, PERMISSION_ALIASES } from "./constants.js";

export function normalizePermission(value) {
  const key = String(value ?? "").trim().toLowerCase().replaceAll(" ", "_");
  return PERMISSION_ALIASES[key] ?? null;
}

export function normalizePermissions(values = []) {
  return [...new Set(values.map(normalizePermission).filter(Boolean))].sort();
}

export function isCanonicalPermission(value) {
  return CANONICAL_PERMISSIONS.includes(value);
}

export function marketplacePermission(permission) {
  const map = {
    "filesystem:read": "read_files",
    "filesystem:write": "write_files",
    network: "network",
    shell: "shell",
    browser: "browser",
    "git:write": "write_files",
    "secrets:read": "api_keys",
  };
  return map[permission] ?? permission;
}
