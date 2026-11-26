const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const JWT_SECRET = process.env.SUPABASE_KEY || 'uniform-system-secret-2024';

// ---------------------------------------------------------------------------
// Session identity: every activity/approval log reads req.user.fullName (or full_name / name).
// Older tokens carried no name, so logs fell back to "Sales Representative", "Finance Staff", etc.
// Resolve the real name/designation/department/branch once per user and cache it briefly.
// ---------------------------------------------------------------------------
// Also refreshes role + permissions from the database, so changes made in Admin > Roles apply to
// people who are already logged in (their token still holds the permissions from login time).
const IDENTITY_TTL_MS = 2 * 60 * 1000;
const identityCache = new Map(); // userId -> { at, identity }

async function lookupIdentity(user) {
  const id = String(user.id || '');
  if (id.startsWith('branch_user_')) {
    const { data: bu } = await supabase
      .from('branch_users')
      .select('name, role, branches(name)')
      .eq('id', id.replace('branch_user_', ''))
      .maybeSingle();
    if (!bu) return null;
    // Branch logins take the permissions of the role with the same name (as at login)
    const { data: roleDef } = await supabase.from('user_types').select('name, permissions').ilike('name', String(bu.role || 'Branch Manager').trim()).maybeSingle();
    return {
      fullName: bu.name || null,
      designation: bu.role || null,
      department: bu.branches?.name ? `${bu.branches.name} Branch` : null,
      branchName: bu.branches?.name || null,
      role: bu.role || null,
      permissions: Array.isArray(roleDef?.permissions) && roleDef.permissions.length ? roleDef.permissions : null
    };
  }

  // Same precedence as login: profile name, then linked member, then employee record
  const [{ data: profile }, { data: member }, { data: emp }] = await Promise.all([
    supabase.from('user_profiles').select('full_name, username, user_types(name, permissions)').eq('id', id).maybeSingle(),
    supabase.from('registry_members').select('full_name').eq('user_id', id).maybeSingle(),
    supabase
      .from('employees')
      // employees has several FKs to branches (branch_id, temp_, deputed_): name the home-branch one
      .select('id, employee_id, full_name, designation, department, branch_id, branches!employees_branch_id_fkey(name)')
      .or(user.email ? `user_id.eq.${id},email.eq.${user.email}` : `user_id.eq.${id}`)
      .maybeSingle()
  ]);
  if (!profile && !member && !emp) return null;
  return {
    fullName: member?.full_name || profile?.full_name || emp?.full_name || profile?.username || null,
    designation: emp?.designation || profile?.user_types?.name || null,
    department: emp?.department || null,
    branchName: emp?.branches?.name || null,
    branchId: emp?.branch_id || null,
    employeeRecordId: emp?.id || null,
    employeeId: emp?.employee_id || null,
    // Role + permissions from the same source login uses (user_profiles -> user_types)
    role: profile?.user_types?.name || null,
    permissions: profile && Array.isArray(profile.user_types?.permissions) ? profile.user_types.permissions : null
  };
}

async function attachIdentity(user) {
  if (!user || !user.id) return;
  const key = String(user.id);
  let cached = identityCache.get(key);
  if (!cached || Date.now() - cached.at > IDENTITY_TTL_MS) {
    try {
      cached = { at: Date.now(), identity: await lookupIdentity(user) };
      identityCache.set(key, cached);
    } catch (err) {
      console.warn('[auth] identity lookup failed:', err.message);
      cached = { at: Date.now(), identity: null };
    }
  }
  const idn = cached.identity || {};
  // Role and permissions: the database is the source of truth (Admin > Roles edits apply without re-login)
  if (Array.isArray(idn.permissions)) user.permissions = idn.permissions;
  if (idn.role) user.role = idn.role;
  // Other identity fields: token values win when present; fill only what is missing
  const name = user.fullName || user.full_name || idn.fullName || null;
  if (name) {
    user.fullName = name;
    user.full_name = user.full_name || name;
    user.name = user.name || name;
  }
  user.designation = user.designation || idn.designation || user.role || null;
  user.department = user.department || idn.department || null;
  user.branchName = user.branchName || idn.branchName || null;
  user.branchId = user.branchId || idn.branchId || null;
  user.employeeRecordId = user.employeeRecordId || idn.employeeRecordId || null;
  user.employeeId = user.employeeId || idn.employeeId || null;
}

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  req.user = decoded;
  await attachIdentity(req.user); // never throws; a failed lookup just leaves token values
  next();
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
