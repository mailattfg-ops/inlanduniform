const supabase = require("../config/supabase");

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

    // Manual Fetch for staff names (recorder) — recorded_by stores auth user_id (UUID)
    const recorderIds = [
      ...new Set(measurements.map((m) => m.recorded_by).filter(Boolean)),
    ];
    let profileMap = {};
    if (recorderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, user_id, full_name")
        .in("user_id", recorderIds);

      if (profiles) {
        profiles.forEach((p) => {
          profileMap[p.user_id] = p;
          profileMap[p.id] = p; // also index by numeric id as fallback
        });
      }
    }

    // Merge recorder profiles
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
    const { data, error } = await supabase
      .from("measurement_config")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
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
            recorded_by: recorded_by || req.user.id,
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
            recorded_by: recorded_by || req.user.id,
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

    res.json({ success: true, measurement: data });
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

    // Fetch unique recorder IDs
    const recorderIds = [
      ...new Set(measurements.map((m) => m.recorded_by).filter(Boolean)),
    ];

    let profileMap = {};
    if (recorderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, user_id, full_name")
        .in("user_id", recorderIds);

      if (profiles) {
        profiles.forEach((p) => {
          profileMap[p.user_id] = p;
          profileMap[p.id] = p;
        });
      }
    }

    // 3. Merge data
    const merged = measurements.map((m) => ({
      ...m,
      user_profiles: profileMap[m.recorded_by] || { full_name: "System" },
    }));

    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.addConfig = async (req, res) => {
  try {
    const { label, unit, display_order, is_required } = req.body;
    const { data, error } = await supabase
      .from("measurement_config")
      .insert([{ label, unit, display_order, is_required }])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res
          .status(400)
          .json({
            error: "A measurement metric with this label already exists",
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
