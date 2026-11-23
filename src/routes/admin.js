import { randomBytes } from 'node:crypto';
import { registerRoute, withTenant, send } from '../http.js';
import { hashToken } from '../auth.js';
import { sourceIp } from '../audit.js';

export function registerAdminRoutes() {
  registerRoute({
    method: 'POST',
    pattern: /^\/api\/admin\/tokens\/rotate$/,
    auth: 'oidc',
    roles: ['admin'],
    handler: async (req, res, { tenant }) => {
      const newToken = 'widget-' + randomBytes(24).toString('hex');
      await withTenant(tenant.tenant_id, async (c) => {
        await c.query("DELETE FROM api_tokens WHERE tenant_id=$1 AND role='widget'", [tenant.tenant_id]);
        await c.query('INSERT INTO api_tokens(tenant_id, token_hash, role) VALUES($1,$2,$3)',
          [tenant.tenant_id, hashToken(newToken), 'widget']);
        await c.query('INSERT INTO audit_events(tenant_id, actor, action, target, source_ip) VALUES($1,$2,$3,$4,$5)',
          [tenant.tenant_id, tenant.sub, 'token.rotate', 'widget', sourceIp(req)]);
      });
      send(res, 200, { token: newToken });
    },
  });
}
