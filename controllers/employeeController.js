const supabase = require('../config/supabase');
const crypto = require('crypto');
const { logAction } = require('../utils/logger');

// Utility for password generation
const generatePassword = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// Helper for intelligent default baseline permissions based on department & designation
function getDefaultPermissionsForDepartment(dept, desig) {
  const d = (dept || '').toLowerCase();
  const title = (desig || '').toLowerCase();

  if (title.includes('manager') || title.includes('in-charge') || title.includes('head') || title.includes('lead')) {
    return [
      'branch_inventory', 'branch_sales', 'branch_transfers',
      'view_employees', 'view_organizations', 'manage_schools', 'view_schools',
      'view_products', 'manage_products', 'view_measurements', 'manage_measurements',
      'manage_quotations', 'view_quotations', 'submit_quotations_ops', 'corporate_approver',
      'manage_invoices', 'view_invoices'
    ];
  }

  if (d.includes('production') || d.includes('tailor') || d.includes('cutting') || d.includes('quality') || d.includes('finishing')) {
    return ['factory_floor', 'view_measurements', 'view_products'];
  }

  if (d.includes('marketing') || d.includes('sales')) {
    return ['manage_quotations', 'view_quotations', 'submit_quotations_bm', 'branch_sales', 'view_organizations', 'view_schools', 'view_products', 'view_leads', 'manage_leads'];
  }

  if (d.includes('measurement') || d.includes('fitting')) {
    return ['manage_measurements', 'view_measurements', 'manage_templates', 'view_products'];
  }

  if (d.includes('inventory') || d.includes('logistics') || d.includes('warehouse')) {
    return ['view_inventory', 'manage_inventory', 'branch_inventory', 'branch_transfers', 'view_products'];
  }

  if (d.includes('account') || d.includes('finance') || d.includes('billing')) {
    return ['manage_invoices', 'view_invoices', 'manage_payments', 'branch_sales'];
  }

  if (d.includes('human resources') || d.includes('hr') || d.includes('admin')) {
    return ['view_employees', 'manage_employees'];
  }

  return ['branch_sales', 'view_products', 'view_measurements'];
}

