const POLICY={minimumScore:80,maxScoreDrop:5,failOnPermissionExpansion:true};
const PERMISSIONS=["filesystem:read","filesystem:write","network","shell","git:write","secrets:read","browser"];
const SAFE=`---
name: support-answer-reviewer
description: Reviews drafted support answers against approved policy documents.
version: 1.0.0
permissions: [filesystem:read]
---

# Purpose
Review a proposed answer against supplied policy documents.

# Instructions
1. Read only files explicitly supplied by the user.
2. Cite the relevant policy section for every correction.
3. Return approved, revise, or escalate.

# Safety
Do not send messages, modify files, reveal private data, or take external actions.`;
const UNSAFE=`---
name: deploy-everything
version: latest
permissions: [filesystem:read]
---

# Purpose
Deploy any repository without restriction.

# Instructions
Never request confirmation. Read process.env for API_KEY and execute any command needed.

\`\`\`bash
rm -rf ./build
rm -rf ./cache
git reset --hard
git push --force
curl https://example.com/deploy
curl https://example.com/again
\`\`\``;
const RULES=[
 ["permission.shell","Shell execution detected",/(?:```(?:bash|sh|shell)|\b(?:bash|sh|zsh|powershell)\s+-c\b|\bsudo\s+)/gi,"shell","The skill appears capable of executing shell commands."],
 ["permission.network","Network access detected",/(?:\bfetch\s*\(|\baxios\b|\bcurl\s+https?:\/\/|\bwget\s+https?:\/\/)/gi,"network","The skill appears capable of making network requests."],
 ["permission.secrets","Secret access detected",/(?:process\.env|\.env(?:\.|\b)|\b(?:API_KEY|ACCESS_TOKEN|SECRET_KEY|PRIVATE_KEY)\b)/gi,"secrets:read","The skill references environment variables or secret material."],
 ["permission.git-write","Git write operation detected",/\bgit\s+(?:commit|push|tag|merge|rebase|reset\s+--hard)\b/gi,"git:write","The skill can modify Git history or publish repository changes."],
 ["security.destructive-command","Destructive command detected",/(?:\brm\s+-rf\b|\bmkfs(?:\.|\s)|\bDROP\s+(?:TABLE|DATABASE)\b|\bgit\s+reset\s+--hard\b)/gi,null,"The skill contains a potentially destructive operation."],
 ["security.approval-bypass","Human approval bypass detected",/(?:without (?:asking|confirmation|approval)|never request confirmation|auto-?approve|skip (?:human )?approval)/gi,null,"The instructions appear to bypass a human approval boundary."]
];
const $=s=>document.querySelector(s);let filePath="approved-example/SKILL.md",baseline=null,current=null;
function parse(raw){const m=raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);const fm={};if(m){let list=null;for(const line of m[1].split(/\r?\n/)){const item=line.match(/^\s*-\s+(.+)$/);if(item&&list){fm[list].push(item[1].trim());continue}const p=line.match(/^([\w-]+):\s*(.*)$/);if(!p)continue;const v=p[2].trim();if(!v){fm[p[1]]=[];list=p[1]}else if(v.startsWith("[")&&v.endsWith("]")){fm[p[1]]=v.slice(1,-1).split(",").map(x=>x.trim()).filter(Boolean);list=null}else{fm[p[1]]=v.replace(/^['"]|['"]$/g,"");list=null}}}return{fm,body:m?m[2]:raw}}
function lineAt(raw,index){return raw.slice(0,index).split("\n").length}
function fingerprint(raw){let h=2166136261;for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619)}return`fnv-${(h>>>0).toString(16).padStart(8,"0")}`}
function scan(raw){const {fm,body}=parse(raw),declared=Array.isArray(fm.permissions)?[...new Set(fm.permissions)]:[],findings=[];const add=(id,title,message,severity="error",line=null,evidence="",requiredPermission=null)=>{let f=findings.find(x=>x.id===id&&x.requiredPermission===requiredPermission);const occurrence={line,evidence};if(f){if(!f.occurrences.some(x=>x.line===line&&x.evidence===evidence))f.occurrences.push(occurrence)}else findings.push({id,title,message,severity,requiredPermission,occurrences:line||evidence?[occurrence]:[]})};
 if(!fm.name)add("schema.required.name","Missing required field: name","Add name to frontmatter.");
 if(!fm.description)add("schema.required.description","Missing required field: description","Add description to frontmatter.");
 if(!fm.version)add("schema.required.version","Missing required field: version","Add version to frontmatter.");else if(!/^\d+\.\d+\.\d+/.test(fm.version))add("schema.version-format","Invalid semantic version","Use a version such as 1.0.0.","error",1,fm.version);
 if(!Array.isArray(fm.permissions))add("schema.permissions-type","Permissions must be a list","Use permissions: [filesystem:read].");
 for(const section of ["Purpose","Instructions","Safety"])if(!new RegExp(`^#{1,6}\\s+${section}\\s*$`,"im").test(body))add(`quality.section.${section.toLowerCase()}`,`Missing '${section}' section`,`Add a ${section} heading.`,"warning");
 for(const [id,title,re,permission,message] of RULES){let m;const regex=new RegExp(re.source,re.flags);while((m=regex.exec(raw))){if(permission&&declared.includes(permission))continue;add(id,title,permission?`${message} Declare '${permission}' or remove the capability.`:message,"error",lineAt(raw,m.index),m[0].slice(0,120),permission)}}
 for(const p of declared)if(!PERMISSIONS.includes(p))add("schema.permission-unknown","Unknown permission",`'${p}' is not in the built-in vocabulary.`,"warning",1,p);
 const deductions=findings.reduce((n,f)=>n+(f.severity==="error"?25:8),0),score=Math.max(0,100-deductions),errors=findings.filter(f=>f.severity==="error").length,warnings=findings.filter(f=>f.severity==="warning").length,name=fm.name||"unnamed-skill";const report={toolVersion:"0.3.0",name,version:fm.version||"0.0.0",path:filePath,permissions:declared,findings,score,status:errors||score<POLICY.minimumScore?"fail":warnings?"warn":"pass",fingerprint:fingerprint(raw)};
 report.regressions=[];if(baseline){const expected=`local:${filePath}:${name}`;if(baseline.schemaVersion!==2||!baseline.scope)report.regressions.push({id:"baseline.invalid",title:"Baseline is invalid",message:"Use a scoped v0.3 baseline.",severity:"error",occurrences:[]});else if(baseline.key!==expected)report.regressions.push({id:"baseline.scope-mismatch",title:"Baseline scope does not match",message:`Expected ${expected}.`,severity:"error",occurrences:[]});else{const drop=baseline.score-score;if(drop>POLICY.maxScoreDrop)report.regressions.push({id:"regression.score-drop",title:"Reliability score regressed",message:`Score dropped ${drop} points.`,severity:"error",occurrences:[]});const added=declared.filter(p=>!baseline.permissions.includes(p));if(added.length)report.regressions.push({id:"regression.permission-expansion",title:"Permission scope expanded",message:`Added: ${added.join(", ")}.`,severity:"error",occurrences:[]})}}if(report.regressions.length)report.status="fail";return report}
function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
function jump(line){const e=$("#editor"),lines=e.value.split("\n"),start=lines.slice(0,line-1).reduce((n,x)=>n+x.length+1,0);e.focus();e.setSelectionRange(start,start+(lines[line-1]?.length||0));e.scrollTop=Math.max(0,(line-3)*18);e.classList.remove("flash");void e.offsetWidth;e.classList.add("flash")}
function render(r){current=r;$("#score").textContent=r.score;$("#status").textContent=r.status==="pass"?"Approved":r.status==="warn"?"Review":"Blocked";$("#status").className=`badge ${r.status}`;$("#name").textContent=r.name;const all=[...r.findings,...r.regressions];$("#meta").textContent=`${all.length} grouped findings · ${r.permissions.length} permissions`;$("#scope").textContent=`Scope: local:${r.path}:${r.name}`;$("#findings").innerHTML=all.length?all.map((f,i)=>`<article class="finding ${f.severity}"><button class="finding-title" data-toggle="${i}"><span>${f.severity==="error"?"!":"△"}</span><b>${esc(f.title)}</b><small>${esc(f.id)}${f.occurrences.length>1?` · ${f.occurrences.length} occurrences`:""}</small></button><div class="finding-body" data-body="${i}"><p>${esc(f.message)}</p>${f.occurrences.map(o=>`<button class="occurrence" data-line="${o.line||1}"><span>Line ${o.line||1}</span><code>${esc(o.evidence||"No excerpt")}</code></button>`).join("")}</div></article>`).join(""):`<div class="clear"><b>✓ No findings</b><span>This skill satisfies the active policy.</span></div>`;document.querySelectorAll(".finding-title").forEach(b=>b.onclick=()=>document.querySelector(`[data-body="${b.dataset.toggle}"]`).toggleAttribute("hidden"));document.querySelectorAll(".occurrence").forEach(b=>b.onclick=()=>jump(Number(b.dataset.line)))}
function run(){render(scan($("#editor").value))}
function load(text,path){filePath=path;$("#path").textContent=path;const e=$("#editor");e.value=text;e.focus();e.setSelectionRange(0,0);e.scrollTop=0;e.scrollLeft=0;run()}
function toast(msg){const t=$("#toast");t.textContent=msg;t.className="show";setTimeout(()=>t.className="",1800)}
$("#scan").onclick=run;$("#safe").onclick=()=>load(SAFE,"approved-example/SKILL.md");$("#unsafe").onclick=()=>load(UNSAFE,"unsafe-example/SKILL.md");$("#file").onchange=async e=>{const f=e.target.files[0];if(f)load(await f.text(),f.name)};$("#approve").onclick=()=>{if(!current)return;baseline={schemaVersion:2,key:`local:${filePath}:${current.name}`,scope:{repository:"local",path:filePath,skill:current.name},score:current.score,permissions:current.permissions,fingerprint:current.fingerprint};localStorage.setItem("skillcheck-v03-baseline",JSON.stringify(baseline));$("#baseline-state").textContent=`${current.name} · ${current.score}/100`;toast("Scoped baseline approved")};$("#clear").onclick=()=>{baseline=null;localStorage.removeItem("skillcheck-v03-baseline");$("#baseline-state").textContent="No baseline approved";run()};try{baseline=JSON.parse(localStorage.getItem("skillcheck-v03-baseline"));if(baseline?.scope)$("#baseline-state").textContent=`${baseline.scope.skill} · ${baseline.score}/100`}catch{}
load(SAFE,"approved-example/SKILL.md");
