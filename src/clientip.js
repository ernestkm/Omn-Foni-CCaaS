import { trustProxy as configuredTrustProxy } from './config.js';

function normalize(ip) {
  const text = String(ip).trim();
  return text.startsWith('::ffff:') ? text.slice(7) : text;
}

export function clientIp(req, trustProxy = configuredTrustProxy) {
  const remote = req?.socket?.remoteAddress || null;
  if (!trustProxy || !req?.headers) return remote;

  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  if (typeof raw !== 'string') return remote;

  const leftmost = raw.split(',').map((entry) => normalize(entry)).find(Boolean);
  return leftmost || remote;
}
