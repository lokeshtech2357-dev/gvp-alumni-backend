const jwt = require('jsonwebtoken');
const AccessGrant = require('../models/AccessGrant');
const User = require('../models/User');

const auth = async (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ msg: 'Authentication is not configured on this server' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
    return;
  }

  if (typeof decoded.id === 'string' && decoded.id.startsWith('grant:')) {
    try {
      const grant = await AccessGrant.findById(decoded.id.slice('grant:'.length)).lean();
      if (!grant || grant.role !== decoded.role || (decoded.version || 0) !== (grant.tokenVersion || 0)) {
        return res.status(401).json({ msg: 'This account no longer has access.' });
      }
      req.user = { ...decoded, email: grant.email };
    } catch (error) {
      console.error('Unable to verify role access grant:', error);
      return res.status(500).json({ msg: 'Unable to verify account access.' });
    }
  } else {
    try {
      const user = await User.findById(decoded.id).select('role tokenVersion');
      if (!user || user.role !== decoded.role || (decoded.version || 0) !== (user.tokenVersion || 0)) {
        return res.status(401).json({ msg: 'This account no longer has access.' });
      }
      req.user = decoded;
    } catch (error) {
      console.error('Unable to verify authenticated user:', error);
      return res.status(500).json({ msg: 'Unable to verify your account.' });
    }
  }

  next();
};

module.exports = auth;