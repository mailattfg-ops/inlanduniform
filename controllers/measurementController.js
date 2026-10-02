const supabase = require("../config/supabase");

/**
 * Helper to fetch detailed staff profile (including employee ID and designation)
 * for a list of recorder IDs.
 */
async function getRecorderProfiles(recorderIds) {
  let profileMap = {};
  if (!recorderIds || recorderIds.length === 0) return profileMap;

  const validIds = [...new Set(recorderIds.filter(Boolean))];
  const userProfileIds = validIds.filter((id) => !String(id).startsWith("branch_user_"));
  const branchUserIds = validIds
    .filter((id) => String(id).startsWith("branch_user_"))
    .map((id) => String(id).replace("branch_user_", ""));

  if (userProfileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, full_name, email")
      .in("id", userProfileIds);

    const { data: employees } = await supabase
      .from("employees")
      .select("id, employee_id, full_name, designation, department, user_id")
      .in("user_id", userProfileIds);

    if (profiles) {
      profiles.forEach((p) => {
        const emp = employees?.find((e) => String(e.user_id) === String(p.id));
        const prof = {
          id: p.id,
          full_name: emp?.full_name || p.full_name || "Staff",
          email: p.email,
          employee_id:
            emp?.employee_id ||
            (p.id === 1 ? "ADM-001" : `EMP-${String(p.id).padStart(3, "0")}`),
          designation:
            emp?.designation ||
            (p.id === 1 ? "System Administrator" : "Staff Officer"),
          department: emp?.department || null,
        };
        profileMap[p.id] = prof;
        profileMap[String(p.id)] = prof;
      });
    }

    if (employees) {
      employees.forEach((emp) => {
        if (!profileMap[emp.id]) {
          const prof = {
            id: emp.user_id || emp.id,
            full_name: emp.full_name,
            email: emp.email || "",
            employee_id: emp.employee_id,
            designation: emp.designation || "Staff Officer",
            department: emp.department || null,
          };
          profileMap[emp.id] = prof;
          profileMap[String(emp.id)] = prof;
        }
      });
    }
  }

  if (branchUserIds.length > 0) {
    const { data: bProfiles } = await supabase
      .from("branch_users")
      .select("id, name, email")
      .in("id", branchUserIds);

    if (bProfiles) {
      bProfiles.forEach((bp) => {
        const key = `branch_user_${bp.id}`;
        profileMap[key] = {
          id: key,
          full_name: bp.name,
          email: bp.email,
          employee_id: `BRN-${bp.id}`,
          designation: "Branch Staff",
          department: "Retail & Counter",
        };
      });
    }
  }

  return profileMap;
}


