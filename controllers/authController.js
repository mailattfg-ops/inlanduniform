const supabase = require('../config/supabase');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.SUPABASE_KEY || 'uniform-system-secret-2024';

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data: profile, error: pError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        user_types (
          name,
          permissions
        )
      `)
      .or(`email.eq.${email || 'N/A'},username.eq.${email || 'N/A'}`)
      .eq('password', password)
      .single();

    if (pError || !profile) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username/email or password.' 
      });
    }

    const fullUser = {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.user_types?.name || 'User',
      permissions: profile.user_types?.permissions || []
    };

    // If it's a School/Organization account, fetch the linked organization_id
    if (fullUser.role === 'School' || fullUser.role === 'Organization') {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('user_id', profile.id)
        .single();
      if (orgData) {
        fullUser.organizationId = orgData.id;
        fullUser.organizationName = orgData.name;
      }
    }

    const token = jwt.sign(
      { 
        id: fullUser.id, 
        email: fullUser.email, 
        role: fullUser.role,
        permissions: fullUser.permissions,
        organizationId: fullUser.organizationId
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Log the login action
    const { logAction } = require('../utils/logger');
    await logAction(fullUser.id, 'LOGIN', 'auth', fullUser.id, { email: fullUser.email });

    res.json({
      success: true,
      token,
      user: fullUser
    });

  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal system error' });
  }
};
