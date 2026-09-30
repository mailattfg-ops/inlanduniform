const supabase = require('../config/supabase');
const crypto = require('crypto');
const { logAction } = require('../utils/logger');

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

    const role = (user.role || '').toLowerCase();
    if (role === 'entity' || role === 'student' || role === 'member' || user.memberId) {
      // Entity / Member should ONLY see their own record!
      if (user.memberId) {
        query = query.eq('id', user.memberId);
      } else {
        query = query.eq('user_id', user.id);
      }
    } else if (role === 'school' || role === 'organization' || role === 'organisation' || user.organizationId) {
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

    // 2. Aggregate Measurement Statuses for loaded members (Prioritize Pending over Approved)
    const memberIds = members.map(m => m.id).filter(Boolean);
    let measurements = [];
    if (memberIds.length > 0) {
      const { data: mData } = await supabase
        .from('measurements')
        .select('member_id, status')
        .in('member_id', memberIds)
        .order('recorded_at', { ascending: false });
      measurements = mData || [];
    }
    
    const statusMap = {};
    if (measurements) {
        measurements.forEach(m => {
            const mid = String(m.member_id);
            // If we already have a status for this member, only overwrite if current is Pending (higher priority for review)
            if (!statusMap[mid] || m.status === 'Pending') {
                statusMap[mid] = m.status;
            }
        });
    }

    const enriched = members.map(m => ({
        ...m,
        measurement_status: statusMap[String(m.id)] || 'Missing'
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
    
    // Dynamically resolve Student/Entity role
    let studentRoleId = null;
    const { data: roleRecords } = await supabase
      .from('user_types')
      .select('id, name')
      .or('name.ilike.%student%,name.ilike.%entity%')
      .limit(1);

    if (roleRecords && roleRecords.length > 0) {
      studentRoleId = roleRecords[0].id;
    } else {
      const { data: anyRole } = await supabase.from('user_types').select('id').limit(1);
      if (anyRole && anyRole.length > 0) {
        studentRoleId = anyRole[0].id;
      } else {
        const { data: newRole } = await supabase
          .from('user_types')
          .insert([{ name: 'Entity', permissions: ['view_own_students', 'view_own_measurements'] }])
          .select('id')
          .single();
        if (newRole) studentRoleId = newRole.id;
      }
    }

    // 3. Create User Profile
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .insert([{
        full_name: full_name,
        email: studentEmail,
        password: generatedPassword,
        user_type_id: studentRoleId
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

    // 5. Log the action
    await logAction(req.user.id, 'CREATE', 'member', studentData.id, { 
        name: full_name, 
        admission: admission_no 
    });

    // 6. Return both for the copy-paste UI
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
  const userOrgId = req.user?.organizationId;
  try {
    // 1. Get user_id and organization_id before deleting student
    const { data: student } = await supabase
        .from('registry_members')
        .select('user_id, organization_id')
        .eq('id', id)
        .single();
    
    if (!student) {
        return res.status(404).json({ error: 'Member not found' });
    }

    if (userOrgId && String(student.organization_id) !== String(userOrgId)) {
        return res.status(403).json({ error: 'Access Denied: You cannot delete members from another organization.' });
    }
    
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

    // 3. Log the action
    await logAction(req.user.id, 'UPDATE', 'member', id, { 
        updated_fields: { full_name, admission_no, status }
    });

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

  // Dynamically resolve Member / Entity role ID
  let memberRoleId = null;
  try {
    const { data: roleRecords } = await supabase
      .from('user_types')
      .select('id, name')
      .or('name.ilike.%entity%,name.ilike.%student%,name.ilike.%member%')
      .limit(1);

    if (roleRecords && roleRecords.length > 0) {
      memberRoleId = roleRecords[0].id;
    } else {
      const { data: anyRole } = await supabase.from('user_types').select('id').limit(1);
      if (anyRole && anyRole.length > 0) memberRoleId = anyRole[0].id;
    }
  } catch (roleErr) {
    console.warn('[BULK REGISTER] Could not fetch role from user_types:', roleErr.message);
  }

  // Pre-load all departments for organizations present in batch
  const orgIds = [...new Set(members.map(m => m.organization_id).filter(Boolean))];
  const deptMap = new Map(); // key: `${orgId}_${stringVal}`, value: numericDeptId
  if (orgIds.length > 0) {
    try {
      const { data: depts } = await supabase
        .from('departments')
        .select('id, organization_id, name, section, division')
        .in('organization_id', orgIds);
      if (depts) {
        depts.forEach(d => {
          deptMap.set(`${d.organization_id}_${String(d.id)}`, d.id);
          if (d.name) deptMap.set(`${d.organization_id}_${d.name.toLowerCase().trim()}`, d.id);
          if (d.section) deptMap.set(`${d.organization_id}_${d.section.toLowerCase().trim()}`, d.id);
          if (d.division) deptMap.set(`${d.organization_id}_${d.division.toLowerCase().trim()}`, d.id);
        });
      }
    } catch (deptErr) {
      console.warn('[BULK REGISTER] Could not pre-fetch departments:', deptErr.message);
    }
  }

  for (let i = 0; i < members.length; i++) {
    const s = members[i];
    try {
      let { full_name, admission_no, organization_id, department_id, contact_mobile, contact_number, gender } = s;
      const contact = contact_mobile || contact_number || '';
      
      // Basic Validation
      if (!full_name || full_name.trim() === '') {
        throw new Error('Full Name is required');
      }

      // If admission_no is missing, auto-generate a unique fallback
      if (!admission_no || String(admission_no).trim() === '') {
        admission_no = `REF-${Date.now().toString().slice(-6)}-${i+1}`;
      } else {
        admission_no = String(admission_no).trim();
      }

      if (!organization_id && req.user?.organizationId) {
        organization_id = req.user.organizationId;
      }

      if (organization_id && isNaN(Number(organization_id))) {
        const { data: matchedOrg } = await supabase
          .from('organizations')
          .select('id')
          .or(`name.ilike.%${organization_id}%,customer_code.eq.${organization_id}`)
          .limit(1)
          .maybeSingle();
        if (matchedOrg) {
          organization_id = matchedOrg.id;
        }
      }

      if (!organization_id) {
        throw new Error('Organization ID or Name is required');
      }

      // Resolve department_id if given as string name or numeric ID
      let resolvedDeptId = null;
      if (department_id) {
        const lookupKey = `${organization_id}_${String(department_id).toLowerCase().trim()}`;
        if (deptMap.has(lookupKey)) {
          resolvedDeptId = deptMap.get(lookupKey);
        } else if (!isNaN(Number(department_id))) {
          resolvedDeptId = Number(department_id);
        } else {
          // If department name does not exist, auto-create it for the organization!
          try {
            const { data: newDept } = await supabase
              .from('departments')
              .insert([{
                organization_id,
                name: String(department_id).trim()
              }])
              .select('id, name')
              .single();
            if (newDept) {
              resolvedDeptId = newDept.id;
              deptMap.set(`${organization_id}_${newDept.name.toLowerCase().trim()}`, newDept.id);
              deptMap.set(`${organization_id}_${String(newDept.id)}`, newDept.id);
            }
          } catch (createDeptErr) {
            console.warn('[BULK REGISTER] Could not auto-create department:', createDeptErr.message);
          }
        }
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
      const userPayload = {
        full_name,
        email: studentEmail,
        password: generatedPassword
      };
      if (memberRoleId) {
        userPayload.user_type_id = memberRoleId;
      }

      const { data: userData, error: userError } = await supabase
        .from('user_profiles')
        .insert([userPayload])
        .select()
        .single();

      if (userError) throw userError;

      // 3. Create Member record
      const memberPayload = {
        full_name,
        admission_no,
        organization_id,
        department_id: resolvedDeptId,
        contact_mobile: contact,
        contact_number: contact,
        gender: gender || 'Male',
        user_id: userData.id,
        status: 'Active'
      };

      const { error: studentError } = await supabase
        .from('registry_members')
        .insert([memberPayload]);

      if (studentError) {
         // If contact_mobile column missing, retry with only contact_number
         if (studentError.message && studentError.message.includes('contact_mobile')) {
            delete memberPayload.contact_mobile;
            const { error: retryError } = await supabase
              .from('registry_members')
              .insert([memberPayload]);
            if (retryError) {
              await supabase.from('user_profiles').delete().eq('id', userData.id);
              throw retryError;
            }
         } else {
            await supabase.from('user_profiles').delete().eq('id', userData.id);
            throw studentError;
         }
      }

      successCount++;
    } catch (err) {
      console.error(`[BULK REGISTER ERROR] Row ${i + 1} (${members[i]?.full_name || 'Unknown'}):`, err.message);
      errors.push({
        row: i + 1,
        student: s.full_name || `Row ${i+1}`,
        message: err.message
      });
    }
  }

  console.log(`[BULK REGISTER RESULT] Success: ${successCount}, Errors: ${errors.length}`);
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
