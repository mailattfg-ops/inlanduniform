const supabase = require('../config/supabase');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.SUPABASE_KEY || 'uniform-system-secret-2024';

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const cleanEmail = email.trim();
  const cleanPass = password.trim();

  try {
    // 1. First check user_profiles
    const { data: profile, error: pError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        user_types (
          name,
          permissions
        )
      `)
      .or(`email.eq.${cleanEmail},username.eq.${cleanEmail}`)
      .eq('password', cleanPass)
      .maybeSingle();

    let fullUser = null;

    if (profile) {
      fullUser = {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name || profile.username || 'User',
        role: profile.user_types?.name || 'User',
        permissions: profile.user_types?.permissions || []
      };

      // 1a. If it's an Organization/School account, fetch the linked organization_id
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name, customer_code, branch_id')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (orgData) {
        fullUser.organizationId = orgData.id;
        fullUser.organizationName = orgData.name;
        fullUser.customerCode = orgData.customer_code;
        if (orgData.branch_id && !fullUser.branchId) {
          fullUser.branchId = orgData.branch_id;
        }
      }

      // 1b. If it's an individual Entity member (Student/Member), fetch linked registry_members record
      const { data: memberData } = await supabase
        .from('registry_members')
        .select('id, full_name, admission_no, gender, organization_id, department_id, organizations(id, name, customer_code), departments(id, name)')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (memberData) {
        fullUser.memberId = memberData.id;
        fullUser.organizationId = memberData.organization_id;
        fullUser.organizationName = memberData.organizations?.name;
        fullUser.customerCode = memberData.organizations?.customer_code;
        fullUser.departmentId = memberData.department_id;
        fullUser.departmentName = memberData.departments?.name;
        fullUser.admissionNo = memberData.admission_no;
        fullUser.gender = memberData.gender;
        if (memberData.full_name) {
          fullUser.fullName = memberData.full_name;
        }
      }
    } else {
      // 2. Fallback check in branch_users table
      const { data: bUser } = await supabase
        .from('branch_users')
        .select('*, branches(name, code)')
        .eq('email', cleanEmail.toLowerCase())
        .eq('password_plain', cleanPass)
        .maybeSingle();

      if (bUser && bUser.is_active) {
        const userRole = bUser.role || 'Branch Manager';
        let permissions = null;

        // 2a. Dynamically lookup permissions configured in user_types table
        try {
          const { data: roleDef } = await supabase
            .from('user_types')
            .select('permissions')
            .ilike('name', userRole.trim())
            .maybeSingle();

          if (roleDef && Array.isArray(roleDef.permissions) && roleDef.permissions.length > 0) {
            permissions = roleDef.permissions;
          }
        } catch (rErr) {
          console.warn('Could not fetch dynamic role permissions for branch user:', rErr.message);
        }

        // 2b. Safe fallback if role not found in user_types
        if (!permissions) {
          if (userRole === 'Factory PO Handler') {
            permissions = [
              'factory_po_handler',
              'factory_floor',
              'view_inventory',
              'manage_inventory'
            ];
          } else if (userRole === 'Factory Production Staff') {
            permissions = [
              'factory_floor'
            ];
          } else if (userRole === 'Branch Manager') {
            // Phase 1 Scope: Branch Manager has full branch transaction authority (Quotations, Orders, Invoices, Stock, Members, Measurements)
            permissions = [
              'branch_inventory',
              'branch_sales',
              'branch_transfers',
              'view_employees',
              'view_organizations',
              'manage_schools',
              'view_schools',
              'manage_classes',
              'manage_departments',
              'view_students',
              'register_students',
              'manage_students',
              'view_products',
              'manage_products',
              'view_measurements',
              'manage_measurements',
              'manage_quotations',
              'view_quotations',
              'manage_invoices',
              'view_invoices'
            ];
          } else {
            // Standard Branch Staff
            permissions = [
              'branch_inventory',
              'branch_sales',
              'view_organizations',
              'view_schools',
              'view_students',
              'register_students',
              'view_products',
              'view_measurements',
              'manage_measurements',
              'view_quotations',
              'view_invoices'
            ];
          }
        }

        fullUser = {
          id: `branch_user_${bUser.id}`,
          email: bUser.email,
          fullName: bUser.name,
          role: userRole,
          branchId: bUser.branch_id,
          branchTier: bUser.branches?.tier || 'Branch',
          branchName: bUser.branches?.name || 'Branch Outlet',
          branchCode: bUser.branches?.code || '',
          permissions: permissions
        };
      }
    }

    if (!fullUser) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username/email or password.' 
      });
    }

    const token = jwt.sign(
      { 
        id: fullUser.id, 
        email: fullUser.email, 
        role: fullUser.role,
        permissions: fullUser.permissions,
        organizationId: fullUser.organizationId,
        memberId: fullUser.memberId,
        departmentId: fullUser.departmentId,
        branchId: fullUser.branchId
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Log the login action safely
    try {
      const { logAction } = require('../utils/logger');
      await logAction(fullUser.id, 'LOGIN', 'auth', fullUser.id, { email: fullUser.email });
    } catch (e) {
      // Ignore logging errors if table doesn't exist
    }

    res.json({
      success: true,
      token,
      user: fullUser
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Internal system error' });
  }
};
