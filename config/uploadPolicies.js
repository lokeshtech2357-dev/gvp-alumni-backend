module.exports = {
  gallery: {
    folder: 'gvp/gallery',
    formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxFileSize: 20 * 1024 * 1024,
  },
  event: {
    folder: 'gvp/events',
    formats: {
      image: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      video: ['mp4', 'mov', 'mkv'],
    },
    maxFileSize: 50 * 1024 * 1024,
  },
  sponsor: {
    folder: 'gvp/sponsors',
    formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxFileSize: 6 * 1024 * 1024,
  },
  entrepreneur: {
    folder: 'gvp/entrepreneurs',
    formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxFileSize: 5 * 1024 * 1024,
  },
  'alumni-profile': {
    folder: 'gvp/alumni-profiles',
    formats: ['jpg', 'jpeg', 'png', 'webp'],
    maxFileSize: 5 * 1024 * 1024,
  },
};
