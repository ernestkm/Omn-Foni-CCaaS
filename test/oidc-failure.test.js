import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyAccessToken } from '../src/oidc.js';
import { issuer, audience } from '../src/config.js';
import { setLogWriter } from '../src/log.js';

const ACME = '11111111-1111-1111-1111-111111111111';

async function signedToken() {
  const { privateKey } = await generateKeyPair('RS256');
  return new SignJWT({ tenant_id: ACME, roles: ['agent'] })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime('5m')
    .setSubject('test-subject')
    .sign(privateKey);
}

function caught(promise) {
  return promise.then(() => null, (err) => err);
}

test('JWKS fetch failure maps to 503 and logs without the token', async () => {
  const token = await signedToken();
  const lines = [];
  setLogWriter((line) => lines.push(line));
  try {
    const err = await caught(verifyAccessToken(token, async () => {
      throw new TypeError('fetch failed');
    }));
    assert.equal(err.status, 503);
    assert.equal(err.expose, true);
    const entry = JSON.parse(lines.find((line) => line.includes('oidc.jwks_unavailable')));
    assert.equal(entry.level, 'error');
    assert.equal(entry.event, 'oidc.jwks_unavailable');
    assert.ok(!lines.join('').includes(token));
  } finally {
    setLogWriter(null);
  }
});

test('JWKS endpoint errors also map to 503', async () => {
  const token = await signedToken();
  const err = await caught(verifyAccessToken(token, async () => {
    throw new Error('Expected 200 OK from the JSON Web Key Set HTTP response');
  }));
  assert.equal(err.status, 503);
});

test('token key errors stay 401', async () => {
  const token = await signedToken();
  const err = await caught(verifyAccessToken(token, async () => {
    throw Object.assign(new Error('no applicable key found'), {
      code: 'ERR_JWKS_NO_MATCHING_KEY',
    });
  }));
  assert.equal(err.status, 401);
});
