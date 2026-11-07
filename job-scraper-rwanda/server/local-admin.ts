import type { RequestHandler } from 'express';
import { isAdminResource } from '../src/lib/admin-resources.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Local admin UI only: reject network exposure, DNS rebinding and cross-site calls. */
export function localAdminBoundary(port: number): RequestHandler {
  return (req, res, next) => {
    const reject = () => { res.status(403).json({ error: 'Local dashboard access only.' }); };
    if (!LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '')) return reject();
    let base: URL;
    try { base = new URL(`http://${req.headers.host ?? ''}`); } catch { return reject(); }
    if (!LOOPBACK_HOSTS.has(base.hostname) || base.port !== String(port) || base.username || base.password) return reject();
    if (req.headers.origin && req.headers.origin !== base.origin) return reject();
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return reject();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) return reject();
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
}

export function localDatabaseGateway(databaseUrl: string | undefined, serviceKey: string | undefined, nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis)): RequestHandler {
  return async (req, res) => {
    if (req.headers['x-kazio-local-admin'] !== '1') return void res.status(403).json({ error: 'Local admin header required.' });
    if (!databaseUrl || !serviceKey) return void res.status(503).json({ error: 'Server-side database access is not configured.' });
    const { resource, method, body, headers: requestedHeaders } = req.body ?? {};
    if (typeof resource !== 'string' || typeof method !== 'string' || !isAdminResource(resource, method) || typeof body !== 'string') {
      return void res.status(400).json({ error: 'Unsupported admin operation.' });
    }
    const headers = new Headers({ 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` });
    for (const name of ['prefer', 'accept', 'range', 'range-unit']) {
      const value = requestedHeaders?.[name];
      if (typeof value === 'string' && value.length < 2048) headers.set(name, value);
    }
    try {
      const upstream = await nativeFetch(new URL(resource, databaseUrl), {
        method, headers, body: body || undefined, redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
      for (const name of ['content-type', 'content-range', 'preference-applied', 'range-unit']) {
        const value = upstream.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      res.status(upstream.status);
      if (upstream.status === 204) res.end();
      else res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      res.status(502).json({ error: 'The admin database operation could not be completed.' });
    }
  };
}
