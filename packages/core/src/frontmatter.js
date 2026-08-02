import { normalizePermissions } from "./permissions.js";

export function parseFrontmatter(markdown) {
  const text = String(markdown ?? "");
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { data: {}, body: text, errors: ["Missing YAML frontmatter."] };
  const data = {};
  const errors = [];
  let activeList = null;
  for (const raw of match[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    const list = raw.match(/^\s*-\s+(.+)$/);
    if (list && activeList) {
      data[activeList].push(stripQuotes(list[1].trim()));
      continue;
    }
    const keyValue = raw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyValue) continue;
    const [, key, rawValue] = keyValue;
    const value = rawValue.trim();
    if (!value) {
      data[key] = [];
      activeList = key;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value.slice(1,-1).split(",").map((item) => stripQuotes(item.trim())).filter(Boolean);
      activeList = null;
    } else {
      data[key] = stripQuotes(value);
      activeList = null;
    }
  }
  const declared = data.permissions ?? data["allowed-tools"] ?? data.allowed_tools ?? [];
  data.permissions = normalizePermissions(Array.isArray(declared) ? declared : [declared]);
  return { data, body: text.slice(match[0].length), errors };
}

function stripQuotes(value) {
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

export function sectionNames(markdown) {
  return [...String(markdown).matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => match[1].trim());
}
