import { withTenant } from './db.js';

export function sourceIp(req) {
  return req.socket?.remoteAddress || null;
}

export async function recordAudit(tenantId, { actor, action, target, sourceIp: ip }) {
  await withTenant(tenantId, (c) => c.query(
    'INSERT INTO audit_events(tenant_id, actor, action, target, source_ip) VALUES($1,$2,$3,$4,$5)',
    [tenantId, actor, action, target ?? null, ip ?? null]));
}
