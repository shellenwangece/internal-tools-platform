export interface PrInfo { merged: boolean; headSha: string; state: string; baseRef: string }

export interface GitHubClient {
  getPr(prUrl: string): Promise<PrInfo>;
  getBranchHeadSha(repo: string, branch: string): Promise<string>;
}

export function parsePrUrl(prUrl: string): { repo: string; number: number } {
  const m = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(prUrl);
  if (!m) throw new Error(`Not a GitHub pull request URL: ${prUrl}`);
  return { repo: m[1], number: Number(m[2]) };
}

export class HttpGitHubClient implements GitHubClient {
  constructor(private token: string, private fetchFn: typeof fetch = fetch, private baseUrl = 'https://api.github.com') {}

  private async get(path: string): Promise<Record<string, unknown>> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'internal-tools-platform' } });
    if (!res.ok) throw new Error(`GitHub API ${path} failed: ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  async getPr(prUrl: string): Promise<PrInfo> {
    const { repo, number } = parsePrUrl(prUrl);
    const d = await this.get(`/repos/${repo}/pulls/${number}`);
    const head = d.head as { sha: string }; const base = d.base as { ref: string };
    return { merged: Boolean(d.merged), headSha: head.sha, state: String(d.state), baseRef: base.ref };
  }

  async getBranchHeadSha(repo: string, branch: string): Promise<string> {
    const d = await this.get(`/repos/${repo}/branches/${encodeURIComponent(branch)}`);
    return (d.commit as { sha: string }).sha;
  }
}

/** GITHUB_MOCK=1: PRs are open until `merge()` is called; main advances to a new sha on merge. */
export class FakeGitHubClient implements GitHubClient {
  private prs = new Map<string, PrInfo>();
  private mains = new Map<string, string>();

  async getPr(prUrl: string): Promise<PrInfo> {
    let pr = this.prs.get(prUrl);
    if (!pr) { pr = { merged: false, headSha: 'a'.repeat(40), state: 'open', baseRef: 'main' }; this.prs.set(prUrl, pr); }
    return pr;
  }

  async getBranchHeadSha(repo: string, _branch: string): Promise<string> {
    return this.mains.get(repo) ?? '0'.repeat(40);
  }

  merge(prUrl: string): void {
    const { repo } = parsePrUrl(prUrl);
    const sha = 'b'.repeat(40);
    this.prs.set(prUrl, { merged: true, headSha: 'a'.repeat(40), state: 'closed', baseRef: 'main' });
    this.mains.set(repo, sha);
  }
}