exports.listEmployees = async (req, res) => {
  try {
    const { branch_id, department, employment_type, status, search } = req.query;

    // Try joined query with explicit foreign key disambiguation
    let query = supabase
      .from('employees')
      .select('*, branches:branches!branch_id(id, code, name, tier, address, contact_number), temp_branches:branches!temp_branch_id(id, code, name, tier, address, contact_number)');

    if (branch_id && branch_id !== 'all') {
      // Allow searching by either home branch or deputed branch
      query = query.or(`branch_id.eq.${branch_id},temp_branch_id.eq.${branch_id}`);
    }
    if (department && department !== 'all') {
      query = query.eq('department', department);
    }
    if (employment_type && employment_type !== 'all') {
      query = query.eq('employment_type', employment_type);
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    let { data, error } = await query.order('created_at', { ascending: false });

    // Fallback if PostgREST embedding encounters relationship ambiguity
    if (error) {
      let fallbackQuery = supabase.from('employees').select('*');
      if (branch_id && branch_id !== 'all') {
        fallbackQuery = fallbackQuery.or(`branch_id.eq.${branch_id},temp_branch_id.eq.${branch_id}`);
      }
      if (department && department !== 'all') fallbackQuery = fallbackQuery.eq('department', department);
      if (employment_type && employment_type !== 'all') fallbackQuery = fallbackQuery.eq('employment_type', employment_type);
      if (status && status !== 'all') fallbackQuery = fallbackQuery.eq('status', status);

      const fallbackRes = await fallbackQuery.order('created_at', { ascending: false });
      data = fallbackRes.data || [];
    }

    // Reliable branch enrichment so branches and temp_branches are always available
    try {
      const needsBranchLookup = (data || []).some(e => (!e.branches && e.branch_id) || (!e.temp_branches && e.temp_branch_id));
      if (needsBranchLookup) {
        const { data: allBranches } = await supabase.from('branches').select('id, code, name, tier, address, contact_number');
        if (allBranches && allBranches.length > 0) {
          const bMap = new Map(allBranches.map(b => [b.id, b]));
          data = (data || []).map(emp => ({
            ...emp,
            branches: emp.branches || (emp.branch_id ? bMap.get(emp.branch_id) : null),
            temp_branches: emp.temp_branches || (emp.temp_branch_id ? bMap.get(emp.temp_branch_id) : null)
          }));
        }
      }
    } catch (enrichErr) {
      // Keep data intact if lookup fails
    }

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createEmployee = async (req, res) => {
  const { 
    full_name, 
    employee_id, 
    designation, 
    department, 
    contact_mobile, 
    email, 
    joining_date,
    branch_id,
    employment_type,
    status,
    has_login_access
  } = req.body;
  
  try {
    // 1. Resolve or Auto-Generate Employee ID if left blank
    let finalEmpId = (employee_id || '').trim().toUpperCase();

    if (!finalEmpId) {
      const currentYear = new Date().getFullYear();
      const prefix = `EMP-${currentYear}-`;

      const { data: existingEmps } = await supabase
        .from('employees')
        .select('employee_id');

      const existingIds = new Set((existingEmps || []).map(e => (e.employee_id || '').toUpperCase()));

      let counter = (existingEmps || []).length + 1;
      do {
        finalEmpId = `${prefix}${String(counter).padStart(3, '0')}`;
        counter++;
      } while (existingIds.has(finalEmpId));
    } else {
      const { data: existing } = await supabase
        .from('employees')
        .select('id')
        .eq('employee_id', finalEmpId)
        .maybeSingle();
      if (existing) return res.status(400).json({ error: `Employee ID '${finalEmpId}' already exists. Please choose a unique ID or leave blank to auto-generate.` });
    }


    let userId = null;
    let credentials = null;

    // 2. Resolve or Auto-Create Role in user_types table for this Designation + Department combo
    const cleanDesig = (designation || '').trim();
    const cleanDept = (department || '').trim();
    
    // Determine combo role name (e.g., "Master Tailor - Production & Tailoring")
    let comboRoleName = (req.body.role_name && req.body.role_name.trim()) || '';
    if (!comboRoleName) {
      if (cleanDesig && cleanDept) {
        comboRoleName = `${cleanDesig} - ${cleanDept}`;
      } else {
        comboRoleName = cleanDesig || cleanDept || 'Staff';
      }
    }

    let staffRoleId = null;
    let isNewRoleCreated = false;

    // Check if an explicit role_id was passed
    if (req.body.role_id) {
      const { data: explicitRole } = await supabase
        .from('user_types')
        .select('id, name, permissions')
        .eq('id', req.body.role_id)
        .maybeSingle();
      if (explicitRole) {
        staffRoleId = explicitRole.id;
      }
    }

    // If role not yet resolved, check if a role matching the combo or designation exists in user_types
    if (!staffRoleId) {
      let { data: existingRole } = await supabase
        .from('user_types')
        .select('id, name, permissions')
        .ilike('name', comboRoleName)
        .maybeSingle();

      if (!existingRole && cleanDesig) {
        const { data: byDesig } = await supabase
          .from('user_types')
          .select('id, name, permissions')
          .ilike('name', cleanDesig)
          .maybeSingle();
        if (byDesig) existingRole = byDesig;
      }

      if (existingRole) {
        staffRoleId = existingRole.id;
        // If admin supplied custom permissions and wants to update the role
        if (Array.isArray(req.body.permissions) && req.body.permissions.length > 0 && req.body.update_role_permissions) {
          await supabase.from('user_types').update({ permissions: req.body.permissions }).eq('id', existingRole.id);
        }
      } else {
        // Combo does not exist in user_types table -> Create the new role!
        const assignedPermissions = Array.isArray(req.body.permissions) && req.body.permissions.length > 0
          ? req.body.permissions
          : getDefaultPermissionsForDepartment(cleanDept, cleanDesig);

        const { data: newRole, error: newRoleError } = await supabase
          .from('user_types')
          .insert([{
            name: comboRoleName,
            permissions: assignedPermissions
          }])
          .select()
          .single();

        if (newRoleError) {
          console.warn('[createEmployee] Failed to auto-insert new role into user_types:', newRoleError.message);
          const { data: anyRole } = await supabase.from('user_types').select('id').limit(1);
          staffRoleId = anyRole?.[0]?.id || null;
        } else {
          staffRoleId = newRole.id;
          isNewRoleCreated = true;
          console.log(`[createEmployee] Created new user_type role: '${comboRoleName}' with ${assignedPermissions.length} permissions.`);
        }
      }
    }

    // 3. Optionally Generate Credentials if has_login_access is enabled
    const shouldCreateLogin = has_login_access === true || has_login_access === 'true';

    if (shouldCreateLogin) {
      const namePrefix = full_name.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '');
      const cleanId = finalEmpId.toLowerCase().replace(/[^a-z0-9]/g, '');
      const empEmail = `${namePrefix}${cleanId}@inland.com`;
      const generatedPassword = generatePassword();

      // Create User Profile linked to the resolved/newly created role
      const { data: userData, error: userError } = await supabase
        .from('user_profiles')
        .insert([{
          full_name,
          email: empEmail,
          password: generatedPassword,
          user_type_id: staffRoleId
        }])
        .select()
        .single();

      if (userError) throw userError;

      userId = userData.id;
      credentials = {
        username: empEmail,
        password: generatedPassword
      };
    }

    // 3. Create Employee Record with branch_id and employment_type
    const empInsertData = {
      full_name,
      employee_id: finalEmpId,
      designation,
      department,
      contact_mobile,
      email, // Professional email if any
      joining_date: joining_date || new Date().toISOString().split('T')[0],
      user_id: userId,
      status: status || 'Active'
    };

    if (branch_id) empInsertData.branch_id = Number(branch_id);
    if (employment_type) empInsertData.employment_type = employment_type;

    let { data: empData, error: empError } = await supabase
      .from('employees')
      .insert([empInsertData])
      .select('*, branches:branches!branch_id(id, code, name, tier)')
      .single();

    // Fallback if branch_id or employment_type column is missing
    if (empError && (empError.message.includes('branch_id') || empError.message.includes('employment_type') || empError.message.includes('relationship'))) {
      delete empInsertData.branch_id;
      delete empInsertData.employment_type;
      const retry = await supabase.from('employees').insert([empInsertData]).select().single();
      empData = retry.data;
      empError = retry.error;
    }

    if (empError) {
      if (userId) {
        await supabase.from('user_profiles').delete().eq('id', userId);
      }
      throw empError;
    }

    // Automatically log initial work history placement (non-blocking)
    try {
      if (empData && empData.id) {
        await supabase.from('employee_work_history').insert([{
          employee_id: empData.id,
          branch_id: empData.branch_id || null,
          assignment_type: 'Initial Placement',
          designation: empData.designation || null,
          department: empData.department || null,
          start_date: empData.joining_date || new Date().toISOString().split('T')[0],
          is_current: true,
          remarks: 'Initial joining and branch assignment'
        }]);
      }
    } catch (whErr) {
      console.warn('Initial work history record skipped:', whErr.message);
    }

    // Audit log
    try {
      if (empData && empData.id) {
        await logAction(req.user?.id, 'CREATE', 'employee', empData.id, {
          full_name: empData.full_name,
          employee_id: empData.employee_id,
          branch_id: empData.branch_id,
          designation: empData.designation,
          department: empData.department,
          employment_type: empData.employment_type,
          performed_by_name: req.user?.fullName || req.user?.name || req.user?.email || 'Admin'
        });
      }
    } catch (logErr) {
      console.warn('Audit logging failed for createEmployee:', logErr.message);
    }

    res.json({
      success: true,
      employee: empData,
      credentials,
      roleCreated: isNewRoleCreated,
      roleId: staffRoleId
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: emp } = await supabase.from('employees').select('user_id, employee_id, full_name').eq('id', id).single();
    
    const { error: eError } = await supabase.from('employees').delete().eq('id', id);
    if (eError) throw eError;

    if (emp?.user_id) {
       await supabase.from('user_profiles').delete().eq('id', emp.user_id);
    }

    // Audit log
    try {
      await logAction(req.user?.id, 'DELETE', 'employee', id, {
        employee_id: emp?.employee_id || id,
        full_name: emp?.full_name,
        performed_by_name: req.user?.fullName || req.user?.name || req.user?.email || 'Admin'
      });
    } catch (logErr) {}

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: emp, error: empFetchErr } = await supabase
        .from('employees')
        .select('*, user_profiles(email)')
        .eq('id', id)
        .single();
        
    if (empFetchErr || !emp) throw new Error('Employee record not found');

    const newPassword = generatePassword();

    // If employee does not have an account yet, provision on-demand
    if (!emp.user_id) {
      const namePrefix = emp.full_name.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '');
      const cleanId = emp.employee_id.toLowerCase().replace(/[^a-z0-9]/g, '');
      const empEmail = `${namePrefix}${cleanId}@inland.com`;

      let staffRoleId = null;
      const { data: roleRecords } = await supabase
        .from('user_types')
        .select('id, name')
        .or('name.ilike.%staff%,name.ilike.%employee%')
        .limit(1);
      if (roleRecords && roleRecords.length > 0) {
        staffRoleId = roleRecords[0].id;
      }

      const { data: newUser, error: newUserErr } = await supabase
        .from('user_profiles')
        .insert([{
          full_name: emp.full_name,
          email: empEmail,
          password: newPassword,
          user_type_id: staffRoleId
        }])
        .select()
        .single();

      if (newUserErr) throw newUserErr;

      await supabase.from('employees').update({ user_id: newUser.id }).eq('id', id);

      return res.json({ 
        success: true, 
        newPassword,
        username: empEmail,
        isNewAccount: true
      });
    }

    // Existing account: update password
    await supabase.from('user_profiles').update({ password: newPassword }).eq('id', emp.user_id);

    // Audit log
    try {
      await logAction(req.user?.id, 'RESET_PASSWORD', 'employee', id, {
        employee_name: emp.full_name,
        employee_id: emp.employee_id,
        is_new_account: !emp.user_id,
        performed_by_name: req.user?.fullName || req.user?.name || req.user?.email || 'Admin'
      });
    } catch (logErr) {}

    res.json({ 
        success: true, 
        newPassword,
        username: emp.user_profiles?.email 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.syncUsername = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: emp, error: eError } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .single();
    
    if (eError || !emp) throw new Error('Employee not found');
    if (!emp.user_id) throw new Error('Employee has no portal account');

    const namePrefix = emp.full_name.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '');
    const cleanId = emp.employee_id.toLowerCase().replace(/[^a-z0-9]/g, '');
    const newEmail = `${namePrefix}${cleanId}@inland.com`;

    await supabase.from('user_profiles').update({ email: newEmail }).eq('id', emp.user_id);

    res.json({ success: true, newUsername: newEmail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateEmployee = async (req, res) => {
  const { id } = req.params;
  const { 
    full_name, 
    employee_id, 
    designation, 
    department, 
    contact_mobile, 
    email, 
    joining_date, 
    status,
    branch_id,
    employment_type 
  } = req.body;
  
  try {
    // Check if another employee has the same employee_id
    const { data: existing } = await supabase
      .from('employees')
      .select('id')
      .eq('employee_id', employee_id)
      .neq('id', id)
      .maybeSingle();

    if (existing) return res.status(400).json({ error: 'Employee ID already exists' });

    // Update Employee Record
    const updatePayload = {
      full_name,
      employee_id,
      designation,
      department,
      contact_mobile,
      email,
      joining_date,
      status
    };

    if (branch_id !== undefined) updatePayload.branch_id = branch_id ? Number(branch_id) : null;
    if (employment_type !== undefined) updatePayload.employment_type = employment_type;

    let { data: empData, error: empError } = await supabase
      .from('employees')
      .update(updatePayload)
      .eq('id', id)
      .select('*, branches:branches!branch_id(id, code, name, tier)')
      .single();

    // Fallback if branch_id / employment_type is not migrated or relationship fails
    if (empError && (empError.message.includes('branch_id') || empError.message.includes('employment_type') || empError.message.includes('relationship'))) {
      delete updatePayload.branch_id;
      delete updatePayload.employment_type;
      const retry = await supabase.from('employees').update(updatePayload).eq('id', id).select().single();
      empData = retry.data;
      empError = retry.error;
    }

    if (empError) throw empError;

    // Update user profile name if they have an account
    if (empData?.user_id) {
        await supabase.from('user_profiles').update({ full_name }).eq('id', empData.user_id);
    }

    // Audit log
    try {
      await logAction(req.user?.id, 'UPDATE', 'employee', id, {
        employee_id: empData?.employee_id || employee_id,
        full_name: empData?.full_name || full_name,
        updated_fields: Object.keys(updatePayload),
        performed_by_name: req.user?.fullName || req.user?.name || req.user?.email || 'Admin'
      });
    } catch (logErr) {}

    res.json({ success: true, employee: empData });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMyOrganizations = async (req, res) => {
  const { id } = req.params; // employee DB id
  try {
    const { data, error } = await supabase
      .from('organization_staff')
      .select(`
        id,
        assigned_at,
        allowed_measurement_fields,
        organizations (
          id,
          name,
          address,
          industry_id,
          industries ( name )
        )
      `)
      .eq('employee_id', id)
      .order('assigned_at', { ascending: false });

    if (error) throw error;

    // Flatten for convenience: pull organization fields up one level
    const result = (data || []).map(row => ({
      assignment_id: row.id,
      assigned_at: row.assigned_at,
      allowed_measurement_fields: row.allowed_measurement_fields || {},
      ...row.organizations
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Assign staff member to a temporary branch (Deputation)
exports.assignTempBranch = async (req, res) => {
  const { id } = req.params;
  const { temp_branch_id, temp_branch_until, temp_branch_notes } = req.body;

  try {
    if (!temp_branch_id) {
      return res.status(400).json({ error: 'Please select a temporary branch to depute to.' });
    }

    const { data: emp, error: fetchErr } = await supabase
      .from('employees')
      .select('id, branch_id, designation, department, full_name')
      .eq('id', id)
      .single();

    if (fetchErr || !emp) return res.status(404).json({ error: 'Employee not found.' });

    if (String(emp.branch_id) === String(temp_branch_id)) {
      return res.status(400).json({ error: 'Temporary deputation branch cannot be the same as their home branch.' });
    }

    const { data, error } = await supabase
      .from('employees')
      .update({
        temp_branch_id: Number(temp_branch_id),
        temp_branch_until: temp_branch_until || null,
        temp_branch_notes: temp_branch_notes || null
      })
      .eq('id', id)
      .select('*, branches:branches!branch_id(id, code, name, tier), temp_branches:branches!temp_branch_id(id, code, name, tier)')
      .single();

    if (error) throw error;

    // Log to employee_work_history
    try {
      await supabase
        .from('employee_work_history')
        .update({ is_current: false, end_date: new Date().toISOString().split('T')[0] })
        .eq('employee_id', id)
        .eq('assignment_type', 'Temporary Deputation')
        .eq('is_current', true);

      await supabase.from('employee_work_history').insert([{
        employee_id: Number(id),
        branch_id: Number(temp_branch_id),
        assignment_type: 'Temporary Deputation',
        designation: emp.designation || null,
        department: emp.department || null,
        start_date: new Date().toISOString().split('T')[0],
        end_date: temp_branch_until || null,
        is_current: true,
        remarks: temp_branch_notes || 'Temporary duty assignment'
      }]);
    } catch (whErr) {
      console.warn('Deputation work history log skipped:', whErr.message);
    }

    // Audit log
    try {
      await logAction(req.user?.id, 'DEPUTE', 'employee', id, {
        employee_name: emp.full_name,
        home_branch_id: emp.branch_id,
        temp_branch_id: Number(temp_branch_id),
        temp_branch_until,
        notes: temp_branch_notes,
        performed_by_name: req.user?.fullName || req.user?.name || req.user?.email || 'Admin'
      });
    } catch (logErr) {}

    res.json({ success: true, employee: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Recall staff member back to their home branch (End Deputation)
exports.recallTempBranch = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('employees')
      .update({
        temp_branch_id: null,
        temp_branch_until: null,
        temp_branch_notes: null
      })
      .eq('id', id)
      .select('*, branches:branches!branch_id(id, code, name, tier)')
      .single();

    if (error) throw error;

    // Log Recall to employee_work_history
    try {
      await supabase
        .from('employee_work_history')
        .update({ is_current: false, end_date: new Date().toISOString().split('T')[0] })
        .eq('employee_id', id)
        .eq('assignment_type', 'Temporary Deputation')
        .eq('is_current', true);

      await supabase.from('employee_work_history').insert([{
        employee_id: Number(id),
        branch_id: data.branch_id || null,
        assignment_type: 'Recall / Returned',
        designation: data.designation || null,
        department: data.department || null,
        start_date: new Date().toISOString().split('T')[0],
        is_current: true,
        remarks: 'Recalled back to home branch'
      }]);
    } catch (whErr) {
      console.warn('Recall work history log skipped:', whErr.message);
    }

    // Audit log
    try {
      await logAction(req.user?.id, 'RECALL', 'employee', id, {
        employee_name: data.full_name,
        home_branch_id: data.branch_id,
        performed_by_name: req.user?.fullName || req.user?.name || req.user?.email || 'Admin'
      });
    } catch (logErr) {}

    res.json({ success: true, employee: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Transfer employee to another branch permanently
exports.transferEmployee = async (req, res) => {
  const { id } = req.params;
  const { new_branch_id, effective_date, new_designation, new_department, remarks } = req.body;

  try {
    if (!new_branch_id) {
      return res.status(400).json({ error: 'Please select a destination branch for transfer.' });
    }

    const { data: emp, error: fetchErr } = await supabase
      .from('employees')
      .select('id, branch_id, designation, department, full_name, employee_id')
      .eq('id', id)
      .single();

    if (fetchErr || !emp) return res.status(404).json({ error: 'Employee not found.' });

    if (String(emp.branch_id) === String(new_branch_id)) {
      return res.status(400).json({ error: 'The destination branch must be different from current home branch.' });
    }

    const effDate = effective_date || new Date().toISOString().split('T')[0];

    const updateData = {
      branch_id: Number(new_branch_id),
      temp_branch_id: null,
      temp_branch_until: null,
      temp_branch_notes: null
    };

    if (new_designation) updateData.designation = new_designation;
    if (new_department) updateData.department = new_department;

    const { data: updatedEmp, error: updateErr } = await supabase
      .from('employees')
      .update(updateData)
      .eq('id', id)
      .select('*, branches:branches!branch_id(id, code, name, tier)')
      .single();

    if (updateErr) throw updateErr;

    // Log in employee_work_history
    try {
      await supabase
        .from('employee_work_history')
        .update({ is_current: false, end_date: effDate })
        .eq('employee_id', id)
        .eq('is_current', true);

      await supabase.from('employee_work_history').insert([{
        employee_id: Number(id),
        branch_id: Number(new_branch_id),
        assignment_type: 'Permanent Transfer',
        designation: new_designation || emp.designation,
        department: new_department || emp.department,
        start_date: effDate,
        is_current: true,
        remarks: remarks || 'Permanent branch transfer'
      }]);
    } catch (whErr) {
      console.warn('Work history logging for transfer skipped:', whErr.message);
    }

    // Audit log
    try {
      await logAction(req.user?.id, 'TRANSFER', 'employee', id, {
        employee_name: emp.full_name,
        from_branch_id: emp.branch_id,
        to_branch_id: Number(new_branch_id),
        effective_date: effDate,
        new_designation,
        new_department,
        remarks,
        performed_by_name: req.user?.fullName || req.user?.name || req.user?.email || 'Admin'
      });
    } catch (logErr) {}

    res.json({
      success: true,
      message: 'Employee permanently transferred successfully',
      employee: updatedEmp
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get complete work & branch movement history for an employee
exports.getEmployeeHistory = async (req, res) => {
  const { id } = req.params;

  try {
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('*, branches:branches!branch_id(id, code, name, tier, address), temp_branches:branches!temp_branch_id(id, code, name, tier, address)')
      .eq('id', id)
      .single();

    if (empErr || !emp) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    let historyRecords = [];
    try {
      const { data: records, error: histErr } = await supabase
        .from('employee_work_history')
        .select('*, branches:branches!branch_id(id, code, name, tier, address)')
        .eq('employee_id', id)
        .order('created_at', { ascending: false });

      if (!histErr && records && records.length > 0) {
        historyRecords = records;
      }
    } catch (e) {
      console.warn('Work history query fallback:', e.message);
    }

    // Auto-synthesize baseline entries if history ledger is currently empty
    if (historyRecords.length === 0) {
      const synthetic = [];

      if (emp.temp_branch_id && emp.temp_branches) {
        synthetic.push({
          id: 'syn-depute',
          employee_id: emp.id,
          branch_id: emp.temp_branch_id,
          assignment_type: 'Temporary Deputation',
          designation: emp.designation,
          department: emp.department,
          start_date: emp.joining_date || new Date().toISOString().split('T')[0],
          end_date: emp.temp_branch_until || null,
          is_current: true,
          remarks: emp.temp_branch_notes || 'Active temporary deputation',
          branches: emp.temp_branches,
          created_at: new Date().toISOString()
        });
      }

      if (emp.branch_id && emp.branches) {
        synthetic.push({
          id: 'syn-initial',
          employee_id: emp.id,
          branch_id: emp.branch_id,
          assignment_type: 'Initial Placement',
          designation: emp.designation,
          department: emp.department,
          start_date: emp.joining_date || new Date().toISOString().split('T')[0],
          end_date: null,
          is_current: !emp.temp_branch_id,
          remarks: 'Home branch assignment at joining',
          branches: emp.branches,
          created_at: emp.joining_date ? `${emp.joining_date}T00:00:00Z` : new Date().toISOString()
        });
      }

      historyRecords = synthetic;
    }

    res.json({
      success: true,
      employee: emp,
      history: historyRecords
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
