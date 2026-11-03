const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = '';

const app = require('../api/index');
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('health endpoint responds without a database connection', async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});

test('local contact endpoint starts with empty fallback data', async () => {
  const response = await fetch(`${baseUrl}/api/contacts`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, []);
});

test('database-backed routes fail explicitly when MongoDB is not configured', async () => {
  const response = await fetch(`${baseUrl}/api/events`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).message, 'Database unavailable.');
});
