import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp } from '../src/clientip.js';

function request(ip, forwarded) {
  const headers = {};
  if (forwarded !== undefined) headers['x-forwarded-for'] = forwarded;
  return { method: 'GET', url: '/', headers, socket: { remoteAddress: ip } };
}

test('client IP ignores X-Forwarded-For when proxy trust is off', () => {
  const req = request('10.0.0.5', '203.0.113.7, 10.0.0.5');
  assert.equal(clientIp(req, false), '10.0.0.5');
});

test('client IP uses the leftmost X-Forwarded-For entry when proxy trust is on', () => {
  const req = request('10.0.0.5', '203.0.113.7, 198.51.100.2');
  assert.equal(clientIp(req, true), '203.0.113.7');
});

test('client IP normalizes IPv4-mapped addresses and falls back to the socket', () => {
  assert.equal(clientIp(request('::ffff:10.0.0.5', '::ffff:203.0.113.7'), true), '203.0.113.7');
  assert.equal(clientIp(request('10.0.0.5', '   '), true), '10.0.0.5');
  assert.equal(clientIp(request('10.0.0.5'), true), '10.0.0.5');
  assert.equal(clientIp({ headers: {} }, true), null);
});
