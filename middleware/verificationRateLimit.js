const attempts = new Map();

const createRateLimit = (limit, message) => (req, res, next) => {
  const now = Date.now();
  const key = `${limit}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return next();
  }
  if (entry.count >= limit) return res.status(429).json({ message });
  entry.count += 1;
  return next();
};

module.exports = createRateLimit(8, 'Too many verification requests. Please try again later.');
module.exports.adminImportRateLimit = createRateLimit(80, 'Too many workbook operations. Please try again later.');