export interface Me { id: string; name: string; role: 'requester' | 'approver' | 'admin' | 'app_user'; team: string }
export interface Grant { dataset: string; permission: 'read' | 'write' }
export interface CatalogApp { id: number; slug: string; name: string; description: string; kind: 'external' | 'built'; url: string | null; owner: string; teams: string[]; repo: string | null; liveSha: string | null; status: string; grants: Grant[] }
export interface AppRequest { id: number; requesterId: string; requesterName: string; name: string; slug: string; description: string; teams: string[]; grants: Grant[]; status: string; gate1By: string | null; gate1Comment: string | null; gate2By: string | null; devinUrl: string | null; devinStatus: string | null; devinStatusDetail: string | null; prUrl: string | null; repoUrl: string | null; previewSha: string | null; failureReason: string | null; createdAt: string; updatedAt: string }
export interface Dataset { name: string; label: string; description: string; primaryKey: string; columns: { name: string; type: string }[]; rowCount: number; sample: Record<string, unknown>[] }

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) }, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body });
  if (res.status === 401) { window.location.assign('/'); throw new ApiError(401, 'Please sign in'); }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const STATUS_LABEL: Record<string, string> = {
  pending_review: 'Waiting for approval',
  rejected: 'Not approved',
  building: 'Devin is building your app',
  build_failed: 'Build needs attention',
  ready_for_review: 'Ready for review',
  live: 'Live',
  unpublished: 'Taken offline',
};
