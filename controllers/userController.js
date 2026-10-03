const supabase = require("../config/supabase");

exports.getProfile = async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  try {
    // 1. Fetch base profile
    const { data: profile, error: pError } = await supabase
      .from("user_profiles")
      .select(
        `
        *,
        user_types (name, permissions)
      `,
      )
      .eq("id", userId)
      .single();

    if (pError || !profile) throw new Error("User profile not found");

    let profileData = {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.user_types?.name || "User",
      avatar_url: profile.avatar_url,
    };

    // 2. Fetch specific details based on role
    // First, always check if they are a member in the registry (to show measurements)
    const { data: memberData } = await supabase
      .from("registry_members")
      .select("*, organizations(name), departments(*)")
      .eq("user_id", userId)
      .maybeSingle();

    if (memberData) {
      profileData.memberDetails = memberData;
      // If they are a student, this is their primary detail
      if (profileData.role.toLowerCase() === "student") {
        profileData.details = memberData;
      }
    }

    // Then check role-specific tables
    if (
      profileData.role.toLowerCase() === "staff" ||
      profileData.role.toLowerCase() === "admin"
    ) {
      const { data } = await supabase
        .from("employees")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (data) profileData.details = data;
    } else if (
      ["school", "organization", "entity"].includes(
        profileData.role.toLowerCase(),
      )
    ) {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (data) profileData.details = data;
    }

    res.json(profileData);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch full profile" });
  }
};

exports.updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { avatar_url, full_name } = req.body;

  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .update({ avatar_url, full_name })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const DEFAULT_SYSTEM_ROLES = [
  {
    name: "Admin",
    permissions: ["all"],
  },
  {
    name: "Branch Manager",
    permissions: [
      "branch_inventory",
      "branch_sales",
      "branch_transfers",
      "view_employees",
      "view_organizations",
      "manage_schools",
      "view_schools",
      "manage_classes",
      "manage_departments",
      "view_students",
      "register_students",
      "manage_students",
      "view_products",
      "manage_products",
      "view_measurements",
      "manage_measurements",
      "manage_quotations",
      "view_quotations",
      "manage_invoices",
      "view_invoices",
    ],
  },
  {
    name: "Branch Staff",
    permissions: [
      "branch_inventory",
      "branch_sales",
      "view_organizations",
      "view_schools",
      "view_students",
      "register_students",
      "view_products",
      "view_measurements",
      "manage_measurements",
      "view_quotations",
      "view_invoices",
    ],
  },
  {
    name: "Factory PO Handler",
    permissions: [
      "factory_po_handler",
      "factory_floor",
      "view_inventory",
      "manage_inventory",
    ],
  },
  {
    name: "Factory Production Staff",
    permissions: ["factory_floor"],
  },
  {
    name: "Marketing Executive",
    permissions: [
      "manage_quotations",
      "view_quotations",
      "branch_sales",
      "view_organizations",
      "view_schools",
      "view_products",
    ],
  },
  {
    name: "Inventory Manager",
    permissions: [
      "view_inventory",
      "manage_inventory",
      "view_products",
      "manage_products",
      "view_size_charts",
      "manage_size_charts",
    ],
  },
  {
    name: "Corporate Approver",
    permissions: [
      "corporate_approver",
      "view_quotations",
      "view_organizations",
      "view_schools",
      "view_products",
    ],
  },
  {
    name: "Organisation",
    permissions: [
      "view_schools",
      "view_own_students",
      "manage_classes",
      "view_own_measurements",
    ],
  },
  {
    name: "Entity",
    permissions: ["view_own_students", "view_own_measurements"],
  },
];

exports.getUserTypes = async (req, res) => {
  try {
    const { data, error } = await supabase.from("user_types").select("*");
    if (error) throw error;

    let roles = data || [];
    const existingNames = new Set(
      roles.map((r) => (r.name || "").toLowerCase().trim()),
    );

    // Check if any default system roles are missing; if so, insert them
    const missingRoles = DEFAULT_SYSTEM_ROLES.filter(
      (def) => !existingNames.has(def.name.toLowerCase().trim()),
    );

    if (missingRoles.length > 0) {
      try {
        const { data: inserted, error: insErr } = await supabase
          .from("user_types")
          .insert(missingRoles)
          .select();
        if (!insErr && inserted) {
          roles = [...roles, ...inserted];
        }
      } catch (seedErr) {
        console.warn(
          "Note: Could not auto-insert missing system roles:",
          seedErr.message,
        );
      }
    }

    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateUserType = async (req, res) => {
  const { id } = req.params;
  const { name, permissions } = req.body;

  try {
    const { data, error } = await supabase
      .from("user_types")
      .update({ name, permissions })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createUserType = async (req, res) => {
  const { name, permissions } = req.body;

  try {
    const { data, error } = await supabase
      .from("user_types")
      .insert([{ name, permissions }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteUserType = async (req, res) => {
  const { id } = req.params;

  try {
    // Protect core system roles
    const PROTECTED_ROLES = ["Admin", "Branch Manager", "Factory PO Handler"];
    const { data: roleToDelete } = await supabase
      .from("user_types")
      .select("name")
      .eq("id", id)
      .maybeSingle();

    if (
      roleToDelete &&
      PROTECTED_ROLES.some(
        (r) =>
          r.toLowerCase() === (roleToDelete.name || "").toLowerCase().trim(),
      )
    ) {
      return res.status(400).json({
        error: `The '${roleToDelete.name}' role is a core system role and cannot be deleted. You can modify its permissions instead.`,
      });
    }

    // Check if role is in use
    const { count, error: countError } = await supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true })
      .eq("user_type_id", id);

    if (countError) throw countError;

    if (count > 0) {
      return res.status(400).json({
        error: `This role is currently assigned to ${count} user(s). Please reassign them to another role before deleting.`,
      });
    }

    const { error } = await supabase.from("user_types").delete().eq("id", id);

    if (error) throw error;
    res.json({ success: true, message: "Role deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createUser = async (req, res) => {
  // Implementation for creating new user accounts
};
