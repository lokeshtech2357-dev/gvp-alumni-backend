const { URL } = require('url');
const cloudinary = require('../config/cloudinary');

const createUploadError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const verifyCloudinaryUpload = async ({ imageUrl, filename, expectedFolder, resourceType = 'image' }) => {
  if (typeof imageUrl !== 'string' || typeof filename !== 'string' || !imageUrl || !filename) {
    throw createUploadError('A Cloudinary image URL and public ID are required.', 400);
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw createUploadError('Cloudinary uploads are not configured.', 503);
  }

  const expectedPublicIdPrefix = `${expectedFolder}/upload-`;
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
    const folderPrefix = `/${expectedFolder}/`;
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
    if (resource.public_id !== filename || resource.secure_url !== imageUrl) {
      throw createUploadError('The uploaded file could not be verified.', 400);
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

module.exports = { verifyCloudinaryUpload };
