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
      .eq('email', email)
      .eq('password', password)
      .single();

    if (pError || !profile) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password.' 
      });
    }

    const fullUser = {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.user_types?.name || 'User',
      permissions: profile.user_types?.permissions || []
    };

    const token = jwt.sign(
      { 
        id: fullUser.id, 
        email: fullUser.email, 
        role: fullUser.role,
        permissions: fullUser.permissions 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: fullUser
    });

  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal system error' });
  }
};
