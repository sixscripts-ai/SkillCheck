export function summarize(text) {
  return text.split("\n").filter(Boolean).slice(0, 10).join("\n");
}
