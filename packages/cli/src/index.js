#!/usr/bin/env node
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  compareReports,
  evaluateReleaseGate,
  filesFromZip,
  fingerprintPackage,
  fingerprintPolicy,
  normalizePolicy,
  renderComparisonMarkdown,
  renderReportMarkdown,
  reportToGitHubAnnotations,
  reportToSarif,
  scanGitHubRepository,
  scanPackage,
} from "../../sdk/src/index.js";

const [command = "help", ...argv] = process.argv.slice(2);
const args = parseArgs(argv);

try {
  if (command === "scan") await scanCommand(args);
  else if (command === "github") await githubCommand(args);
  else if (command === "baseline") await baselineCommand(args);
  else if (command === "compare") await compareCommand(args);
  else if (command === "annotations") await annotationsCommand(args);
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
  await writeReportBundle(out, "report", report);
  if (!args.quiet) console.log(renderReportMarkdown(report));
  if (!report.gate.publishable) process.exitCode = 1;
}

async function githubCommand(args) {
  if (!args.url) throw new Error("github requires --url.");
  const policy = await loadPolicy(args.config);
  const report = await scanGitHubRepository(args.url, {policy, token:args.token});
  const out = path.resolve(args.out ?? ".skillcheck");
  await writeReportBundle(out, "github-report", report);
  if (!args.quiet) console.log(renderReportMarkdown(report));
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
  const format = normalizeComparisonFormat(args.format, args.out);
  const output = format === "markdown" ? renderComparisonMarkdown(comparison) : `${JSON.stringify(comparison,null,2)}\n`;
  if (args.out) await writeFile(path.resolve(args.out), output); else process.stdout.write(output);
  if (comparison.recommendation === "block") process.exitCode = 1;
}

async function annotationsCommand(args) {
  if (!args.report) throw new Error("annotations requires --report.");
  const report = JSON.parse(await readFile(path.resolve(args.report),"utf8"));
  const annotations = reportToGitHubAnnotations(report, {maximum: args.max ?? args.maximum});
  for (const annotation of annotations) console.log(githubWorkflowCommand(annotation));
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

async function writeReportBundle(directory, basename, report) {
  await mkdir(directory,{recursive:true});
  await Promise.all([
    writeFile(path.join(directory,`${basename}.json`),JSON.stringify(report,null,2)),
    writeFile(path.join(directory,`${basename}.md`),renderReportMarkdown(report)),
    writeFile(path.join(directory,`${basename}.sarif`),JSON.stringify(reportToSarif(report),null,2)),
  ]);
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

function normalizeComparisonFormat(format, output) {
  const value = String(format ?? (String(output ?? "").endsWith(".md") ? "markdown" : "json")).toLowerCase();
  if (!["json","markdown","md"].includes(value)) throw new Error("compare --format must be json or markdown.");
  return value === "md" ? "markdown" : value;
}

function githubWorkflowCommand(annotation) {
  const properties = [
    `file=${escapeWorkflowProperty(annotation.file)}`,
    `line=${annotation.line}`,
    `title=${escapeWorkflowProperty(annotation.title)}`,
  ].join(",");
  const message = `${annotation.message} Evidence: ${annotation.evidence}`;
  return `::${annotation.level} ${properties}::${escapeWorkflowData(message)}`;
}

function escapeWorkflowData(value) {
  return String(value).replaceAll("%","%25").replaceAll("\r","%0D").replaceAll("\n","%0A");
}

function escapeWorkflowProperty(value) {
  return escapeWorkflowData(value).replaceAll(":","%3A").replaceAll(",","%2C");
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
  console.log(`SkillCheck v1\n\nCommands:\n  scan --root <path> [--zip package.zip] [--config policy.json]\n  github --url <github.com/owner/repo> [--token token]\n  baseline --root <path> [--out baseline.json]\n  compare --base report.json --head report.json [--format json|markdown] [--out file]\n  annotations --report report.json [--max 50]\n  gate --report report.json [--evidence evidence.json] [--root package]\n`);
  process.exitCode=code;
}
