const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const role = String(req.user?.role || '').trim().toLowerCase();
    if (!role) {
      return res.status(403).json({ success: false, message: 'User role is required for this action' });
    }
    const normalizedAllowedRoles = allowedRoles.map((allowedRole) => String(allowedRole).trim().toLowerCase());
    if (!normalizedAllowedRoles.includes(role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = {
  requireRole,
};
