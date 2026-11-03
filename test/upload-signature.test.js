const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const originalEnv = {
  jwtSecret: process.env.JWT_SECRET,
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};
process.env.JWT_SECRET = 'test-jwt-secret-not-for-production';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-api-key';
process.env.CLOUDINARY_API_SECRET = 'test-api-secret';

const User = require('../models/User');
const uploadRoutes = require('../routes/uploadRoutes');
const originalFindById = User.findById;
let currentRole = 'admin';
let server;
let baseUrl;

const tokenFor = (role) => jwt.sign(
  { id: '507f1f77bcf86cd799439011', role, version: 0 },
  process.env.JWT_SECRET
);

const postSignature = (body, role = currentRole) => fetch(`${baseUrl}/uploads/signature`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(role && { 'x-auth-token': tokenFor(role) }),
  },
  body: JSON.stringify(body),
});

before(async () => {
  User.findById = () => ({
    select: async () => ({ role: currentRole, tokenVersion: 0 }),
  });
  const app = express();
  app.use(express.json());
  app.use('/uploads', uploadRoutes);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => (
      server.close((error) => error ? reject(error) : resolve())
    ));
  }
  User.findById = originalFindById;
  for (const [key, value] of Object.entries({
    JWT_SECRET: originalEnv.jwtSecret,
    CLOUDINARY_CLOUD_NAME: originalEnv.cloudName,
    CLOUDINARY_API_KEY: originalEnv.apiKey,
    CLOUDINARY_API_SECRET: originalEnv.apiSecret,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('upload signatures require authentication', async () => {
  const response = await postSignature({ purpose: 'gallery' }, null);
  assert.equal(response.status, 401);
});

test('rejects unsupported purpose and resource types', async () => {
  const invalidPurpose = await postSignature({ purpose: 'unknown' });
  assert.equal(invalidPurpose.status, 400);

  const invalidResourceType = await postSignature({ purpose: 'event', resourceType: 'raw' });
  assert.equal(invalidResourceType.status, 400);

  const wrongPurposeForVideo = await postSignature({ purpose: 'gallery', resourceType: 'video' });
  assert.equal(wrongPurposeForVideo.status, 400);
});

test('limits image and video upload purposes to their authorized roles', async () => {
  currentRole = 'alumni';
  const deniedGallery = await postSignature({ purpose: 'gallery', resourceType: 'image' });
  assert.equal(deniedGallery.status, 403);

  const profile = await postSignature({ purpose: 'alumni-profile', resourceType: 'image' });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).resourceType, 'image');

  currentRole = 'admin';
  const eventVideo = await postSignature({ purpose: 'event', resourceType: 'video' });
  assert.equal(eventVideo.status, 200);
  const result = await eventVideo.json();
  assert.equal(result.resourceType, 'video');
  assert.deepEqual(result.allowedFormats, ['mp4', 'mov', 'mkv']);
});
