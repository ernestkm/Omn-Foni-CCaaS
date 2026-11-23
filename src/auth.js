import { createHash } from 'node:crypto';
import { resolveToken } from './db.js';
import { verifyAccessToken } from './oidc.js';

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function authenticate(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  return resolveToken(hashToken(match[1]));
}

export async function authenticateOidc(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try { return await verifyAccessToken(match[1]); } catch { return null; }
}