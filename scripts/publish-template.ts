import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitAuthEnv, redact } from '../server/github/gitAuth.js';

const token = process.env.GITHUB_TOKEN;
const [owner, name] = (process.env.TEMPLATE_REPO ?? 'shellenwangece/itp-app-template').split('/');
if (!token) { process.stderr.write('Set GITHUB_TOKEN in .env\n'); process.exit(1); }

const gh = async (method: string, p: string, body?: unknown) => {
  const res = await fetch(`https://api.github.com${p}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'internal-tools-platform', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

const existing = await gh('GET', `/repos/${owner}/${name}`);
if (existing.status === 404) {
  const created = await gh('POST', '/user/repos', { name, private: true, is_template: true, description: 'Starter for Internal Tools Platform apps built by Devin', auto_init: false });
  if (created.status >= 300) throw new Error(`create repo failed: ${created.status} ${JSON.stringify(created.data).slice(0, 200)}`);
  process.stdout.write(`created ${owner}/${name}\n`);
} else if (existing.status !== 200) {
  throw new Error(`lookup failed: ${existing.status}`);
} else if (!existing.data.is_template) {
  await gh('PATCH', `/repos/${owner}/${name}`, { is_template: true });
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'itp-template-'));
fs.cpSync(path.resolve('template'), work, { recursive: true, filter: (src) => !/[/\\](node_modules|dist)([/\\]|$)/.test(src) });
const env = gitAuthEnv(token);
const git = (...args: string[]) => {
  try { return execFileSync('git', args, { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString(); }
  catch (e) { throw new Error(redact(`git ${args[0]} failed: ${(e as { stderr?: Buffer }).stderr?.toString() ?? ''}`, token)); }
};
git('init', '-q', '-b', 'main');
git('add', '-A');
git('-c', 'user.name=Internal Tools Platform', '-c', 'user.email=itp@users.noreply.github.com', 'commit', '-qm', 'ITP app template');
git('push', '-q', '--force', `https://github.com/${owner}/${name}.git`, 'main');
process.stdout.write(`pushed template to https://github.com/${owner}/${name} (${git('rev-parse', '--short', 'HEAD').trim()})\n`);
