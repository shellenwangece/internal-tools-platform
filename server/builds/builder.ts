import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { gitAuthEnv, redact } from '../github/gitAuth.js';

const run = promisify(execFile);

export interface Builder {
  build(repo: string, sha: string): Promise<{ distDir: string }>;
}

export interface BuilderOptions { token: string; mode: 'docker' | 'local'; timeoutMs?: number; image?: string }

/** Build env contains nothing from the platform's own environment. */
export function cleanBuildEnv(): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: os.tmpdir(), CI: '1', npm_config_update_notifier: 'false' };
}

async function cloneAt(repo: string, sha: string, token: string, dest: string): Promise<void> {
  const env = gitAuthEnv(token);
  const git = (...args: string[]) => run('git', args, { env, cwd: dest, timeout: 120000 });
  fs.mkdirSync(dest, { recursive: true });
  try {
    await git('init', '-q');
    await git('remote', 'add', 'origin', `https://github.com/${repo}.git`);
    await git('fetch', '-q', '--depth', '1', 'origin', sha);
    await git('checkout', '-q', 'FETCH_HEAD');
  } catch (e) {
    throw new Error(redact(`Could not fetch ${repo}@${sha.slice(0, 7)}: ${e instanceof Error ? (e as { stderr?: string }).stderr || e.message : String(e)}`, token));
  }
}

export class RepoBuilder implements Builder {
  constructor(private opts: BuilderOptions) {}

  async build(repo: string, sha: string): Promise<{ distDir: string }> {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^[0-9a-f]{7,40}$/.test(sha)) throw new Error('bad repo or sha');
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'itp-build-'));
    await cloneAt(repo, sha, this.opts.token, work);
    const timeout = this.opts.timeoutMs ?? 5 * 60 * 1000;
    if (this.opts.mode === 'docker') {
      await run('docker', ['run', '--rm', '--network', 'none', '--memory', '2g', '--cpus', '2', '-v', `${work}:/app`, '-w', '/app', '-e', 'CI=1', this.opts.image ?? 'node:20-alpine', 'sh', '-c', 'npm ci --ignore-scripts --offline 2>/dev/null || npm ci --ignore-scripts; npm run build'], { env: cleanBuildEnv(), timeout, maxBuffer: 20 * 1024 * 1024 })
        .catch(async () => {
          // Dependencies need the network; fetch them in a first pass, then build offline.
          await run('docker', ['run', '--rm', '--memory', '2g', '--cpus', '2', '-v', `${work}:/app`, '-w', '/app', this.opts.image ?? 'node:20-alpine', 'npm', 'ci', '--ignore-scripts'], { env: cleanBuildEnv(), timeout, maxBuffer: 20 * 1024 * 1024 });
          await run('docker', ['run', '--rm', '--network', 'none', '--memory', '2g', '--cpus', '2', '-v', `${work}:/app`, '-w', '/app', '-e', 'CI=1', this.opts.image ?? 'node:20-alpine', 'npm', 'run', 'build'], { env: cleanBuildEnv(), timeout, maxBuffer: 20 * 1024 * 1024 });
        });
    } else {
      await run('npm', ['ci', '--ignore-scripts'], { cwd: work, env: cleanBuildEnv(), timeout, maxBuffer: 20 * 1024 * 1024 });
      await run('npm', ['run', 'build'], { cwd: work, env: cleanBuildEnv(), timeout, maxBuffer: 20 * 1024 * 1024 });
    }
    const distDir = path.join(work, 'dist');
    if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error('Build did not produce dist/index.html');
    return { distDir };
  }
}

/** Test/E2E builder: writes a tiny static app that talks to the platform through the SDK bridge. */
export class FakeBuilder implements Builder {
  async build(repo: string, sha: string): Promise<{ distDir: string }> {
    const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itp-fake-dist-'));
    fs.writeFileSync(path.join(distDir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>${repo}</title><link rel="stylesheet" href="./app.css"></head><body><h1 id="title">Mock app ${repo.split('/').pop()}</h1><p id="version">${sha.slice(0, 7)}</p><pre id="out">loading…</pre><script src="./app.js"></script></body></html>`);
    fs.writeFileSync(path.join(distDir, 'app.css'), 'body{font-family:sans-serif;padding:16px}');
    fs.writeFileSync(path.join(distDir, 'app.js'), `
      const pending = new Map(); let n = 0;
      function call(method, params) { return new Promise((resolve, reject) => { const id = 'r' + (++n); pending.set(id, { resolve, reject }); parent.postMessage({ type: 'itp:request', id, method, params: params || {} }, '*'); }); }
      addEventListener('message', (e) => { const m = e.data; if (!m || m.type !== 'itp:response') return; const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.ok ? p.resolve(m.result) : p.reject(m.error); });
      (async () => { try { const ctx = await call('getContext'); const ds = await call('datasets.list'); const first = ds[0]; const q = first ? await call('datasets.query', { name: first.name, opts: { limit: 3 } }) : { rows: [], total: 0 }; document.getElementById('out').textContent = 'Hello ' + ctx.user.name + '. ' + (first ? first.label + ': ' + q.total + ' rows' : 'no datasets'); document.getElementById('out').dataset.ready = '1'; } catch (e) { document.getElementById('out').textContent = 'Error: ' + (e && e.message); } })();
    `);
    return { distDir };
  }
}
