const { URL } = require('url');
const cloudinary = require('../config/cloudinary');
const uploadPolicies = require('../config/uploadPolicies');

const createUploadError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const verifyCloudinaryUpload = async ({ imageUrl, filename, purpose, resourceType = 'image' }) => {
  if (typeof imageUrl !== 'string' || typeof filename !== 'string' || !imageUrl || !filename) {
    throw createUploadError('A Cloudinary image URL and public ID are required.', 400);
  }

  const policy = uploadPolicies[purpose];
  if (!policy) throw createUploadError('Unsupported upload purpose.', 400);
  if (resourceType !== 'image' && resourceType !== 'video') {
    throw createUploadError('Unsupported upload resource type.', 400);
  }
  if (resourceType === 'video' && purpose !== 'event') {
    throw createUploadError('Video uploads are only supported for events.', 400);
  }
  const allowedFormats = Array.isArray(policy.formats) ? policy.formats : policy.formats[resourceType];
  if (!allowedFormats) throw createUploadError('Unsupported upload resource type for this purpose.', 400);

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw createUploadError('Cloudinary uploads are not configured.', 503);
  }

  const expectedPublicIdPrefix = `${policy.folder}/upload-`;
  const uploadId = filename.slice(expectedPublicIdPrefix.length);
  if (!filename.startsWith(expectedPublicIdPrefix) || !/^[0-9a-f-]{36}$/.test(uploadId)) {
    throw createUploadError('The uploaded file does not match the requested upload folder.', 400);
  }

  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    throw createUploadError('The uploaded file URL is invalid.', 400);
  }

  const uploadPrefix = `/${cloudName}/${resourceType}/upload/`;
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !url.pathname.startsWith(uploadPrefix)) {
    throw createUploadError('The uploaded file URL does not belong to the configured Cloudinary account.', 400);
  }

  let urlPublicId;
  try {
    const folderPrefix = `/${policy.folder}/`;
    const folderIndex = url.pathname.lastIndexOf(folderPrefix);
    if (folderIndex === -1) throw new Error('Missing upload folder.');
    urlPublicId = decodeURIComponent(url.pathname.slice(folderIndex + 1)).replace(/\.[^/.]+$/, '');
  } catch {
    throw createUploadError('The uploaded file URL and public ID do not match.', 400);
  }
  if (url.search || url.hash || urlPublicId !== filename) {
    throw createUploadError('The uploaded file URL and public ID do not match.', 400);
  }

  try {
    const resource = await cloudinary.api.resource(filename, { resource_type: resourceType });
    if (
      resource.public_id !== filename ||
      resource.secure_url !== imageUrl ||
      resource.resource_type !== resourceType
    ) {
      throw createUploadError('The uploaded file could not be verified.', 400);
    }
    if (!Number.isSafeInteger(resource.bytes) || resource.bytes < 0) {
      throw createUploadError('Cloudinary did not return a valid file size.', 503);
    }
    if (resource.bytes > policy.maxFileSize) {
      throw createUploadError(
        `The uploaded file exceeds the ${Math.floor(policy.maxFileSize / (1024 * 1024))} MB upload limit.`,
        413
      );
    }
    if (typeof resource.format !== 'string' || !allowedFormats.includes(resource.format.toLowerCase())) {
      throw createUploadError('The uploaded file format is not allowed for this purpose.', 400);
    }
    return resource;
  } catch (error) {
    if (error.statusCode) throw error;
    if (error.http_code === 404) {
      throw createUploadError('The uploaded file was not found in Cloudinary.', 400);
    }
    console.error('Cloudinary asset verification failed:', error.message);
    throw createUploadError('Unable to verify the uploaded file with Cloudinary.', 503);
  }
};

const verifyCloudinaryUploadUrl = async ({ imageUrl, purpose }) => {
  if (typeof imageUrl !== 'string') {
    throw createUploadError('A Cloudinary image URL is required.', 400);
  }

  const policy = uploadPolicies[purpose];
  if (!policy) throw createUploadError('Unsupported upload purpose.', 400);

  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    throw createUploadError('The uploaded file URL is invalid.', 400);
  }
  if (url.hostname !== 'res.cloudinary.com') return null;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const resourceTypePrefix = `/${cloudName}/`;
  if (!cloudName || !url.pathname.startsWith(resourceTypePrefix)) {
    throw createUploadError('The uploaded file URL does not belong to the configured Cloudinary account.', 400);
  }

  const resourcePath = url.pathname.slice(resourceTypePrefix.length);
  const resourceType = resourcePath.startsWith('image/upload/')
    ? 'image'
    : resourcePath.startsWith('video/upload/')
      ? 'video'
      : null;
  if (!resourceType) {
    throw createUploadError('The uploaded file URL has an unsupported resource type.', 400);
  }

  const folderPrefix = `/${policy.folder}/`;
  const folderIndex = url.pathname.lastIndexOf(folderPrefix);
  if (folderIndex === -1) {
    throw createUploadError('The uploaded file does not match the requested upload purpose.', 400);
  }

  let filename;
  try {
    filename = `${policy.folder}/${decodeURIComponent(url.pathname.slice(folderIndex + folderPrefix.length))
      .replace(/\.[^/.]+$/, '')}`;
  } catch {
    throw createUploadError('The uploaded file URL is invalid.', 400);
  }

  return verifyCloudinaryUpload({ imageUrl, filename, purpose, resourceType });
};

module.exports = { verifyCloudinaryUpload, verifyCloudinaryUploadUrl };
