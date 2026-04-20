const supabase = require('../config/supabase');
const crypto = require('crypto');

// Utility to generate a secure random password
const generatePassword = () => crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 char hex password

exports.listStudents = async (req, res) => {
  try {
    const { schoolId, classId } = req.query;
    let query = supabase
      .from('students')
      .select(`
        *,
        schools(name),
        classes(*)
      `);

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }
    if (classId) {
      query = query.eq('class_id', classId);
    }

    const { data, error } = await query.order('full_name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createStudent = async (req, res) => {
  const { full_name, admission_no, school_id, class_id, contact_mobile } = req.body;
  
  try {
    // 0. Check for duplicate admission number WITHIN the same school
    const { data: existingStudent } = await supabase
        .from('students')
        .select('id')
        .eq('admission_no', admission_no)
        .eq('school_id', school_id)
        .single();
    
    if (existingStudent) {
        return res.status(400).json({ error: `Admission No '${admission_no}' is already registered in this school.` });
    }

    // 1. Fetch School name for the email domain
    const { data: schoolData, error: schoolFetchError } = await supabase
        .from('schools')
        .select('name')
        .eq('id', school_id)
        .single();
    
    if (schoolFetchError) throw new Error('Could not identify school for credential generation');

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
      .from('students')
      .insert([{
        full_name,
        admission_no,
        school_id,
        class_id,
        contact_mobile,
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
        .from('students')
        .select('user_id')
        .eq('id', id)
        .single();
    
    // 2. Delete student record
    const { error: sError } = await supabase.from('students').delete().eq('id', id);
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
  const { full_name, admission_no, school_id, class_id, contact_mobile, status } = req.body;
  try {
    // 0. Check for duplicate admission number in the SAME school (excluding current student)
    const { data: duplicate } = await supabase
        .from('students')
        .select('id')
        .eq('admission_no', admission_no)
        .eq('school_id', school_id)
        .neq('id', id)
        .maybeSingle();
    
    if (duplicate) {
        return res.status(400).json({ error: `Admission No '${admission_no}' is already used by another student in this school.` });
    }

    // 1. Update Student Record
    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .update({
        full_name,
        admission_no,
        school_id,
        class_id,
        contact_mobile,
        status
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
  const { students } = req.body;
  if (!students || !Array.isArray(students)) {
    return res.status(400).json({ error: 'Invalid students data' });
  }

  let successCount = 0;
  let errorCount = 0;
  const STUDENT_ROLE_ID = '64ae559c-42c2-4592-a1b7-0ef7b3a17d17';

  // Fetch all schools once for efficiency
  const { data: allSchools } = await supabase.from('schools').select('id, name');
  const schoolMap = Object.fromEntries(allSchools.map(s => [s.id, s.name]));

  // We loop to ensure each user gets a unique profile created
  for (const s of students) {
    try {
      const { full_name, admission_no, school_id, class_id, contact_mobile } = s;
      
      // 1. Generate Shorter & Unique Credentials
      const namePrefix = full_name.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '').substring(0, 3);
      const cleanAdmission = String(admission_no).toLowerCase().replace(/[^a-z0-9]/g, '');
      let baseEmail = `${namePrefix}${cleanAdmission}`;
      let studentEmail = `${baseEmail}@inland.com`;
      
      // Uniqueness check for bulk
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
          user_type_id: STUDENT_ROLE_ID
        }])
        .select()
        .single();

      if (userError) throw userError;

      // 3. Create Student record
      const { error: studentError } = await supabase
        .from('students')
        .insert([{
          full_name,
          admission_no,
          school_id,
          class_id,
          contact_mobile,
          user_id: userData.id,
          status: 'Active'
        }]);

      if (studentError) {
         await supabase.from('user_profiles').delete().eq('id', userData.id);
         throw studentError;
      }

      successCount++;
    } catch (err) {
      console.error('Failed to import student:', err);
      errorCount++;
    }
  }

  res.json({ success: true, successCount, errorCount });
};

exports.resetPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: student } = await supabase
        .from('students')
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
    // Fetch current student info with school name
    const { data: student, error: sError } = await supabase
      .from('students')
      .select('*, schools(name)')
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
