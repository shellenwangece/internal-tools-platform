import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadNotes, upsertNotes } from '../scripts/devin-setup-lib.js';

describe('devin setup', () => {
  it('loads the five knowledge notes with name and trigger', () => {
    const notes = loadNotes(path.resolve('devin/knowledge'));
    expect(notes).toHaveLength(5);
    expect(notes.every((n) => n.name.startsWith('ITP') && n.trigger.length > 10 && n.body.length > 100)).toBe(true);
  });

  it('creates notes once, then updates them by id on rerun', async () => {
    const calls: { method: string; url: string }[] = [];
    let n = 0;
    const fetchFn = (async (url: string, init: RequestInit) => { calls.push({ method: String(init.method), url }); return new Response(JSON.stringify({ note_id: init.method === 'POST' ? `note-${++n}` : url.split('/').pop() }), { status: 200 }); }) as unknown as typeof fetch;
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'itp-res-')), 'res.json');
    const notes = loadNotes(path.resolve('devin/knowledge')).slice(0, 2);
    await upsertNotes({ apiKey: 'k', orgId: 'org-1', notes, resourcesFile: file, fetchFn });
    await upsertNotes({ apiKey: 'k', orgId: 'org-1', notes, resourcesFile: file, fetchFn });
    expect(calls.map((c) => c.method)).toEqual(['POST', 'POST', 'PUT', 'PUT']);
    expect(calls[2].url).toBe('https://api.devin.ai/v3/organizations/org-1/knowledge/notes/note-1');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).notes).toEqual({ [notes[0].file]: 'note-1', [notes[1].file]: 'note-2' });
  });
});
