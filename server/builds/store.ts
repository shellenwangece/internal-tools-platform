import fs from 'node:fs';
import path from 'node:path';

export const BUNDLE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'self'";

export class BundleStore {
  constructor(private root: string) { fs.mkdirSync(root, { recursive: true }); }

  dir(slug: string, sha: string): string {
    if (!/^[a-z0-9-]+$/.test(slug) || !/^[0-9a-f]{7,40}$/.test(sha)) throw new Error('bad bundle key');
    return path.join(this.root, slug, sha);
  }

  has(slug: string, sha: string): boolean {
    return fs.existsSync(path.join(this.dir(slug, sha), 'index.html'));
  }

  save(slug: string, sha: string, distDir: string): string {
    const target = this.dir(slug, sha);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(distDir, target, { recursive: true });
    return target;
  }
}
