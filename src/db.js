import pg from 'pg';
import { databaseUrl } from './config.js';

export const pool = new pg.Pool({ connectionString: databaseUrl });

export async function resolveToken(hash) {
  const { rows } = await pool.query('SELECT tenant_id, role FROM resolve_token($1)', [hash]);
  return rows[0] || null;
}

export async function withTenant(tenantId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}