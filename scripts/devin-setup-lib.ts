import fs from 'node:fs';
import path from 'node:path';

export interface NoteFile { file: string; name: string; trigger: string; body: string }

export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error('missing frontmatter');
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^'(.*)'$/, '$1'); }
  return { meta, body: m[2].trim() + '\n' };
}

export function loadNotes(dir: string): NoteFile[] {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((file) => {
    const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (!meta.name || !meta.trigger) throw new Error(`${file}: frontmatter needs name and trigger`);
    return { file, name: meta.name, trigger: meta.trigger, body };
  });
}

/** Creates or updates org knowledge notes; ids persist in the resources file so reruns update instead of duplicating. */
export async function upsertNotes(opts: { apiKey: string; orgId: string; notes: NoteFile[]; resourcesFile: string; fetchFn?: typeof fetch; baseUrl?: string }): Promise<Record<string, string>> {
  const fetchFn = opts.fetchFn ?? fetch;
  const base = `${opts.baseUrl ?? 'https://api.devin.ai/v3'}/organizations/${opts.orgId}/knowledge/notes`;
  const saved: { notes?: Record<string, string> } = fs.existsSync(opts.resourcesFile) ? JSON.parse(fs.readFileSync(opts.resourcesFile, 'utf8')) : {};
  const ids: Record<string, string> = { ...(saved.notes ?? {}) };
  for (const n of opts.notes) {
    const payload = JSON.stringify({ name: n.name, trigger: n.trigger, body: n.body, is_enabled: true });
    const headers = { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' };
    const existing = ids[n.file];
    let res = existing ? await fetchFn(`${base}/${existing}`, { method: 'PUT', headers, body: payload }) : null;
    if (!res || res.status === 404) res = await fetchFn(base, { method: 'POST', headers, body: payload });
    const text = await res.text();
    if (!res.ok) throw new Error(`knowledge note ${n.file}: ${res.status} ${text.slice(0, 200)}`);
    const d = text ? JSON.parse(text) : {};
    ids[n.file] = String(d.note_id ?? d.id ?? existing);
  }
  fs.writeFileSync(opts.resourcesFile, JSON.stringify({ ...saved, notes: ids }, null, 2) + '\n');
  return ids;
}
