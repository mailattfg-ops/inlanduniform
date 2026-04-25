const supabase = require('../config/supabase');
const crypto = require('crypto');

// Utility to generate a secure random password
const generatePassword = () => crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 char hex password

exports.listStudents = async (req, res) => {
  try {
    let { schoolId, classId, search } = req.query;
    const user = req.user;

    console.log(`[AUTH] User '${user.email}' Role: '${user.role}' SchoolID: '${user.schoolId}'`);

    let query = supabase
      .from('registry_members')
      .select(`
        *,
        organizations(name),
        departments(*)
      `);

    if (user.role && user.role.toLowerCase() === 'school') {
      if (!user.organizationId) {
        return res.status(403).json({ error: 'Your account is not correctly linked to an organization record.' });
      }
      query = query.eq('organization_id', user.organizationId);
    } else if (schoolId) {
      query = query.eq('organization_id', schoolId);
    }

    if (classId) {
      query = query.eq('department_id', classId);
    }

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,admission_no.ilike.%${search}%`);
    }

    const { data: members, error } = await query.order('full_name', { ascending: true });
    if (error) throw error;

    if (!members || members.length === 0) {
        return res.json([]);
    }

    // Manual Fetch for status badges to avoid join cache issues
    const { data: measurements } = await supabase
        .from('measurements')
        .select('member_id');
    
    const measuredIds = new Set(measurements?.map(m => String(m.member_id)));

    const enriched = members.map(m => ({
        ...m,
        measurements: measuredIds.has(String(m.id)) ? [{ id: 'exists' }] : []
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createStudent = async (req, res) => {
  const { full_name, admission_no, school_id, class_id, contact_mobile, gender } = req.body;
  
  try {
    // 0. Check for duplicate admission number WITHIN the same organization
    const { data: existingStudent } = await supabase
        .from('registry_members')
        .select('id')
        .eq('admission_no', admission_no)
        .eq('organization_id', school_id)
        .single();
    
    if (existingStudent) {
        return res.status(400).json({ error: `Admission No '${admission_no}' is already registered in this school.` });
    }

    // 1. Fetch Organization name for the email domain
    const { data: orgData, error: orgFetchError } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', school_id)
        .single();
    
    if (orgFetchError) throw new Error('Could not identify organization for credential generation');

    // 2. Generate Shorter & Unique Credentials
    const namePrefix = full_name.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '').substring(0, 3);
    const cleanAdmission = String(admission_no).toLowerCase().replace(/[^a-z0-9]/g, '');
    let baseEmail = `${namePrefix}${cleanAdmission}`;
    let studentEmail = `${baseEmail}@inland`;
    
    // Uniqueness check
    let { data: collision } = await supabase.from('user_profiles').select('id').eq('email', studentEmail).maybeSingle();
    let counter = 1;
    while (collision) {
        studentEmail = `${baseEmail}${counter}@inland.com`;
        const { data: nextCheck } = await supabase.from('user_profiles').select('id').eq('email', studentEmail).maybeSingle();
        collision = nextCheck;
        counter++;
    }

    const generatedPassword = generatePassword();
    const STUDENT_ROLE_ID = '64ae559c-42c2-4592-a1b7-0ef7b3a17d17';

    // 3. Create User Profile
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .insert([{
        full_name: full_name,
        email: studentEmail,
        password: generatedPassword,
        user_type_id: STUDENT_ROLE_ID
      }])
      .select()
      .single();

    if (userError) throw userError;

    // 4. Create Student record linked to this user
    const { data: studentData, error: studentError } = await supabase
      .from('registry_members')
      .insert([{
        full_name,
        admission_no,
        organization_id: school_id,
        department_id: class_id,
        contact_mobile,
        gender,
        status: req.body.status || 'Active',
        user_id: userData.id
      }])
      .select()
      .single();

    if (studentError) {
        // Rollback user creation if student creation fails
        await supabase.from('user_profiles').delete().eq('id', userData.id);
        throw studentError;
    }

    // 5. Return both for the copy-paste UI
    res.json({
        success: true,
        student: studentData,
        credentials: {
            username: studentEmail,
            display_name: full_name,
            password: generatedPassword
        }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteStudent = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Get user_id before deleting student
    const { data: student } = await supabase
        .from('registry_members')
        .select('user_id')
        .eq('id', id)
        .single();
    
    // 2. Delete student record
    const { error: sError } = await supabase.from('registry_members').delete().eq('id', id);
    if (sError) throw sError;

    // 3. Delete linked user profile (login)
    if (student?.user_id) {
        await supabase.from('user_profiles').delete().eq('id', student.user_id);
    }

    res.json({ success: true, message: 'Student and linked account deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateStudent = async (req, res) => {
  const { id } = req.params;
  const { full_name, admission_no, school_id, class_id, contact_mobile, status, gender } = req.body;
  try {
    // 0. Check for duplicate admission number in the SAME organization (excluding current member)
    const { data: duplicate } = await supabase
        .from('registry_members')
        .select('id')
        .eq('admission_no', admission_no)
        .eq('organization_id', school_id)
        .neq('id', id)
        .maybeSingle();
    
    if (duplicate) {
        return res.status(400).json({ error: `Reference/Admission No '${admission_no}' is already used by another member in this organization.` });
    }

    // 1. Update Member Record
    const { data: studentData, error: studentError } = await supabase
      .from('registry_members')
      .update({
        full_name,
        admission_no,
        organization_id: school_id,
        department_id: class_id,
        contact_mobile,
        status,
        gender
      })
      .eq('id', id)
      .select()
      .single();

    if (studentError) throw studentError;

    // 2. Sync name to User Profile
    if (studentData.user_id) {
        await supabase
          .from('user_profiles')
          .update({ full_name })
          .eq('id', studentData.user_id);
    }

    res.json({ success: true, student: studentData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.bulkCreateStudents = async (req, res) => {
  console.log('[BULK REGISTER] Inbound Members:', req.body.members?.length);
  const { members } = req.body;
  if (!members || !Array.isArray(members)) {
    return res.status(400).json({ error: 'Invalid members data' });
  }

  let successCount = 0;
  let errors = [];
  const MEMBER_ROLE_ID = '64ae559c-42c2-4592-a1b7-0ef7b3a17d17';

  for (let i = 0; i < members.length; i++) {
    const s = members[i];
    try {
      const { full_name, admission_no, organization_id, department_id, contact_mobile, gender } = s;
      
      // Basic Validation
      if (!full_name || !admission_no || !organization_id || !department_id || !gender) {
        throw new Error(`Missing required fields: ${[!full_name && 'name', !admission_no && 'admission_no', !organization_id && 'organization_id', !department_id && 'department_id', !gender && 'gender'].filter(Boolean).join(', ')}`);
      }

      // Check for existing admission_no in same organization
      const { data: existing } = await supabase
        .from('registry_members')
        .select('id')
        .eq('admission_no', admission_no)
        .eq('organization_id', organization_id)
        .maybeSingle();
      
      if (existing) {
        throw new Error(`Reference No '${admission_no}' is already registered in this organization.`);
      }

      // 1. Generate Credentials
      const namePrefix = full_name.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '').substring(0, 3) || 'std';
      const cleanAdmission = String(admission_no).toLowerCase().replace(/[^a-z0-9]/g, '');
      let baseEmail = `${namePrefix}${cleanAdmission}`;
      let studentEmail = `${baseEmail}@inland.com`;
      
      let { data: collision } = await supabase.from('user_profiles').select('id').eq('email', studentEmail).maybeSingle();
      let counter = 1;
      while (collision) {
          studentEmail = `${baseEmail}${counter}@inland.com`;
          const { data: nextCheck } = await supabase.from('user_profiles').select('id').eq('email', studentEmail).maybeSingle();
          collision = nextCheck;
          counter++;
      }

      const generatedPassword = generatePassword();

      // 2. Create User Profile
      const { data: userData, error: userError } = await supabase
        .from('user_profiles')
        .insert([{
          full_name,
          email: studentEmail,
          password: generatedPassword,
          user_type_id: MEMBER_ROLE_ID
        }])
        .select()
        .single();

      if (userError) throw userError;

      // 3. Create Member record
      const { error: studentError } = await supabase
        .from('registry_members')
        .insert([{
          full_name,
          admission_no,
          organization_id,
          department_id,
          contact_mobile,
          gender,
          user_id: userData.id,
          status: 'Active'
        }]);

      if (studentError) {
         await supabase.from('user_profiles').delete().eq('id', userData.id);
         throw studentError;
      }

      successCount++;
    } catch (err) {
      errors.push({
        row: i + 1,
        student: s.full_name || `Row ${i+1}`,
        message: err.message
      });
    }
  }

  res.json({ 
    success: successCount > 0, 
    successCount, 
    errorCount: errors.length,
    errors: errors 
  });
};

exports.resetPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: student } = await supabase
        .from('registry_members')
        .select('user_id, user_profiles(email)')
        .eq('id', id)
        .single();
        
    if (!student?.user_id) throw new Error('Student has no login account');

    const newPassword = generatePassword();
    await supabase.from('user_profiles').update({ password: newPassword }).eq('id', student.user_id);

    res.json({ 
        success: true, 
        newPassword,
        username: student.user_profiles?.email 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.syncUsername = async (req, res) => {
  const { id } = req.params;
  try {
    // Fetch current member info with organization name
    const { data: student, error: sError } = await supabase
      .from('registry_members')
      .select('*, organizations(name)')
      .eq('id', id)
      .single();
    
    if (sError || !student) throw new Error('Student not found');
    if (!student.user_id) throw new Error('Student has no login account');

    const namePrefix = student.full_name.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '').substring(0, 3);
    const cleanAdmission = String(student.admission_no).toLowerCase().replace(/[^a-z0-9]/g, '');
    let baseEmail = `${namePrefix}${cleanAdmission}`;
    let newEmail = `${baseEmail}@inland.com`;

    // Uniqueness check
    let { data: collision } = await supabase.from('user_profiles').select('id').eq('email', newEmail).maybeSingle();
    let counter = 1;
    while (collision) {
        newEmail = `${baseEmail}${counter}@inland.com`;
        const { data: nextCheck } = await supabase.from('user_profiles').select('id').eq('email', newEmail).maybeSingle();
        collision = nextCheck;
        counter++;
    }

    await supabase.from('user_profiles').update({ email: newEmail }).eq('id', student.user_id);

    res.json({ success: true, newUsername: newEmail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
