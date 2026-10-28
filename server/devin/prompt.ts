import type { Config } from '../config.js';
import type { DataConnector } from '../data/connector.js';
import type { AppRequest } from '../requests/service.js';

export function buildPrompt(request: AppRequest, connector: DataConnector, config: Config): string {
  const lines: string[] = [];
  lines.push('Use the `new-internal-app` skill (ITP: build a new internal app from an approved request). Do not ask anyone questions; nobody is watching this session.');
  lines.push('');
  lines.push('```yaml');
  lines.push(`app_name: ${JSON.stringify(request.name)}`);
  lines.push(`slug: ${request.slug}`);
  lines.push(`target_repo: ${config.GITHUB_OWNER}/itp-app-${request.slug}`);
  lines.push(`template_repo: ${config.TEMPLATE_REPO}`);
  lines.push(`audience_teams: [${request.teams.join(', ')}]`);
  lines.push('grants:');
  for (const g of request.grants) lines.push(`  - { dataset: ${g.dataset}, permission: ${g.permission} }`);
  lines.push('requirement: |');
  for (const l of request.description.split('\n')) lines.push(`  ${l}`);
  lines.push('```');
  lines.push('');
  lines.push('## Approved datasets (schemas and sample rows)');
  for (const g of request.grants) {
    const ds = connector.getSchema(g.dataset);
    lines.push(`### ${ds.name} (${g.permission}) — ${ds.description}`);
    lines.push(`Primary key: ${ds.primaryKey}. Columns: ${ds.columns.map((c) => `${c.name}:${c.type}`).join(', ')}`);
    lines.push('```json');
    lines.push(JSON.stringify(connector.sample(ds.name, 3), null, 0));
    lines.push('```');
  }
  lines.push('');
  lines.push('When done, set structured output {repo_url, pr_url, summary}.');
  return lines.join('\n');
}
