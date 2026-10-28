import 'dotenv/config';
import path from 'node:path';
import { loadNotes, upsertNotes } from './devin-setup-lib.js';

const apiKey = process.env.DEVIN_API_KEY; const orgId = process.env.DEVIN_ORG_ID;
if (!apiKey || !orgId) { process.stderr.write('Set DEVIN_API_KEY and DEVIN_ORG_ID in .env\n'); process.exit(1); }
const notes = loadNotes(path.resolve('devin/knowledge'));
const ids = await upsertNotes({ apiKey, orgId, notes, resourcesFile: path.resolve('.devin-resources.json') });
for (const n of notes) process.stdout.write(`knowledge: ${n.name} -> ${ids[n.file]}\n`);
process.stdout.write('The build procedure ships as a skill in the template repo (.agents/skills/new-internal-app/SKILL.md); this account uses Skills, not playbooks.\n');
