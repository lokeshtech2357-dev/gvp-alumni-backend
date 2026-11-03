const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const cloudinary = require('../config/cloudinary');
const { verifyCloudinaryUpload, verifyCloudinaryUploadUrl } = require('../utils/cloudinaryUpload');

const originalEnv = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};
const originalResource = cloudinary.api.resource;
const uploadId = '123e4567-e89b-12d3-a456-426614174000';

before(() => {
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-api-key';
  process.env.CLOUDINARY_API_SECRET = 'test-api-secret';
});

after(() => {
  cloudinary.api.resource = originalResource;
  for (const [key, value] of Object.entries({
    CLOUDINARY_CLOUD_NAME: originalEnv.cloudName,
    CLOUDINARY_API_KEY: originalEnv.apiKey,
    CLOUDINARY_API_SECRET: originalEnv.apiSecret,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const uploadFixture = ({ purpose = 'gallery', resourceType = 'image', bytes = 1024, format = 'jpg' } = {}) => {
  const folder = {
    gallery: 'gvp/gallery',
    event: 'gvp/events',
    sponsor: 'gvp/sponsors',
    entrepreneur: 'gvp/entrepreneurs',
    'alumni-profile': 'gvp/alumni-profiles',
  }[purpose];
  const filename = `${folder}/upload-${uploadId}`;
  const imageUrl = `https://res.cloudinary.com/test-cloud/${resourceType}/upload/v123/${filename}.${format}`;
  return {
    purpose,
    resourceType,
    filename,
    imageUrl,
    resource: {
      public_id: filename,
      secure_url: imageUrl,
      resource_type: resourceType,
      bytes,
      format,
    },
  };
};

const mockResource = (resource) => {
  cloudinary.api.resource = async () => resource;
};

test('accepts a verified image at its configured purpose limit', async () => {
  const upload = uploadFixture({ purpose: 'sponsor', bytes: 6 * 1024 * 1024 });
  mockResource(upload.resource);

  const result = await verifyCloudinaryUpload({
    imageUrl: upload.imageUrl,
    filename: upload.filename,
    purpose: upload.purpose,
  });

  assert.equal(result.bytes, 6 * 1024 * 1024);
});

test('rejects a Cloudinary asset larger than its purpose limit', async () => {
  const upload = uploadFixture({ purpose: 'sponsor', bytes: 6 * 1024 * 1024 + 1 });
  mockResource(upload.resource);

  await assert.rejects(
    verifyCloudinaryUpload({
      imageUrl: upload.imageUrl,
      filename: upload.filename,
      purpose: upload.purpose,
    }),
    (error) => error.statusCode === 413
  );
});

test('rejects a video resource for purposes that only allow images', async () => {
  const upload = uploadFixture({ purpose: 'sponsor', resourceType: 'video', format: 'mp4' });
  let cloudinaryCalled = false;
  cloudinary.api.resource = async () => {
    cloudinaryCalled = true;
    return upload.resource;
  };

  await assert.rejects(
    verifyCloudinaryUpload({
      imageUrl: upload.imageUrl,
      filename: upload.filename,
      purpose: upload.purpose,
      resourceType: upload.resourceType,
    }),
    (error) => error.statusCode === 400
  );
  assert.equal(cloudinaryCalled, false);
});

test('rejects invalid Cloudinary resource metadata and file formats', async () => {
  const upload = uploadFixture({ purpose: 'gallery' });
  mockResource({ ...upload.resource, resource_type: 'video' });
  await assert.rejects(
    verifyCloudinaryUpload({
      imageUrl: upload.imageUrl,
      filename: upload.filename,
      purpose: upload.purpose,
    }),
    (error) => error.statusCode === 400
  );

  mockResource({ ...upload.resource, format: 'svg' });
  await assert.rejects(
    verifyCloudinaryUpload({
      imageUrl: upload.imageUrl,
      filename: upload.filename,
      purpose: upload.purpose,
    }),
    (error) => error.statusCode === 400
  );
});

test('verifies event videos by URL and enforces the event upload limit', async () => {
  const upload = uploadFixture({
    purpose: 'event',
    resourceType: 'video',
    bytes: 50 * 1024 * 1024 + 1,
    format: 'mp4',
  });
  mockResource(upload.resource);

  await assert.rejects(
    verifyCloudinaryUploadUrl({ imageUrl: upload.imageUrl, purpose: 'event' }),
    (error) => error.statusCode === 413
  );
});

test('rejects an asset URL from a different upload purpose', async () => {
  const upload = uploadFixture({ purpose: 'sponsor' });
  let cloudinaryCalled = false;
  cloudinary.api.resource = async () => {
    cloudinaryCalled = true;
    return upload.resource;
  };

  await assert.rejects(
    verifyCloudinaryUploadUrl({ imageUrl: upload.imageUrl, purpose: 'event' }),
    (error) => error.statusCode === 400
  );
  assert.equal(cloudinaryCalled, false);
});

test('rejects Cloudinary resource responses without a verifiable byte size', async () => {
  const upload = uploadFixture({ purpose: 'gallery' });
  mockResource({ ...upload.resource, bytes: undefined });

  await assert.rejects(
    verifyCloudinaryUpload({
      imageUrl: upload.imageUrl,
      filename: upload.filename,
      purpose: upload.purpose,
    }),
    (error) => error.statusCode === 503
  );
});