exports.listMeasurements = async (req, res) => {
  const user = req.user;
  const { orgId, deptId } = req.query;

  try {
    let query = supabase
      .from("measurements")
      .select(
        "*, registry_members!inner(full_name, admission_no, organization_id, department_id, organizations(name))",
      )
      .order("recorded_at", { ascending: false });

    if (orgId) {
      query = query.eq("registry_members.organization_id", orgId);
    }
    if (deptId) {
      query = query.eq("registry_members.department_id", deptId);
    }

    // Strict Enforcement logic
    const role = user.role?.toLowerCase();
    if (
      role === "entity" ||
      role === "student" ||
      role === "member" ||
      user.memberId
    ) {
      // Entity / Member should ONLY see their own measurements!
      if (user.memberId) {
        query = query.eq("member_id", user.memberId);
      } else {
        query = query.eq("registry_members.user_id", user.id);
      }
    } else if (
      role === "school" ||
      role === "organization" ||
      role === "organisation" ||
      user.organizationId
    ) {
      if (!user.organizationId) {
        return res
          .status(403)
          .json({
            error:
              "Your account is not correctly linked to an organization record.",
          });
      }
      query = query.eq("registry_members.organization_id", user.organizationId);
    }

    const { data: measurements, error } = await query;
    if (error) throw error;

    if (!measurements || measurements.length === 0) {
      return res.json([]);
    }

    // Enrich with recorder profiles (including designation and employee ID)
    const recorderIds = measurements.map((m) => m.recorded_by).filter(Boolean);
    const profileMap = await getRecorderProfiles(recorderIds);

    const enriched = measurements.map((m) => ({
      ...m,
      user_profiles: profileMap[m.recorded_by] || null,
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listConfig = async (req, res) => {
  try {
    const { product_type_id } = req.query;

    let query = supabase
      .from("measurement_config")
      .select("*, product_types(id, name)")
      .order("display_order", { ascending: true });

    if (product_type_id) {
      if (product_type_id === "null" || product_type_id === "universal") {
        query = query.is("product_type_id", null);
      } else {
        query = query.or(`product_type_id.eq.${product_type_id},product_type_id.is.null`);
      }
    }

    const { data, error } = await query;

    if (error) {
      // Fallback query without join in case column or relation is still caching
      const fallbackQuery = await supabase
        .from("measurement_config")
        .select("*")
        .order("display_order", { ascending: true });

      if (!fallbackQuery.error && fallbackQuery.data) {
        return res.json(fallbackQuery.data);
      }

      console.warn("Could not query measurement_config:", error.message);
      return res.json([
        { id: 1, label: "Chest", unit: "Inches", display_order: 1, is_required: true },
        { id: 2, label: "Waist", unit: "Inches", display_order: 2, is_required: true },
        { id: 3, label: "Length", unit: "Inches", display_order: 3, is_required: true },
        { id: 4, label: "Shoulder", unit: "Inches", display_order: 4, is_required: false },
        { id: 5, label: "Sleeve Length", unit: "Inches", display_order: 5, is_required: false },
        { id: 6, label: "Neck", unit: "Inches", display_order: 6, is_required: false },
        { id: 7, label: "Hip", unit: "Inches", display_order: 7, is_required: false },
        { id: 8, label: "Inseam", unit: "Inches", display_order: 8, is_required: false }
      ]);
    }
    res.json(data || []);
  } catch (err) {
    console.error("measurementController.listConfig caught exception:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.saveMeasurement = async (req, res) => {
  const {
    member_id,
    dynamic_data,
    suggested_size,
    notes,
    recorded_by,
    status,
    force_new,
  } = req.body;

  if (!member_id) {
    return res.status(400).json({ error: "Member ID is required." });
  }

  try {
    // PRD Quality Gate: All newly captured or updated measurements must enter as 'Pending'
    // for Admin inspection and verification at /admin/approvals/measurements.
    const targetStatus = "Pending";

    let data, error;

    const activeRecorderId = req.user?.id || recorded_by || null;

    if (!force_new) {
      // Check if a Pending measurement already exists for this member
      const { data: existing } = await supabase
        .from("measurements")
        .select("id")
        .eq("member_id", member_id)
        .eq("status", "Pending")
        .limit(1);

      if (existing && existing.length > 0) {
        // UPDATE the existing pending record instead of creating a duplicate
        ({ data, error } = await supabase
          .from("measurements")
          .update({
            dynamic_data,
            suggested_size,
            notes,
            status: targetStatus,
            reviewer_id: null,
            reviewed_at: null,
            recorded_by: activeRecorderId,
            recorded_at: new Date(),
          })
          .eq("id", existing[0].id)
          .select()
          .single());
      }
    }

    if (!data) {
      // No pending record or force_new requested — create a fresh measurement row
      ({ data, error } = await supabase
        .from("measurements")
        .insert([
          {
            member_id,
            recorded_by: activeRecorderId,
            dynamic_data,
            suggested_size,
            notes,
            status: targetStatus,
            reviewer_id: null,
            reviewed_at: null,
            recorded_at: new Date(),
          },
        ])
        .select()
        .single());
    }

    if (error) throw error;

    // Auto-sync measurement readiness to orders and job cards
    try {
      const { data: member } = await supabase
        .from("registry_members")
        .select("id, organization_id")
        .eq("id", member_id)
        .maybeSingle();

      if (member?.organization_id) {
        const { data: quotes } = await supabase
          .from("quotations")
          .select("id")
          .eq("organization_id", member.organization_id);

        if (quotes && quotes.length > 0) {
          const quoteIds = quotes.map((q) => q.id);
          const { data: orders } = await supabase
            .from("orders")
            .select("id")
            .in("quotation_id", quoteIds);

          if (orders && orders.length > 0) {
            const { syncJobCardsForOrder } = require("./jobCardController");
            for (const o of orders) {
              await syncJobCardsForOrder(o.id);
            }
          }
        }
      }
    } catch (syncErr) {
      console.error(
        "[MeasurementController] Job Card sync error after saveMeasurement:",
        syncErr.message,
      );
    }

    // Log the action
    const { logAction } = require("../utils/logger");
    await logAction(req.user.id, "SAVE", "measurement", member_id, {
      suggested_size,
      status: targetStatus,
      notes: notes?.substring(0, 50),
    });

    // Enrich saved measurement with recorder profile
    const profileMap = await getRecorderProfiles([activeRecorderId]);
    const enrichedMeasurement = {
      ...data,
      user_profiles: profileMap[activeRecorderId] || null,
    };

    res.json({ success: true, measurement: enrichedMeasurement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStudentHistory = async (req, res) => {
  const { memberId } = req.params;
  try {
    // 1. Fetch measurements
    const { data: measurements, error } = await supabase
      .from("measurements")
      .select("*")
      .eq("member_id", memberId)
      .order("recorded_at", { ascending: false });

    if (error) throw error;

    if (!measurements || measurements.length === 0) {
      return res.json([]);
    }

    // 2. Fetch recorder profiles
    const recorderIds = measurements.map((m) => m.recorded_by).filter(Boolean);
    const profileMap = await getRecorderProfiles(recorderIds);

    // 3. Merge data
    const merged = measurements.map((m) => ({
      ...m,
      user_profiles: profileMap[m.recorded_by] || {
        full_name: "Staff",
        designation: "Staff Officer",
        employee_id: null,
      },
    }));

    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.addConfig = async (req, res) => {
  try {
    const { label, unit, display_order, is_required, product_type_id, description } = req.body;
    const cleanProductTypeId = product_type_id ? parseInt(product_type_id) : null;

    const payload = {
      label: label?.trim(),
      unit: unit || "Inches",
      display_order: display_order || 1,
      is_required: Boolean(is_required),
      product_type_id: cleanProductTypeId,
      description: description?.trim() || null,
    };

    let { data, error } = await supabase
      .from("measurement_config")
      .insert([payload])
      .select("*, product_types(id, name)")
      .single();

    if (error && (error.message?.includes("product_type_id") || error.message?.includes("description"))) {
      if (error.message?.includes("product_type_id")) delete payload.product_type_id;
      if (error.message?.includes("description")) delete payload.description;
      const retry = await supabase
        .from("measurement_config")
        .insert([payload])
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (error.code === "23505") {
        return res.status(400).json({
          error: "A measurement metric with this label already exists for this product type",
        });
      }
      throw error;
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, unit, display_order, is_required, product_type_id, description } = req.body;
    const cleanProductTypeId = product_type_id ? parseInt(product_type_id) : null;

    const payload = {
      label: label?.trim(),
      unit: unit || "Inches",
      display_order: display_order || 1,
      is_required: Boolean(is_required),
      product_type_id: cleanProductTypeId,
      description: description !== undefined ? (description?.trim() || null) : undefined,
    };

    // Remove undefined properties
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    let { data, error } = await supabase
      .from("measurement_config")
      .update(payload)
      .eq("id", id)
      .select("*, product_types(id, name)")
      .single();

    if (error && (error.message?.includes("product_type_id") || error.message?.includes("description"))) {
      if (error.message?.includes("product_type_id")) delete payload.product_type_id;
      if (error.message?.includes("description")) delete payload.description;
      const retry = await supabase
        .from("measurement_config")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (error.code === "23505") {
        return res.status(400).json({
          error: "A measurement metric with this label already exists for this product type",
        });
      }
      throw error;
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from("measurement_config")
      .delete()
      .eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res
      .status(500)
      .json({
        error:
          "Cannot delete this label. It might be linked to historical records.",
      });
  }
};

exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status, remarks } = req.body;
  const adminId = req.user.id;

  try {
    const { data, error } = await supabase
      .from("measurements")
      .update({
        status: status || "Approved",
        reviewer_id: adminId,
        reviewed_at: new Date(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Auto-sync measurement readiness to orders and job cards
    try {
      const { data: member } = await supabase
        .from("registry_members")
        .select("id, organization_id")
        .eq("id", data.member_id)
        .maybeSingle();

      if (member?.organization_id) {
        const { data: quotes } = await supabase
          .from("quotations")
          .select("id")
          .eq("organization_id", member.organization_id);

        if (quotes && quotes.length > 0) {
          const quoteIds = quotes.map((q) => q.id);
          const { data: orders } = await supabase
            .from("orders")
            .select("id")
            .in("quotation_id", quoteIds);

          if (orders && orders.length > 0) {
            const { syncJobCardsForOrder } = require("./jobCardController");
            for (const o of orders) {
              await syncJobCardsForOrder(o.id);
            }
          }
        }
      }
    } catch (syncErr) {
      console.error(
        "[MeasurementController] Job Card sync error after status update:",
        syncErr.message,
      );
    }

    // Log the action
    const { logAction } = require("../utils/logger");
    await logAction(
      adminId,
      (status || "APPROVED").toUpperCase(),
      "measurement",
      id,
      {
        message: `Measurement marked as ${status}`,
        remarks,
      },
    );

    res.json({ success: true, measurement: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
