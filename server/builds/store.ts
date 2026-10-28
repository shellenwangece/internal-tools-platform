import { createHash } from 'node:crypto';
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

// Inlines the bundle's own scripts and styles into index.html. Requests made from inside the
// sandboxed (opaque-origin) iframe carry no cookies, so an auth proxy in front of the platform
// would reject separate asset requests; the document itself is a normal navigation and passes.
export function inlineDocument(dir: string): { html: string; csp: string } {
  const root = path.resolve(dir);
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const read = (ref: string): string | null => {
    if (/^[a-z]+:|^\/\//i.test(ref)) return null;
    const file = path.resolve(root, ref.split(/[?#]/)[0]);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
  };
  const hashes: string[] = [];
  html = html.replace(/<script\b([^>]*?)\ssrc="([^"]+)"([^>]*)><\/script>/g, (tag, pre: string, src: string, post: string) => {
    const code = read(src);
    if (code === null) return tag;
    const body = code.replace(/<\/script/gi, '<\\/script');
    hashes.push(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
    return `<script${`${pre}${post}`.replace(/\scrossorigin(="[^"]*")?/g, '')}>${body}</script>`;
  });
  html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, (tag) => {
    const href = /href="([^"]+)"/.exec(tag)?.[1];
    const css = href ? read(href) : null;
    return css === null ? tag : `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
  });
  return { html, csp: BUNDLE_CSP.replace("script-src 'self'", ['script-src', "'self'", ...hashes].join(' ')) };
}
