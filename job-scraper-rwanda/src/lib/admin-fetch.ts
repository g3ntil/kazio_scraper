import { isAdminResource } from './admin-resources';

/** Route existing dashboard mutations through its local server, never a browser secret. */
export function createDashboardFetch(databaseUrl: string, nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis)): typeof fetch {
  const databaseOrigin = new URL(databaseUrl).origin;
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const resource = url.pathname + url.search;
    if (typeof window === 'undefined' || url.origin !== databaseOrigin || !isAdminResource(resource, request.method)) {
      return nativeFetch(input, init);
    }
    // Do not include the browser's API key/JWT in the envelope.
    const headers: Record<string, string> = {};
    for (const name of ['prefer', 'accept', 'range', 'range-unit']) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }
    return nativeFetch(new URL('/api/admin/database', window.location.origin), {
      method: 'POST', credentials: 'same-origin', signal: request.signal,
      headers: { 'Content-Type': 'application/json', 'X-Kazio-Local-Admin': '1' },
      body: JSON.stringify({ resource, method: request.method, headers, body: await request.text() }),
    });
  };
}
