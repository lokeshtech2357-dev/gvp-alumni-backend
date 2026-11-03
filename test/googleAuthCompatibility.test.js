const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OAuth2Client } = require('google-auth-library');

test('Google Auth Library retains the ID token verification API used by login', () => {
  const client = new OAuth2Client('test-client-id');
  assert.equal(typeof client.verifyIdToken, 'function');
});
