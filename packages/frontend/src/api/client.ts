const BASE_URL = '/api';

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error((body as any).error ?? res.statusText), { status: res.status });
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  boards: {
    list: (token: string) => request<any[]>('/boards', { token }),
    get: (id: string, token: string) => request<any>(`/boards/${id}`, { token }),
    create: (body: { title: string; groupId?: string }, token: string) =>
      request<any>('/boards', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: { title?: string }, token: string) =>
      request<any>(`/boards/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    delete: (id: string, token: string) =>
      request<void>(`/boards/${id}`, { method: 'DELETE', token }),
    listElements: (id: string, token: string) =>
      request<any[]>(`/boards/${id}/elements`, { token }),
  },
  groups: {
    list: (token: string) => request<any[]>('/groups', { token }),
    create: (body: { name: string }, token: string) =>
      request<any>('/groups', { method: 'POST', body: JSON.stringify(body), token }),
    delete: (id: string, token: string) =>
      request<void>(`/groups/${id}`, { method: 'DELETE', token }),
    listMembers: (id: string, token: string) =>
      request<any[]>(`/groups/${id}/members`, { token }),
    addMember: (id: string, userId: string, token: string) =>
      request<any>(`/groups/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
        token,
      }),
    removeMember: (id: string, userId: string, token: string) =>
      request<void>(`/groups/${id}/members/${userId}`, { method: 'DELETE', token }),
  },
  users: {
    list: (token: string) => request<any[]>('/users', { token }),
    upsertMe: (token: string) =>
      request<void>('/users/me', { method: 'POST', token }),
  },
};
