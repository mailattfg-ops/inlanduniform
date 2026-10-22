const supabase = require("../config/supabase");

// --- Departments Management ---

exports.getDepartments = async (req, res) => {
  const { orgId } = req.query;
  const user = req.user;

  try {
    let query = supabase
      .from("departments")
      .select("*, organizations(name)")
      .order("created_at", { ascending: false });

    // Strict Enforcement logic
    const role = (user.role || "").toLowerCase();
    const userOrgId = user.organizationId || user.schoolId;
    if (
      role === "school" ||
      role === "organization" ||
      role === "organisation" ||
      role === "entity" ||
      role === "student" ||
      role === "member" ||
      userOrgId
    ) {
      if (!userOrgId) {
        return res
          .status(403)
          .json({
            error:
              "Your account is not correctly linked to an organization record.",
          });
      }
      query = query.eq("organization_id", userOrgId);
    } else if (orgId) {
      query = query.eq("organization_id", orgId);
    }

    let { data, error } = await query;
    if (error) {
      console.error('❌ [DATABASE ERROR] Table "departments" query failed:');
      console.error('  Code:', error.code, '| Message:', error.message);
      if (error.code === '42P01') {
        console.error('  Hint: Table public.departments does not exist in database.');
      } else if (error.code === '42703') {
        console.error('  Hint: A referenced column does not exist on departments or joined organizations.');
      }
      return res.status(500).json({ error: error.message, code: error.code });
    }

    // Auto-create default 'Main' department if target organization has no departments
    const targetOrgId = userOrgId || orgId;
    if (targetOrgId && (!data || data.length === 0)) {
      try {
        const { data: defaultDept } = await supabase
          .from("departments")
          .insert([
            {
              organization_id: targetOrgId,
              name: "Main",
              section: "Main",
            },
          ])
          .select("*, organizations(name)")
          .single();

        if (defaultDept) {
          data = [defaultDept];
          await supabase
            .from("registry_members")
            .update({ department_id: defaultDept.id })
            .eq("organization_id", targetOrgId)
            .is("department_id", null);
        }
      } catch (deptErr) {
        console.warn("[getDepartments] Could not auto-create default Main department:", deptErr.message);
      }
    } else if (targetOrgId && data && data.length > 0) {
      const mainDept = data.find(
        (d) => (d.name || "").trim().toLowerCase() === "main"
      );
      if (mainDept) {
        await supabase
          .from("registry_members")
          .update({ department_id: mainDept.id })
          .eq("organization_id", targetOrgId)
          .is("department_id", null);
      }
    }

    // Map 'section' column to 'division' for frontend consistency
    const enriched = (data || []).map((d) => ({
      ...d,
      division: d.section,
    }));

    // Live data directly from database! If table is blank, returns []
    res.json(enriched);
  } catch (err) {
    console.error('❌ [DATABASE ERROR] getDepartments exception:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.createDepartment = async (req, res) => {
  const { orgId, name, division, grade, migration } = req.body;
  try {
    const { data, error } = await supabase
      .from("departments")
      .insert([
        {
          organization_id: orgId,
          name,
          section: division,
          grade: grade || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    let migratedMembersCount = 0;
    let mainDeptDeleted = false;

    // Handle migration from default Main department if requested
    if (migration && migration.mainDeptId) {
      const { replaceMainDept, migrateMembersFromMain, mainDeptId } = migration;

      if (migrateMembersFromMain) {
        // Move members assigned to mainDeptId to the new department
        const { data: m1 } = await supabase
          .from("registry_members")
          .update({ department_id: data.id })
          .eq("organization_id", orgId)
          .eq("department_id", mainDeptId)
          .select("id");

        // Also assign any unassigned members of this customer to new department
        const { data: m2 } = await supabase
          .from("registry_members")
          .update({ department_id: data.id })
          .eq("organization_id", orgId)
          .is("department_id", null)
          .select("id");

        migratedMembersCount = (m1?.length || 0) + (m2?.length || 0);
      }

      if (replaceMainDept) {
        // If members weren't moved to new department, clear foreign keys so delete succeeds
        if (!migrateMembersFromMain) {
          await supabase
            .from("registry_members")
            .update({ department_id: null })
            .eq("organization_id", orgId)
            .eq("department_id", mainDeptId);
        }

        const { error: delErr } = await supabase
          .from("departments")
          .delete()
          .eq("id", mainDeptId);

        if (!delErr) {
          mainDeptDeleted = true;
        } else {
          console.warn("[createDepartment] Could not delete main department:", delErr.message);
        }
      }
    }

    res.json({
      success: true,
      data: { ...data, division: data.section },
      migratedMembersCount,
      mainDeptDeleted,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateDepartment = async (req, res) => {
  const { id } = req.params;
  const { orgId, name, division, grade } = req.body;
  try {
    const { data, error } = await supabase
      .from("departments")
      .update({
        organization_id: orgId,
        name,
        section: division,
        grade: grade || null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({
      success: true,
      data: { ...data, division: data.section },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteDepartment = async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase.from("departments").delete().eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
