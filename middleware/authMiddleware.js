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
const checkPermission = (required) => {
  return (req, res, next) => {
    const userRole = req.user?.role || '';
    const userPermissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
    const requiredList = Array.isArray(required) ? required : [required];
    
    // Admin role, Branch Manager/Staff, or 'all' permission bypass
    if (
      userRole === 'Admin' || 
      userRole === 'Super Admin' || 
      userRole === 'SuperAdmin' || 
      userPermissions.includes('all')
    ) {
      return next();
    }

    // Branch Managers and Branch Staff have read permission for employee lists
    if ((userRole === 'Branch Manager' || userRole === 'Branch Staff') && requiredList.includes('view_employees')) {
      return next();
    }
    
    // Check if user has ANY of the required permissions
    const hasPerm = requiredList.some(p => userPermissions.includes(p));
    if (hasPerm) return next();

    res.status(403).json({ 
        error: 'Access Denied', 
        message: `You do not have permission to perform this action (${requiredList.join(' or ')})` 
    });
  };
};

module.exports = {
  authMiddleware,
  checkPermission
};
