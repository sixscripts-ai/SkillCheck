#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, createReadStream } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createServer } from 'node:http';

const DEFAULT = {
  minimumScore: 80,
  failOn: 'error',
  requiredSections: ['Purpose', 'Instructions', 'Safety'],
  allowedPermissions: null,
  output: '.skillcheck',
  regression: { maxScoreDrop: 5, failOnNewErrors: true, failOnPermissionExpansion: true }
};
const KNOWN = new Set(['filesystem:read','filesystem:write','network','shell','git:write','secrets:read','browser']);
const RULES = [
  ['shell','shell',/(?:```(?:bash|sh|shell)|\b(?:bash|sh|zsh|powershell)\s+-c\b|\bsudo\s+)/gi,'Shell execution detected'],
  ['network','network',/(?:\bfetch\s*\(|\baxios\b|\bcurl\s+https?:\/\/|\bwget\s+https?:\/\/)/gi,'Network access detected'],
  ['secrets','secrets:read',/(?:process\.env|\.env(?:\.|\b)|\b(?:API_KEY|ACCESS_TOKEN|SECRET_KEY|PRIVATE_KEY)\b)/gi,'Secret access detected'],
  ['git-write','git:write',/\bgit\s+(?:commit|push|tag|merge|rebase|reset\s+--hard)\b/gi,'Git write detected'],
  ['filesystem-write','filesystem:write',/(?:writeFile(?:Sync)?\s*\(|appendFile(?:Sync)?\s*\(|\b(?:cat|printf|echo)\b[^\n]*>\s*[^&])/gi,'Filesystem write detected']
];
const SECURITY = [
  ['destructive-command',/(?:\brm\s+-rf\b|\bmkfs(?:\.|\s)|\bDROP\s+(?:TABLE|DATABASE)\b|\bgit\s+reset\s+--hard\b)/gi,'Destructive command detected'],
  ['approval-bypass',/(?:without (?:asking|confirmation|approval)|do not ask (?:the )?user|skip (?:human )?approval|auto-?approve|never request confirmation)/gi,'Human approval bypass detected']
];

function args(argv) {
  const out = { command: argv[2] || 'scan' };
  for (let i=3;i<argv.length;i++) {
    const value = argv[i];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
    out[key] = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}
function walk(dir, out=[]) {
  for (const name of readdirSync(dir)) {
    if (['.git','node_modules','.skillcheck','dist','coverage'].includes(name)) continue;
    const path = join(dir,name); const stat = statSync(path);
    if (stat.isDirectory()) walk(path,out); else if (name === 'SKILL.md') out.push(path);
  }
  return out;
}
function scalar(v) {
  const s=v.trim();
  if (s==='true') return true; if (s==='false') return false;
  if (/^\d+$/.test(s)) return Number(s);
  if ((s.startsWith('"')&&s.endsWith('"'))||(s.startsWith("'")&&s.endsWith("'"))) return s.slice(1,-1);
  if (s.startsWith('[')&&s.endsWith(']')) return s.slice(1,-1).split(',').map(x=>scalar(x)).filter(Boolean);
  return s;
}
function frontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { data:{}, body:raw, ok:false };
  const data={}; let list=null;
  for (const line of match[1].split(/\r?\n/)) {
    const item=line.match(/^\s*-\s+(.+)$/); if(item&&list){data[list].push(scalar(item[1]));continue;}
    const pair=line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/); if(!pair) continue;
    const [,key,value]=pair; if(!value){data[key]=[];list=key;} else {data[key]=scalar(value);list=null;}
  }
  return { data, body:raw.slice(match[0].length), ok:true };
}
function lineAt(text,index){return text.slice(0,index).split('\n').length;}
function finding(file,id,title,message,severity='error',line,evidence,category='security'){return {file,id,title,message,severity,line,evidence,category};}
function analyze(path,root,config) {
  const raw=readFileSync(path,'utf8'); const rel=relative(root,path).replaceAll('\\','/'); const fm=frontmatter(raw);
  const f=[]; const d=fm.data; const perms=Array.isArray(d.permissions)?[...new Set(d.permissions.map(String))]:[];
  if(!fm.ok) f.push(finding(rel,'schema.frontmatter','Missing YAML frontmatter','SKILL.md must start with --- frontmatter.'));
  for(const key of ['name','description','version','permissions']) if(d[key]===undefined||d[key]==='') f.push(finding(rel,`schema.${key}`,`Missing ${key}`,`Add '${key}' to frontmatter.`));
  if(d.name&&!/^[a-z0-9][a-z0-9-]{1,62}$/.test(d.name)) f.push(finding(rel,'schema.name','Invalid skill name','Use lowercase letters, numbers, and hyphens.'));
  if(d.version&&!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(d.version)) f.push(finding(rel,'schema.version','Invalid semantic version','Use a version such as 1.0.0.'));
  for(const p of perms) {
    if(!KNOWN.has(p)) f.push(finding(rel,'permission.unknown','Unknown permission',`'${p}' is not a built-in permission.`,'warning',1,p,'permission'));
    if(Array.isArray(config.allowedPermissions)&&!config.allowedPermissions.includes(p)) f.push(finding(rel,'permission.denied','Permission denied by policy',`Repository policy does not allow '${p}'.`,'error',1,p,'permission'));
  }
  for(const section of config.requiredSections||[]) if(!new RegExp(`^#{1,6}\\s+${section.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*$`,'im').test(fm.body)) f.push(finding(rel,`quality.${section.toLowerCase()}`,`Missing ${section} section`,`Add a '${section}' heading.`,'warning',undefined,undefined,'quality'));
  for(const [id,permission,pattern,title] of RULES) {
    const rx=new RegExp(pattern.source,pattern.flags); let m; while((m=rx.exec(raw))) if(!perms.includes(permission)) f.push(finding(rel,`permission.${id}`,title,`Declare '${permission}' or remove this capability.`,'error',lineAt(raw,m.index),m[0],'permission'));
  }
  for(const [id,pattern,title] of SECURITY) { const rx=new RegExp(pattern.source,pattern.flags); let m; while((m=rx.exec(raw))) f.push(finding(rel,`security.${id}`,title,'Add an explicit safety boundary or remove the behavior.','error',lineAt(raw,m.index),m[0])); }
  const score=Math.max(0,100-f.reduce((n,x)=>n+(x.severity==='error'?25:8),0));
  const errors=f.filter(x=>x.severity==='error').length; const warnings=f.length-errors;
  return { name:d.name||rel.replace('/SKILL.md',''), version:d.version||'0.0.0', file:rel, permissions:perms.sort(), findings:f, score, status:errors||score<config.minimumScore?'fail':warnings?'warn':'pass', fingerprint:createHash('sha256').update(raw).digest('hex') };
}
function loadConfig(root,path) {
  const file=resolve(root,path||'skillcheck.config.json'); if(!existsSync(file)) return structuredClone(DEFAULT);
  return { ...structuredClone(DEFAULT), ...JSON.parse(readFileSync(file,'utf8')), regression:{...DEFAULT.regression,...(JSON.parse(readFileSync(file,'utf8')).regression||{})} };
}
function regress(report,baseline,config){
  if(!baseline) return [];
  const prior=new Map((baseline.skills||[]).map(s=>[s.file,s])); const out=[];
  for(const skill of report.skills){const old=prior.get(skill.file);if(!old)continue;
    if(old.score-skill.score>config.regression.maxScoreDrop) out.push(finding(skill.file,'regression.score','Reliability score regressed',`Score fell from ${old.score} to ${skill.score}.`));
    const added=skill.permissions.filter(p=>!(old.permissions||[]).includes(p)); if(added.length&&config.regression.failOnPermissionExpansion) out.push(finding(skill.file,'regression.permissions','Permission expansion detected',`New permissions: ${added.join(', ')}`));
    const oldErrors=new Set(old.errors||[]); const newErrors=skill.findings.filter(x=>x.severity==='error'&&!oldErrors.has(x.id)); if(newErrors.length&&config.regression.failOnNewErrors) out.push(finding(skill.file,'regression.errors','New blocking findings',newErrors.map(x=>x.id).join(', ')));
  } return out;
}
function markdown(r){let s=`# SkillCheck Report\n\n**Status:** ${r.status.toUpperCase()}  \n**Skills:** ${r.skills.length}  \n**Errors:** ${r.summary.errors}  \n**Warnings:** ${r.summary.warnings}\n\n`;for(const x of r.skills){s+=`## ${x.name} (${x.score}/100)\n\n`;if(!x.findings.length)s+='No findings.\n\n';for(const f of x.findings)s+=`- **${f.severity.toUpperCase()} ${f.id}**: ${f.message}${f.line?` (line ${f.line})`:''}\n`;s+='\n';}for(const f of r.regressions)s+=`- **${f.id}** ${f.file}: ${f.message}\n`;return s;}
function html(r){const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SkillCheck Report</title><style>body{font:15px system-ui;margin:0;background:#090b10;color:#e8edf7}main{max-width:1050px;margin:auto;padding:40px}.hero,.card{background:#111722;border:1px solid #263246;border-radius:18px;padding:24px;margin:16px 0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stat{background:#171f2d;padding:16px;border-radius:12px}.pass{color:#62d59b}.fail{color:#ff7b84}.warn{color:#f2c66d}code{color:#9fc2ff}@media(max-width:700px){.stats{grid-template-columns:1fr 1fr}}</style><main><div class="hero"><h1>SkillCheck</h1><p class="${r.status}">${r.status.toUpperCase()}</p><div class="stats"><div class="stat">${r.skills.length}<br>skills</div><div class="stat">${r.summary.errors}<br>errors</div><div class="stat">${r.summary.warnings}<br>warnings</div><div class="stat">${r.summary.average}<br>avg score</div></div></div>${r.skills.map(x=>`<section class="card"><h2>${esc(x.name)} <span class="${x.status}">${x.score}/100</span></h2><p><code>${esc(x.file)}</code></p>${x.findings.length?`<ul>${x.findings.map(f=>`<li><b>${esc(f.id)}</b>: ${esc(f.message)}${f.line?` (line ${f.line})`:''}</li>`).join('')}</ul>`:'<p>No findings.</p>'}</section>`).join('')}</main>`;}
function scan(o){const root=resolve(o.root||'.');const config=loadConfig(root,o.config);const skills=walk(root).map(p=>analyze(p,root,config));const base=o.baseline&&existsSync(resolve(root,o.baseline))?JSON.parse(readFileSync(resolve(root,o.baseline),'utf8')):null;const report={generatedAt:new Date().toISOString(),root,skills,regressions:[]};report.regressions=regress(report,base,config);const all=[...skills.flatMap(s=>s.findings),...report.regressions];report.summary={errors:all.filter(x=>x.severity==='error').length,warnings:all.filter(x=>x.severity==='warning').length,average:skills.length?Math.round(skills.reduce((n,s)=>n+s.score,0)/skills.length):0};report.status=report.summary.errors||skills.some(s=>s.score<config.minimumScore)?'fail':'pass';const dir=resolve(root,o.output||config.output);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,2));writeFileSync(join(dir,'report.md'),markdown(report));writeFileSync(join(dir,'report.html'),html(report));if(!o.quiet)console.log(markdown(report));return report;}
function baseline(o){const r=scan({...o,quiet:true});const b={version:1,createdAt:new Date().toISOString(),skills:r.skills.map(s=>({file:s.file,score:s.score,permissions:s.permissions,errors:s.findings.filter(x=>x.severity==='error').map(x=>x.id),fingerprint:s.fingerprint}))};const out=resolve(o.root||'.',o.out||'.skillcheck-baseline.json');writeFileSync(out,JSON.stringify(b,null,2));console.log(`Baseline written to ${out}`);}
function dashboard(o){const file=resolve(o.report||'.skillcheck/report.html');const port=Number(o.port||4173);createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});createReadStream(file).pipe(res);}).listen(port,()=>console.log(`SkillCheck dashboard: http://localhost:${port}`));}
function help(){console.log(`SkillCheck CI\n\nCommands:\n  scan --root . [--config skillcheck.config.json] [--baseline file]\n  baseline --root . [--out .skillcheck-baseline.json]\n  dashboard [--report .skillcheck/report.html] [--port 4173]\n`);}
const o=args(process.argv);try{if(o.command==='scan'){const r=scan(o);process.exitCode=r.status==='fail'?1:0;}else if(o.command==='baseline')baseline(o);else if(o.command==='dashboard')dashboard(o);else help();}catch(e){console.error(`SkillCheck error: ${e.message}`);process.exitCode=2;}
