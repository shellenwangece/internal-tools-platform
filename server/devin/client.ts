export type DevinStatus = 'new' | 'claimed' | 'running' | 'exit' | 'error' | 'suspended' | 'resuming';

export interface DevinSession {
  sessionId: string;
  url: string;
  status: DevinStatus;
  statusDetail: string | null;
  pullRequests: { prUrl: string; prState: string | null }[];
  structuredOutput: { repo_url?: string; pr_url?: string; summary?: string } | null;
}

export interface CreateSessionInput {
  prompt: string;
  title: string;
  tags: string[];
  playbookId?: string;
  maxAcuLimit: number;
}

export interface DevinClient {
  createSession(input: CreateSessionInput): Promise<{ sessionId: string; url: string }>;
  getSession(id: string): Promise<DevinSession>;
}

export class HttpDevinClient implements DevinClient {
  constructor(
    private apiKey: string,
    private orgId: string,
    private fetchFn: typeof fetch = fetch,
    private baseUrl = 'https://api.devin.ai/v3',
  ) {}

  private async call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await this.fetchFn(`${this.baseUrl}/organizations/${this.orgId}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Devin API ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  async createSession(input: CreateSessionInput): Promise<{ sessionId: string; url: string }> {
    const body: Record<string, unknown> = { prompt: input.prompt, title: input.title, tags: input.tags, max_acu_limit: input.maxAcuLimit };
    if (input.playbookId) body.playbook_id = input.playbookId;
    const data = await this.call('POST', '/sessions', body);
    return { sessionId: String(data.session_id ?? data.id), url: String(data.url ?? '') };
  }

  async getSession(id: string): Promise<DevinSession> {
    const d = await this.call('GET', `/sessions/${id}`);
    const prs = Array.isArray(d.pull_requests) ? (d.pull_requests as Record<string, unknown>[]) : [];
    return {
      sessionId: String(d.session_id ?? id),
      url: String(d.url ?? ''),
      status: (d.status as DevinStatus) ?? 'running',
      statusDetail: (d.status_detail as string | null) ?? null,
      pullRequests: prs.map((p) => ({ prUrl: String(p.pr_url ?? p.url ?? ''), prState: (p.pr_state as string | null) ?? null })),
      structuredOutput: (d.structured_output as DevinSession['structuredOutput']) ?? null,
    };
  }
}

/** In-memory Devin used by DEVIN_MOCK=1: finishes with a PR after `ticksToFinish` polls. */
export class FakeDevinClient implements DevinClient {
  sessions = new Map<string, DevinSession & { polls: number; prompt: string }>();
  constructor(private ticksToFinish = 2, private repoOwner = 'shellenwangece') {}

  async createSession(input: CreateSessionInput): Promise<{ sessionId: string; url: string }> {
    const id = `devin-mock-${this.sessions.size + 1}`;
    const url = `https://app.devin.ai/sessions/${id}`;
    this.sessions.set(id, { sessionId: id, url, status: 'running', statusDetail: 'working', pullRequests: [], structuredOutput: null, polls: 0, prompt: input.prompt });
    return { sessionId: id, url };
  }

  async getSession(id: string): Promise<DevinSession> {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`unknown mock session ${id}`);
    s.polls++;
    if (s.polls >= this.ticksToFinish && s.status === 'running') {
      const slug = /^slug:\s*(\S+)/m.exec(s.prompt)?.[1] ?? 'app';
      const repo = `https://github.com/${this.repoOwner}/itp-app-${slug}`;
      s.status = 'exit';
      s.statusDetail = 'finished';
      s.pullRequests = [{ prUrl: `${repo}/pull/1`, prState: 'open' }];
      s.structuredOutput = { repo_url: repo, pr_url: `${repo}/pull/1`, summary: `Built ${slug} from the request.` };
    }
    const { polls: _p, prompt: _q, ...rest } = s;
    return rest;
  }
}
