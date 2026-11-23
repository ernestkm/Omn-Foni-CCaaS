import { registerRoute, withTenant, send, requireUuid, requireText } from '../http.js';

export function registerWidgetRoutes() {
  registerRoute({
    method: 'POST',
    pattern: /^\/api\/widget\/conversations$/,
    roles: ['widget'],
    handler: async (req, res, { tenant, body }) => {
      const displayName = typeof body.displayName === 'string' && body.displayName.trim()
        ? body.displayName.slice(0, 200) : 'Visitor';
      const row = await withTenant(tenant.tenant_id, async (c) => {
        const contact = await c.query(
          'INSERT INTO contacts(tenant_id, display_name) VALUES($1,$2) RETURNING id',
          [tenant.tenant_id, displayName]);
        const conv = await c.query(
          'INSERT INTO conversations(tenant_id, contact_id, channel, status) VALUES($1,$2,$3,$4) RETURNING id, status, created_at',
          [tenant.tenant_id, contact.rows[0].id, 'webchat', 'open']);
        return conv.rows[0];
      });
      send(res, 201, row);
    },
  });

  registerRoute({
    method: 'POST',
    pattern: /^\/api\/widget\/messages$/,
    roles: ['widget'],
    handler: async (req, res, { tenant, body }) => {
      const conversationId = requireUuid(body.conversationId, 'conversationId');
      const text = requireText(body.body, 'body');
      const row = await withTenant(tenant.tenant_id, async (c) => {
        const owns = await c.query('SELECT id FROM conversations WHERE id=$1', [conversationId]);
        if (owns.rows.length === 0) throw Object.assign(new Error('conversation not found'), { status: 404 });
        const msg = await c.query(
          'INSERT INTO messages(tenant_id, conversation_id, direction, sender, body) VALUES($1,$2,$3,$4,$5) RETURNING id, created_at',
          [tenant.tenant_id, conversationId, 'in', 'customer', text]);
        return msg.rows[0];
      });
      send(res, 201, row);
    },
  });
}