// Scans the files that git would commit for anything that looks like a credential.
//   node scripts/secret-scan.mjs          scan tracked + untracked (non-ignored) files
// Exits with status 1 if something suspicious is found.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PATTERNS = [
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{32,}/],
  ['OpenAI API key', /sk-(?:proj-|svcacct-)?[A-Za-z0-9]{32,}/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['Assigned secret', /(?:api[_-]?key|secret|token|passwd|password)\s*[:=]\s*["'][A-Za-z0-9+/_-]{24,}["']/i],
];
const FORBIDDEN_FILES = [/(^|\/)\.env(\.(?!example$)[^/]*)?$/, /(^|\/)secrets\.json$/, /\.(pem|p12|pfx|key)$/i, /(^|\/)(conversations|meetings)\/[0-9a-f-]{36}\.json$/];

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const findings = [];

for (const rel of files) {
  if (FORBIDDEN_FILES.some((re) => re.test(rel))) findings.push(`${rel}: file type must not be committed`);
  const abs = path.join(root, rel);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 5_000_000) continue;
  const buf = fs.readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) continue; // binary
  const lines = buf.toString('utf8').split('\n');
  lines.forEach((line, i) => {
    for (const [name, re] of PATTERNS) if (re.test(line)) findings.push(`${rel}:${i + 1}: possible ${name}`);
  });
}

if (findings.length) {
  console.error(`Secret scan FAILED — ${findings.length} finding(s):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`Secret scan passed: ${files.length} files checked, nothing that looks like a credential.`);
