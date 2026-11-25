import { createRemoteJWKSet, jwtVerify } from 'jose';
import { UUID_RE } from './http.js';
import { issuer, jwksUrl, audience } from './config.js';
import { log } from './log.js';

const JWKS = createRemoteJWKSet(new URL(jwksUrl));

function unavailable(err) {
  log('error', 'oidc.jwks_unavailable', {
    reason: err?.message || err?.name || 'unknown error',
    code: err?.code ?? null,
  });
  return Object.assign(new Error('identity provider unavailable'), { status: 503, expose: true });
}

export async function verifyAccessToken(token, jwks = JWKS) {
  let jwksError = null;
  const watchedJwks = async (...args) => {
    try {
      return await jwks(...args);
    } catch (err) {
      jwksError = err;
      throw err;
    }
  };

  let payload;
  try {
    ({ payload } = await jwtVerify(token, watchedJwks, {
      issuer,
      audience,
      algorithms: ['RS256'],
    }));
  } catch {
    if (jwksError && jwksError?.code !== 'ERR_JWKS_NO_MATCHING_KEY'
      && jwksError?.code !== 'ERR_JWKS_MULTIPLE_MATCHING_KEYS') {
      throw unavailable(jwksError);
    }
    throw Object.assign(new Error('invalid access token'), { status: 401 });
  }

  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  const role = roles.includes('admin') ? 'admin' : roles.includes('agent') ? 'agent' : null;
  if (!role || typeof payload.sub !== 'string' || payload.sub.trim().length === 0
    || typeof payload.tenant_id !== 'string' || !UUID_RE.test(payload.tenant_id)) {
    throw Object.assign(new Error('invalid access token'), { status: 401 });
  }
  return { tenant_id: payload.tenant_id, role, sub: payload.sub };
}
