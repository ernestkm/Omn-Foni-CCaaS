import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

function caught(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected an error');
}

function productionEnv() {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://svc:strong-secret@db.internal:5432/ccaas',
    KEYCLOAK_ISSUER: 'https://auth.example.test/realms/ccaas',
    KEYCLOAK_JWKS_URL: 'https://auth.example.test/realms/ccaas/protocol/openid-connect/certs',
    KEYCLOAK_AUDIENCE: 'ccaas-spa',
    PUBLIC_BASE_URL: 'https://ofcf.hostedservices.cloud',
  };
}

test('production config lists every missing required variable', () => {
  const err = caught(() => loadConfig({ NODE_ENV: 'production' }));
  for (const name of [
    'DATABASE_URL', 'KEYCLOAK_ISSUER', 'KEYCLOAK_JWKS_URL',
    'KEYCLOAK_AUDIENCE', 'PUBLIC_BASE_URL',
  ]) {
    assert.ok(err.message.includes(name), `missing ${name} in: ${err.message}`);
  }
});

test('production config rejects development credentials and localhost URLs', () => {
  const cases = [
    ['DATABASE_URL', 'postgres://app_user:app_user@localhost:5432/ccaas'],
    ['DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/ccaas'],
    ['DATABASE_URL', 'postgres://app_user:dev-password@localhost:5432/ccaas'],
    ['KEYCLOAK_ISSUER', 'http://localhost:8081/realms/ccaas'],
    ['PUBLIC_BASE_URL', 'http://localhost:8080'],
  ];
  for (const [name, value] of cases) {
    const env = productionEnv();
    env[name] = value;
    const err = caught(() => loadConfig(env));
    assert.match(err.message, /development defaults/, `${name}=${value}`);
  }
});

test('production config enables proxy trust and production rate limits', () => {
  const config = loadConfig(productionEnv());
  assert.equal(config.isProduction, true);
  assert.equal(config.trustProxy, true);
  assert.equal(config.publicBaseUrl, 'https://ofcf.hostedservices.cloud');
  assert.equal(config.rateLimits.enabled, true);
  assert.equal(config.rateLimits.max, 120);
  assert.equal(config.rateLimits.widgetMax, 30);
});

test('rate limiting can be disabled with RATE_LIMIT_ENABLED=false', () => {
  const env = productionEnv();
  env.RATE_LIMIT_ENABLED = 'false';
  assert.equal(loadConfig(env).rateLimits.enabled, false);
});

test('non-production keeps the existing development defaults', () => {
  const config = loadConfig({});
  assert.equal(config.isProduction, false);
  assert.equal(config.port, 8080);
  assert.equal(config.databaseUrl, 'postgres://app_user:app_user@localhost:5432/ccaas');
  assert.equal(config.issuer, 'http://localhost:8081/realms/ccaas');
  assert.equal(config.jwksUrl, 'http://localhost:8081/realms/ccaas/protocol/openid-connect/certs');
  assert.equal(config.audience, 'ccaas-spa');
  assert.equal(config.trustProxy, false);
  assert.ok(config.rateLimits.max >= 1000);
  assert.ok(config.rateLimits.widgetMax >= 1000);
});

test('TRUST_PROXY=true enables proxy trust outside production', () => {
  assert.equal(loadConfig({ TRUST_PROXY: 'true' }).trustProxy, true);
  assert.equal(loadConfig({ TRUST_PROXY: 'false' }).trustProxy, false);
});
