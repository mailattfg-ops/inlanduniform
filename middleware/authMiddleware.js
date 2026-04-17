const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.SUPABASE_KEY || 'uniform-system-secret-2024';

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
};

/**
 * Higher-order middleware to check for specific permissions
 * Supports ['all'] bypass for Admins
 */
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    const userPermissions = req.user?.permissions || [];
    
    // Admin bypass
    if (userPermissions.includes('all')) return next();
    
    // Check if user has the specific permission
    if (userPermissions.includes(requiredPermission)) {
        return next();
    }

    res.status(403).json({ 
        error: 'Access Denied', 
        message: `You do not have permission to perform this action (${requiredPermission})` 
    });
  };
};

module.exports = {
  authMiddleware,
  checkPermission
};
