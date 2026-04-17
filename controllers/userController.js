const supabase = require('../config/supabase');

exports.getProfile = async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  try {
    let profileData = { ...req.user };

    if (role === 'Student') {
      const { data, error } = await supabase
        .from('students')
        .select('*, schools(name), classes(name)')
        .eq('user_id', userId)
        .single();
      if (!error) profileData.details = data;
    } else if (role === 'Staff' || role === 'Admin') {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (!error) profileData.details = data;
    }

    res.json(profileData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch full profile' });
  }
};

exports.updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { avatar_url, full_name } = req.body;

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ avatar_url, full_name })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUserTypes = async (req, res) => {
    try {
        const { data, error } = await supabase.from('user_types').select('*');
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createUser = async (req, res) => {
    // Already implemented as part of previous tasks but keeping it for completeness if needed
};
