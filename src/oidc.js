import { createRemoteJWKSet, jwtVerify } from 'jose';

const ISSUER = process.env.KEYCLOAK_ISSUER || 'http://localhost:8081/realms/ccaas';
const JWKS_URL = process.env.KEYCLOAK_JWKS_URL || `${ISSUER}/protocol/openid-connect/certs`;
const AUDIENCE = process.env.KEYCLOAK_AUDIENCE || 'ccaas-spa';
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export async function verifyAccessToken(token, jwks = JWKS) {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['RS256'],
    });
    const roles = Array.isArray(payload.roles) ? payload.roles : [];
    const role = roles.includes('admin') ? 'admin' : roles.includes('agent') ? 'agent' : null;
    if (typeof payload.tenant_id !== 'string' || !role) {
      throw new Error('token missing tenant_id or role');
    }
    return { tenant_id: payload.tenant_id, role, sub: payload.sub };
  } catch (err) {
    throw Object.assign(new Error('invalid access token'), { status: 401 });
  }
}
