const capabilityRules = [
  ["cap.shell", "shell", /(?:^|\s)(?:bash|sh|zsh|powershell|cmd\.exe|child_process|exec\s*\(|spawn\s*\(|subprocess\.|os\.system\s*\()/i, "Shell or process execution detected.", "Declare shell access and constrain commands to an isolated sandbox."],
  ["cap.network", "network", /(?:https?:\/\/|fetch\s*\(|axios\.|curl\s+|wget\s+|requests\.|urllib\.|net\.Dial|WebSocket)/i, "Network capability detected.", "Declare network access and document an explicit destination allowlist."],
  ["cap.filesystem-write", "filesystem:write", /(?:writeFile|appendFile|mkdir|rmSync|unlink|rename|copyFile|open\s*\([^,]+,\s*["'](?:w|a)|>\s*[^&])/i, "Filesystem write capability detected.", "Declare filesystem:write and restrict writes to the project workspace."],
  ["cap.git-write", "git:write", /git\s+(?:push|commit|merge|rebase|reset|checkout|tag|branch\s+-[dD])/i, "Git mutation capability detected.", "Declare git:write and require explicit human approval before repository mutation."],
  ["cap.secrets", "secrets:read", /(?:process\.env|os\.environ|getenv\s*\(|API_KEY|ACCESS_TOKEN|SECRET_KEY|credentials?)/i, "Secret or environment access detected.", "Declare secrets:read, request only named credentials, and redact values from output."],
  ["cap.browser", "browser", /(?:playwright|puppeteer|selenium|browser\.|page\.(?:goto|click|fill)|document\.querySelector)/i, "Browser automation capability detected.", "Declare browser access and constrain navigation and data entry."],
  ["cap.filesystem-read", "filesystem:read", /(?:readFile|readdir|glob\s*\(|open\s*\([^,]+,\s*["']r|cat\s+[^|])/i, "Filesystem read capability detected.", "Declare filesystem:read and document the permitted file scope."],
];

const riskRules = [
  ["risk.destructive-command", "error", /(?:rm\s+-rf\s+(?:\/|~|\*)|mkfs\b|dd\s+if=|format\s+[A-Z]:|DROP\s+(?:DATABASE|TABLE)|git\s+reset\s+--hard)/i, "Destructive command detected.", "Remove the command or replace it with a scoped, reviewable operation."],
  ["risk.approval-bypass", "error", /(?:without\s+(?:asking|approval|confirmation)|skip\s+(?:approval|review)|auto-approve|do\s+not\s+ask)/i, "Human approval bypass detected.", "Require explicit approval before external, destructive, privileged, or publishing actions."],
  ["risk.secret-output", "error", /(?:print|log|echo|return|upload|send).{0,50}(?:api[_ -]?key|token|password|secret|credential)/i, "Potential secret disclosure detected.", "Redact secrets and return only whether a credential is configured."],
  ["risk.remote-install", "warning", /(?:curl|wget).{0,120}\|\s*(?:bash|sh)|npm\s+install\s+[^\n]+(?:--global|-g)|pip\s+install\s+git\+/i, "Unpinned or remote installation behavior detected.", "Pin dependencies and avoid piping remote content into a shell."],
  ["risk.unbounded-scope", "warning", /(?:any\s+file|all\s+files|entire\s+(?:system|filesystem|repository)|unrestricted|any\s+website)/i, "Unbounded capability scope detected.", "Replace broad language with explicit paths, hosts, and operations."],
];

export function inspectText(file) {
  const occurrences = [];
  const lines = file.content.split("\n");
  lines.forEach((line, index) => {
    const negated = isNegated(line);
    for (const [ruleId, permission, pattern, message, remediation] of capabilityRules) {
      if (pattern.test(line) && !negated) occurrences.push({ruleId,severity:"info",permission,message,remediation,file:file.path,line:index+1,evidence:line.trim().slice(0,300)});
    }
    for (const [ruleId,severity,pattern,message,remediation] of riskRules) {
      if (pattern.test(line) && !negated) occurrences.push({ruleId,severity,permission:null,message,remediation,file:file.path,line:index+1,evidence:line.trim().slice(0,300)});
    }
  });
  return occurrences;
}

export function inspectPackageStructure(files) {
  const occurrences = [];
  for (const file of files) {
    if (file.kind === "environment") {
      occurrences.push({ruleId:"package.environment-file",severity:"error",permission:"secrets:read",message:"Environment file is included in the package.",remediation:"Remove environment files and provide a redacted example template instead.",file:file.path,line:1,evidence:file.path});
    }
    if (file.symlinkTarget) {
      occurrences.push({ruleId:"package.symlink",severity:"warning",permission:null,message:"Symbolic link is included in the package.",remediation:"Replace symlinks with explicit package files or verify the resolved target remains inside the package.",file:file.path,line:1,evidence:`${file.path} -> ${file.symlinkTarget}`});
    }
    if (file.size > 1024 * 1024) {
      occurrences.push({ruleId:"package.large-file",severity:"warning",permission:null,message:"Large package file detected.",remediation:"Keep skill packages compact and move large assets to a verified external distribution channel.",file:file.path,line:1,evidence:`${file.path} (${file.size} bytes)`});
    }
    if (file.kind === "manifest" && file.content) {
      try {
        const manifest = JSON.parse(file.content);
        for (const section of ["scripts","dependencies","devDependencies","optionalDependencies"]) {
          if (!manifest[section] || typeof manifest[section] !== "object") continue;
          for (const [name,value] of Object.entries(manifest[section])) {
            if (section === "scripts" && /^(preinstall|install|postinstall|prepare)$/.test(name)) {
              occurrences.push({ruleId:"package.install-hook",severity:"warning",permission:"shell",message:"Package install hook detected.",remediation:"Remove install-time execution or document and pin the exact command.",file:file.path,line:lineOf(file.content, `\"${name}\"`),evidence:`${name}: ${value}`});
            }
            if (section !== "scripts" && typeof value === "string" && /^(?:git\+|https?:|file:|link:)/.test(value)) {
              occurrences.push({ruleId:"package.unpinned-dependency",severity:"warning",permission:"network",message:"Non-registry or local dependency detected.",remediation:"Use a pinned registry version with a lockfile and integrity metadata.",file:file.path,line:lineOf(file.content, `\"${name}\"`),evidence:`${name}: ${value}`});
            }
          }
        }
      } catch {
        occurrences.push({ruleId:"package.invalid-manifest",severity:"error",permission:null,message:"Invalid package manifest JSON.",remediation:"Fix the manifest so dependency and install-hook inspection can run.",file:file.path,line:1,evidence:"JSON parse failed"});
      }
    }
    if (file.kind === "workflow" && /permissions:\s*write-all/i.test(file.content)) {
      occurrences.push({ruleId:"package.workflow-write-all",severity:"error",permission:"git:write",message:"Workflow grants write-all permissions.",remediation:"Use least-privilege workflow permissions and grant write scopes only to named jobs.",file:file.path,line:lineOf(file.content,"permissions:"),evidence:"permissions: write-all"});
    }
  }
  return occurrences;
}

function isNegated(line) {
  return /\b(?:never|do not|don't|must not|should not|avoid|prohibit(?:ed)?|disallow)\b/i.test(line);
}
function lineOf(content, needle) {
  const index = content.indexOf(needle);
  return index < 0 ? 1 : content.slice(0,index).split("\n").length;
}
