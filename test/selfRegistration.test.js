const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { register } = require('../controllers/authController');

const responseStub = () => ({
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('self-registration creates an alumni account without official record verification', async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'registration-test-secret';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  t.mock.method(User, 'findOne', async () => null);
  t.mock.method(User, 'create', async (user) => ({ ...user, _id: 'new-alumni-id' }));
  t.mock.method(bcrypt, 'hash', async () => 'hashed-password');

  const response = responseStub();
  await register({
    body: {
      name: ' New Alumni ',
      email: ' New.Alumni@Example.com ',
      password: 'secure-password',
      confirmPassword: 'secure-password',
    },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.user.role, 'alumni');
  assert.equal(response.body.user.email, 'new.alumni@example.com');
  assert.equal(response.body.token.split('.').length, 3);
  assert.equal(User.create.mock.calls[0].arguments[0].password, 'hashed-password');
  assert.equal(User.create.mock.calls[0].arguments[0].officialAlumniRecordId, undefined);
});

test('self-registration rejects an email that already has an account', async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'registration-test-secret';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  t.mock.method(User, 'findOne', async () => ({ _id: 'existing-id' }));
  const create = t.mock.method(User, 'create', async () => {
    throw new Error('Should not create a duplicate account.');
  });
  const response = responseStub();

  await register({
    body: {
      name: 'Existing Alumni',
      email: 'existing@example.com',
      password: 'secure-password',
      confirmPassword: 'secure-password',
    },
  }, response);

  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /already exists/i);
  assert.equal(create.mock.callCount(), 0);
});
