const REQUIRED_PROD_VARS = [
  'DATABASE_URL',
  'KEYCLOAK_ISSUER',
  'KEYCLOAK_JWKS_URL',
  'KEYCLOAK_AUDIENCE',
  'PUBLIC_BASE_URL',
];

const DEV_DEFAULTS = {
  port: 8080,
  databaseUrl: 'postgres://app_user:app_user@localhost:5432/ccaas',
  issuer: 'http://localhost:8081/realms/ccaas',
  audience: 'ccaas-spa',
  publicBaseUrl: 'http://localhost:8080',
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function envValue(env, name, fallback) {
  const value = env[name];
  return hasValue(value) ? value : fallback;
}

function parseBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isLocalUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return LOCAL_HOSTS.has(host);
  } catch {
    return false;
  }
}

function assertAbsoluteUrl(name, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL`);
  }
}

export function loadConfig(env = process.env) {
  const isProduction = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';

  if (isProduction) {
    const missing = REQUIRED_PROD_VARS.filter((name) => !hasValue(env[name]));
    if (missing.length > 0) {
      throw new Error(`production configuration missing required environment variables: ${missing.join(', ')}`);
    }
  }

  const port = parsePositiveInt(env.PORT, DEV_DEFAULTS.port);
  const databaseUrl = envValue(env, 'DATABASE_URL', DEV_DEFAULTS.databaseUrl);
  const issuer = envValue(env, 'KEYCLOAK_ISSUER', DEV_DEFAULTS.issuer);
  const audience = envValue(env, 'KEYCLOAK_AUDIENCE', DEV_DEFAULTS.audience);
  const publicBaseUrl = envValue(env, 'PUBLIC_BASE_URL', DEV_DEFAULTS.publicBaseUrl);
  const jwksUrl = envValue(env, 'KEYCLOAK_JWKS_URL', `${issuer}/protocol/openid-connect/certs`);
  const tokenUrl = envValue(env, 'KEYCLOAK_TOKEN_URL', `${issuer}/protocol/openid-connect/token`);

  if (isProduction) {
    assertAbsoluteUrl('KEYCLOAK_ISSUER', issuer);
    assertAbsoluteUrl('KEYCLOAK_JWKS_URL', jwksUrl);
    assertAbsoluteUrl('PUBLIC_BASE_URL', publicBaseUrl);

    const problems = [];
    if (/app_user:app_user|postgres:postgres|dev-password/i.test(databaseUrl)) {
      problems.push('DATABASE_URL uses a development credential');
    }
    if (isLocalUrl(issuer)) problems.push('KEYCLOAK_ISSUER points to localhost');
    if (isLocalUrl(jwksUrl)) problems.push('KEYCLOAK_JWKS_URL points to localhost');
    if (isLocalUrl(publicBaseUrl)) problems.push('PUBLIC_BASE_URL points to localhost');
    if (problems.length > 0) {
      throw new Error(`production configuration rejects development defaults: ${problems.join('; ')}`);
    }
  }

  return {
    isProduction,
    port,
    databaseUrl,
    issuer,
    jwksUrl,
    audience,
    tokenUrl,
    publicBaseUrl,
    trustProxy: isProduction || parseBool(env.TRUST_PROXY, false),
    rateLimits: {
      enabled: parseBool(env.RATE_LIMIT_ENABLED, true),
      windowMs: parsePositiveInt(env.RATE_LIMIT_WINDOW_MS, 60_000),
      max: parsePositiveInt(env.RATE_LIMIT_MAX, isProduction ? 120 : 10_000),
      widgetMax: parsePositiveInt(env.RATE_LIMIT_WIDGET_MAX, isProduction ? 30 : 5_000),
    },
  };
}

export const config = loadConfig();
export const isProduction = config.isProduction;
export const {
  port,
  databaseUrl,
  issuer,
  jwksUrl,
  audience,
  tokenUrl,
  publicBaseUrl,
  trustProxy,
  rateLimits,
} = config;
