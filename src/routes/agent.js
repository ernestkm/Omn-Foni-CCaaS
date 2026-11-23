import { registerRoute, withTenant, send, requireUuid, requireText } from '../http.js';

async function assertOwnership(client, conversationId) {
  const { rows } = await client.query('SELECT id FROM conversations WHERE id=$1', [conversationId]);
  if (rows.length === 0) throw Object.assign(new Error('conversation not found'), { status: 404 });
}

export function registerAgentRoutes() {
  registerRoute({
    method: 'GET',
    pattern: /^\/api\/agent\/conversations$/,
    roles: ['agent', 'admin'],
    handler: async (req, res, { tenant }) => {
      const rows = await withTenant(tenant.tenant_id, async (c) => {
        const { rows } = await c.query('SELECT id, status, channel, created_at FROM conversations ORDER BY created_at DESC LIMIT 100');
        return rows;
      });
      send(res, 200, { conversations: rows });
    },
  });

  registerRoute({
    method: 'GET',
    pattern: /^\/api\/agent\/conversations\/(?<id>[^/]+)\/messages$/,
    roles: ['agent', 'admin'],
    handler: async (req, res, { tenant, params }) => {
      const id = requireUuid(params.id, 'id');
      const rows = await withTenant(tenant.tenant_id, async (c) => {
        await assertOwnership(c, id);
        const { rows } = await c.query('SELECT id, direction, sender, body, created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC', [id]);
        return rows;
      });
      send(res, 200, { messages: rows });
    },
  });

  registerRoute({
    method: 'POST',
    pattern: /^\/api\/agent\/conversations\/(?<id>[^/]+)\/messages$/,
    roles: ['agent', 'admin'],
    handler: async (req, res, { tenant, params, body }) => {
      const id = requireUuid(params.id, 'id');
      const text = requireText(body.body, 'body');
      const row = await withTenant(tenant.tenant_id, async (c) => {
        await assertOwnership(c, id);
        const { rows } = await c.query(
          'INSERT INTO messages(tenant_id, conversation_id, direction, sender, body) VALUES($1,$2,$3,$4,$5) RETURNING id, created_at',
          [tenant.tenant_id, id, 'out', 'agent', text]);
        return rows[0];
      });
      send(res, 201, row);
    },
  });
}