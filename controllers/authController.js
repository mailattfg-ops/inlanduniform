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

      // If it's a School/Organization/Entity account, fetch the linked organization_id
      if (fullUser.role === 'School' || fullUser.role === 'Organization' || fullUser.role === 'Entity') {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('user_id', profile.id)
          .maybeSingle();
        if (orgData) {
          fullUser.organizationId = orgData.id;
          fullUser.organizationName = orgData.name;
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
        fullUser = {
          id: `branch_user_${bUser.id}`,
          email: bUser.email,
          fullName: bUser.name,
          role: bUser.role || 'Branch Manager',
          branchId: bUser.branch_id,
          branchName: bUser.branches?.name || 'Branch Outlet',
          branchCode: bUser.branches?.code || '',
          permissions: [
            'branch_inventory',
            'branch_sales',
            'branch_transfers',
            'view_employees',
            'view_organizations',
            'view_products',
            'view_measurements'
          ]
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
