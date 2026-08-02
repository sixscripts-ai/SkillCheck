#!/usr/bin/env node
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { compareReports, evaluateReleaseGate, filesFromZip, fingerprintPackage, fingerprintPolicy, normalizePolicy, scanGitHubRepository, scanPackage } from "../../sdk/src/index.js";

const [command = "help", ...argv] = process.argv.slice(2);
const args = parseArgs(argv);

try {
  if (command === "scan") await scanCommand(args);
  else if (command === "github") await githubCommand(args);
  else if (command === "baseline") await baselineCommand(args);
  else if (command === "compare") await compareCommand(args);
  else if (command === "gate") await gateCommand(args);
  else help(command === "help" ? 0 : 1);
} catch (error) {
  console.error(`SkillCheck: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}

async function scanCommand(args) {
  const root = path.resolve(args.root ?? ".");
  const policy = await loadPolicy(args.config);
  const files = args.zip ? await filesFromZip(await readFile(path.resolve(args.zip))) : await collectFiles(root);
  const report = scanPackage({files, policy, context:{repository:args.repository ?? null,ref:args.ref ?? null,path:args.path ?? "."}});
  const out = path.resolve(root, args.out ?? ".skillcheck");
  await mkdir(out,{recursive:true});
  await writeFile(path.join(out,"report.json"),JSON.stringify(report,null,2));
  await writeFile(path.join(out,"report.md"),renderMarkdown(report));
  if (!args.quiet) console.log(renderMarkdown(report));
  if (!report.gate.publishable) process.exitCode = 1;
}

async function githubCommand(args) {
  if (!args.url) throw new Error("github requires --url.");
  const policy = await loadPolicy(args.config);
  const report = await scanGitHubRepository(args.url, {policy, token:args.token});
  const out = path.resolve(args.out ?? ".skillcheck");
  await mkdir(out,{recursive:true});
  await writeFile(path.join(out,"github-report.json"),JSON.stringify(report,null,2));
  await writeFile(path.join(out,"github-report.md"),renderMarkdown(report));
  if (!args.quiet) console.log(renderMarkdown(report));
  if (!report.gate.publishable) process.exitCode = 1;
}

async function baselineCommand(args) {
  const root = path.resolve(args.root ?? ".");
  const policy = await loadPolicy(args.config);
  const report = scanPackage({files:await collectFiles(root),policy,context:{repository:args.repository ?? null,path:args.path ?? "."}});
  const output = path.resolve(args.out ?? path.join(root,".skillcheck-baseline.json"));
  await writeFile(output,JSON.stringify({schemaVersion:"1",createdAt:new Date().toISOString(),report},null,2));
  console.log(output);
}

async function compareCommand(args) {
  if (!args.base || !args.head) throw new Error("compare requires --base and --head report JSON files.");
  const base = JSON.parse(await readFile(args.base,"utf8"));
  const head = JSON.parse(await readFile(args.head,"utf8"));
  const comparison = compareReports(base.report ?? base, head.report ?? head);
  console.log(JSON.stringify(comparison,null,2));
  if (comparison.recommendation === "block") process.exitCode = 1;
}

async function gateCommand(args) {
  if (!args.report) throw new Error("gate requires --report.");
  const report = JSON.parse(await readFile(args.report,"utf8"));
  const policy = await loadPolicy(args.config);
  const evidence = args.evidence ? JSON.parse(await readFile(args.evidence,"utf8")) : null;
  const currentFingerprint = args.root ? fingerprintPackage(await collectFiles(path.resolve(args.root))) : report.fingerprint;
  const gate = evaluateReleaseGate({report,policy,evidence,currentFingerprint,expectedPolicyFingerprint:fingerprintPolicy(policy)});
  console.log(JSON.stringify(gate,null,2));
  if (!gate.publishable) process.exitCode = 1;
}

async function loadPolicy(file) {
  if (!file) return normalizePolicy({});
  return normalizePolicy(JSON.parse(await readFile(path.resolve(file),"utf8")));
}

async function collectFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory,{withFileTypes:true})) {
      if ([".git","node_modules",".skillcheck","dist-web"].includes(entry.name)) continue;
      const absolute = path.join(directory,entry.name);
      const relative = path.relative(root,absolute).replaceAll(path.sep,"/");
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isSymbolicLink()) files.push({path:relative,content:"",size:0,symlinkTarget:"unknown"});
      else {
        const size = statSync(absolute).size;
        const content = size <= 2 * 1024 * 1024 ? await readFile(absolute,"utf8").catch(() => "") : "";
        files.push({path:relative,content,size});
      }
    }
  }
  await walk(root);
  return files;
}

function renderMarkdown(report) {
  const lines = [`# SkillCheck ${report.status.toUpperCase()}`,"",`Score: **${report.score}/100**`,`Fingerprint: \`${report.fingerprint}\``,"",`Declared: ${report.declaredPermissions.join(", ") || "none"}`,`Inferred: ${report.inferredPermissions.join(", ") || "none"}`,""];
  for (const finding of report.findings) {
    lines.push(`## ${finding.severity.toUpperCase()} · ${finding.title}`,"",finding.remediation,"",...finding.occurrences.map((item) => `- \`${item.file}:${item.line}\` — ${item.evidence}`),"");
  }
  return `${lines.join("\n")}\n`;
}
function parseArgs(values) {
  const result = {};
  for (let i=0;i<values.length;i++) {
    const value=values[i];
    if (!value.startsWith("--")) continue;
    const key=value.slice(2).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
    const next=values[i+1];
    if (!next || next.startsWith("--")) result[key]=true; else {result[key]=next;i++;}
  }
  return result;
}
function help(code) {
  console.log(`SkillCheck v1\n\nCommands:\n  scan --root <path> [--zip package.zip] [--config policy.json]\n  github --url <github.com/owner/repo> [--token token]\n  baseline --root <path> [--out baseline.json]\n  compare --base report.json --head report.json\n  gate --report report.json [--evidence evidence.json] [--root package]\n`);
  process.exitCode=code;
}
