import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwt, exportJWK, generateKeyPair, createLocalJWKSet, SignJWT } from 'jose';
import { agentJwt, ensureKeycloak, ACME } from './helpers.js';

before(async () => { await ensureKeycloak(); });

test('keycloak issues an access token with tenant_id and roles', async () => {
  const token = await agentJwt('acme-agent');
  const claims = decodeJwt(token);
  assert.equal(claims.tenant_id, ACME);
  assert.ok(Array.isArray(claims.roles));
  assert.ok(claims.roles.includes('agent'));
  assert.ok(claims.sub);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  assert.ok(audiences.includes('ccaas-spa'));
});

import { verifyAccessToken } from '../src/oidc.js';

const ISSUER = process.env.KEYCLOAK_ISSUER || 'http://localhost:8081/realms/ccaas';
const AUDIENCE = 'ccaas-spa';

async function localSigner() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwks = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
  return { jwks, privateKey };
}

async function signClaims(privateKey, claims, issuer = ISSUER, audience = AUDIENCE, subject = 'test-subject') {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime('5m');
  if (subject !== null) jwt.setSubject(subject);
  return jwt.sign(privateKey);
}

test('verifyAccessToken returns tenant, role, sub for a valid token', async () => {
  const token = await agentJwt('acme-agent');
  const principal = await verifyAccessToken(token);
  assert.equal(principal.tenant_id, ACME);
  assert.equal(principal.role, 'agent');
  assert.ok(principal.sub);
});

test('verifyAccessToken maps admin role', async () => {
  const token = await agentJwt('acme-admin');
  const principal = await verifyAccessToken(token);
  assert.equal(principal.role, 'admin');
});

test('verifyAccessToken rejects garbage', async () => {
  await assert.rejects(verifyAccessToken('not-a-jwt'), (err) => err.status === 401);
});

test('verifyAccessToken rejects a tampered signature', async () => {
  const parts = (await agentJwt('acme-agent')).split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  await assert.rejects(verifyAccessToken(parts.join('.')), (err) => err.status === 401);
});

test('verifyAccessToken rejects the wrong issuer', async () => {
  const { jwks, privateKey } = await localSigner();
  const token = await signClaims(privateKey, { tenant_id: ACME, roles: ['agent'] }, 'http://evil.example/realms/ccaas');
  await assert.rejects(verifyAccessToken(token, jwks), (err) => err.status === 401);
});

test('verifyAccessToken rejects an expired token', async () => {
  const { jwks, privateKey } = await localSigner();
  const token = await new SignJWT({ tenant_id: ACME, roles: ['agent'] })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(1)
    .setSubject('test-subject')
    .sign(privateKey);
  await assert.rejects(verifyAccessToken(token, jwks), (err) => err.status === 401);
});

test('verifyAccessToken rejects a token without tenant_id', async () => {
  const { jwks, privateKey } = await localSigner();
  const token = await signClaims(privateKey, { roles: ['agent'] });
  await assert.rejects(verifyAccessToken(token, jwks), (err) => err.status === 401);
});

test('verifyAccessToken rejects a token without a known role', async () => {
  const { jwks, privateKey } = await localSigner();
  const token = await signClaims(privateKey, { tenant_id: ACME, roles: ['guest'] });
  await assert.rejects(verifyAccessToken(token, jwks), (err) => err.status === 401);
});

test('verifyAccessToken rejects a token without sub', async () => {
  const { jwks, privateKey } = await localSigner();
  const token = await signClaims(privateKey, { tenant_id: ACME, roles: ['agent'] }, ISSUER, AUDIENCE, null);
  await assert.rejects(verifyAccessToken(token, jwks), (err) => err.status === 401);
});

test('verifyAccessToken rejects a token with an empty sub', async () => {
  const { jwks, privateKey } = await localSigner();
  const token = await signClaims(privateKey, { tenant_id: ACME, roles: ['agent'] }, ISSUER, AUDIENCE, '');
  await assert.rejects(verifyAccessToken(token, jwks), (err) => err.status === 401);
});

test('verifyAccessToken rejects a non-UUID tenant_id', async () => {
  const { jwks, privateKey } = await localSigner();
  const token = await signClaims(privateKey, { tenant_id: 'acme', roles: ['agent'] });
  await assert.rejects(verifyAccessToken(token, jwks), (err) => err.status === 401);
});

test('verifyAccessToken rejects the wrong audience', async () => {
  const { jwks, privateKey } = await localSigner();
  const token = await signClaims(privateKey, { tenant_id: ACME, roles: ['agent'] }, ISSUER, 'other-audience');
  await assert.rejects(verifyAccessToken(token, jwks), (err) => err.status === 401);
});
