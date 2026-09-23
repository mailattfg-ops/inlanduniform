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
    
    // Admin role or 'all' permission bypass
    if (
      userRole === 'Admin' || 
      userRole === 'Super Admin' || 
      userRole === 'SuperAdmin' || 
      userPermissions.includes('all')
    ) {
      return next();
    }

    // 1. Primary Authorization: Dynamic permission check against database-configured permissions
    if (userPermissions.length > 0) {
      const hasPerm = requiredList.some(p => userPermissions.includes(p));
      if (hasPerm) return next();

      return res.status(403).json({ 
        error: 'Access Denied', 
        message: `You do not have permission to perform this action (${requiredList.join(' or ')})` 
      });
    }

    // 2. Legacy / Fallback Authorization (only evaluated if token lacked permissions array)
    if (userRole === 'Branch Manager') {
      const branchManagerPermissions = [
        'branch_inventory', 'branch_sales', 'branch_transfers',
        'view_employees', 'view_organizations', 'manage_schools', 'view_schools',
        'manage_classes', 'manage_departments', 'view_students', 'register_students',
        'manage_students', 'view_products', 'manage_products', 'view_measurements',
        'manage_measurements', 'manage_quotations', 'view_quotations', 'manage_invoices', 'view_invoices'
      ];
      if (requiredList.some(p => branchManagerPermissions.includes(p))) {
        return next();
      }
    }

    if (userRole === 'Branch Staff') {
      const branchStaffPermissions = [
        'branch_inventory', 'branch_sales', 'view_organizations',
        'view_schools', 'view_students', 'register_students',
        'view_products', 'view_measurements', 'manage_measurements',
        'view_quotations', 'view_invoices', 'view_employees'
      ];
      if (requiredList.some(p => branchStaffPermissions.includes(p))) {
        return next();
      }
    }

    if (userRole === 'Factory PO Handler') {
      const factoryPermissions = [
        'factory_po_handler', 'factory_floor', 'view_inventory', 'manage_inventory'
      ];
      if (requiredList.some(p => factoryPermissions.includes(p))) {
        return next();
      }
    }

    if (userRole === 'Factory Production Staff') {
      const factoryFloorPermissions = [
        'factory_floor'
      ];
      if (requiredList.some(p => factoryFloorPermissions.includes(p))) {
        return next();
      }
    }

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
