const supabase = require('../config/supabase');
const crypto = require('crypto');

const generatePassword = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// --- Schools Management ---

exports.getSchools = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    console.log(`[DB] Fetched ${data.length} schools`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSchool = async (req, res) => {
  const { name, address, username, password } = req.body;
  
  try {
    // 1. Validate credentials if provided
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required for school registration.' });
    }

    // 2. Create User Profile first
    const SCHOOL_ROLE_ID = '3e8ef077-f264-44b3-b37e-74e98fb6c0e7';
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .insert([{
        full_name: name,
        username: username,
        email: username, // Use username as email to satisfy DB constraint
        password: password,
        user_type_id: SCHOOL_ROLE_ID
      }])
      .select()
      .single();

    if (userError) throw userError;

    // 3. Create School and link to user
    const { data, error } = await supabase
      .from('schools')
      .insert([{ 
        name, 
        address, 
        user_id: userData.id 
      }])
      .select()
      .single();

    if (error) {
      // Rollback user creation
      await supabase.from('user_profiles').delete().eq('id', userData.id);
      throw error;
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSchool = async (req, res) => {
    const { id } = req.params;
    const { name, address } = req.body;
    try {
      const { data, error } = await supabase
        .from('schools')
        .update({ name, address })
        .eq('id', id)
        .select()
        .single();
  
      if (error) throw error;
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

exports.deleteSchool = async (req, res) => {
    const { id } = req.params;
    try {
      // 1. Get user_id before deletion
      const { data: school } = await supabase
        .from('schools')
        .select('user_id')
        .eq('id', id)
        .single();

      // 2. Delete school record
      const { error } = await supabase
        .from('schools')
        .delete()
        .eq('id', id);
  
      if (error) throw error;

      // 3. Delete linked user profile
      if (school?.user_id) {
        await supabase.from('user_profiles').delete().eq('id', school.user_id);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

exports.resetPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: school } = await supabase
        .from('schools')
        .select('user_id, user_profiles(username, email)')
        .eq('id', id)
        .single();
        
    if (!school?.user_id) throw new Error('School has no login account');

    const newPassword = generatePassword();
    await supabase.from('user_profiles').update({ password: newPassword }).eq('id', school.user_id);

    res.json({ 
        success: true, 
        newPassword,
        username: school.user_profiles?.username || school.user_profiles?.email 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// --- Classes Management ---

exports.getClasses = async (req, res) => {
  const { schoolId } = req.query;
  const user = req.user;

  try {
    let query = supabase
      .from('classes')
      .select('*, schools(name)')
      .order('created_at', { ascending: false });

    // Strict Enforcement logic
    if (user.role && user.role.toLowerCase() === 'school') {
      if (!user.schoolId) {
        return res.status(403).json({ error: 'Your account is not correctly linked to a school record.' });
      }
      query = query.eq('school_id', user.schoolId);
    } else if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    const { data, error } = await query.order('grade', { ascending: true }).order('section', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createClass = async (req, res) => {
  const { schoolId, grade, section } = req.body;
  const name = `${grade}-${section}`;
  try {
    const { data, error } = await supabase
      .from('classes')
      .insert([{ 
        school_id: schoolId, 
        grade, 
        section,
        name 
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateClass = async (req, res) => {
    const { id } = req.params;
    const { schoolId, grade, section } = req.body;
    const name = `${grade}-${section}`;
    try {
      const { data, error } = await supabase
        .from('classes')
        .update({ 
          school_id: schoolId, 
          grade, 
          section,
          name 
        })
        .eq('id', id)
        .select()
        .single();
  
      if (error) throw error;
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

exports.deleteClass = async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', id);
  
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};
