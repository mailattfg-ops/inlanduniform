const supabase = require("../config/supabase");
const crypto = require("crypto");
const { logAction } = require("../utils/logger");

const generatePassword = () =>
  crypto.randomBytes(4).toString("hex").toUpperCase();

// Helper to generate next customer code (CN001, CN002, etc.)
async function generateNextCustomerCodeLocal() {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("customer_code")
      .ilike("customer_code", "CN%")
      .order("customer_code", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching customer codes:", error.message);
      return "CN001";
    }

    let maxNum = 0;
    if (data && data.length > 0) {
      data.forEach((item) => {
        const c = item.customer_code;
        if (c && c.toUpperCase().startsWith("CN")) {
          const numPart = c.substring(2);
          const num = parseInt(numPart, 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
    }

    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(3, "0");
    return `CN${padded}`;
  } catch (err) {
    console.error("Exception in generateNextCustomerCodeLocal:", err.message);
    return "CN001";
  }
}

// --- Organizations Management ---

exports.getOrganizations = async (req, res) => {
  try {
    const { industryId } = req.query;
    const userRole = req.user?.role || "";
    const userBranchId = req.user?.branchId;
    const isAdmin =
      userRole === "Admin" ||
      userRole === "Super Admin" ||
      userRole === "SuperAdmin" ||
      userRole === "System Administrator" ||
      userRole === "System Admin";

    let query = supabase
      .from("organizations")
      .select("*, industries(name)")
      .order("created_at", { ascending: false });

    const roleLower = (userRole || "").toLowerCase();
    const userOrgId = req.user?.organizationId;

    if (
      roleLower === "organisation" ||
      roleLower === "organization" ||
      roleLower === "school" ||
      roleLower === "entity" ||
      roleLower === "student" ||
      roleLower === "member" ||
      userOrgId
    ) {
      if (userOrgId) {
        query = query.eq("id", userOrgId);
      } else {
        return res.json([]);
      }
    } else if (!isAdmin && userBranchId) {
      query = query.eq("branch_id", userBranchId);
    }

    if (industryId) {
      query = query.eq("industry_id", industryId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ [DATABASE ERROR] Table "organizations" query failed:');
      console.error("  Code:", error.code, "| Message:", error.message);
      if (error.code === "42P01") {
        console.error(
          "  Hint: Table public.organizations does not exist in database.",
        );
      } else if (error.code === "42703") {
        console.error(
          "  Hint: A referenced column does not exist on organizations or joined tables.",
        );
      }
      return res.status(500).json({ error: error.message, code: error.code });
    }

    // Safely attach relationship_manager from employees table if relationship_manager_id is present
    let enriched = data || [];
    const rmIds = enriched
      .map((o) => o.relationship_manager_id)
      .filter(Boolean);
    if (rmIds.length > 0) {
      try {
        const { data: emps } = await supabase
          .from("employees")
          .select("id, full_name, employee_id")
          .in("id", rmIds);
        if (emps && emps.length > 0) {
          const empMap = new Map(emps.map((e) => [e.id, e]));
          enriched = enriched.map((o) => ({
            ...o,
            relationship_manager: o.relationship_manager_id
              ? empMap.get(o.relationship_manager_id) || null
              : null,
          }));
        }
      } catch (empErr) {
        console.warn("[getOrganizations] Could not enrich RM:", empErr.message);
      }
    }

    // Calculate real-time financial receivables and credits strictly from generated invoices (NOT quotations)
    try {
      const orgIds = enriched.map((o) => o.id).filter(Boolean);
      if (orgIds.length > 0) {
        // Parallelize financial metrics queries and scope to active organizations using index
        const [
          { data: invoicesData, error: invFetchErr },
          { data: quotesData }
        ] = await Promise.all([
          supabase
            .from("invoices")
            .select("id, organization_id, total_amount, status")
            .in("organization_id", orgIds),
          supabase
            .from("quotations")
            .select("id, organization_id, paid_amount")
            .in("organization_id", orgIds)
        ]);

        if (invFetchErr) {
          console.warn("[getOrganizations] Could not fetch invoices:", invFetchErr.message);
        }

        const dueByOrg = {};
        const creditByOrg = {};
        const totalInvoicedByOrg = {};
        const totalPaidByOrg = {};
        const orgsWithInvoices = new Set();

        if (invoicesData && invoicesData.length > 0) {
          invoicesData.forEach((inv) => {
            const matchedOrgId = inv.organization_id;

            if (matchedOrgId && orgIds.includes(matchedOrgId)) {
              orgsWithInvoices.add(matchedOrgId);
              const total = parseFloat(inv.total_amount || 0);
              const isPaid = inv.status === "Paid" || inv.status === "Fully Paid";
              const paid = isPaid ? total : 0;
              
              // Receivables: (invoice - amount paid) when unpaid
              const balance = isPaid ? 0 : total;
              dueByOrg[matchedOrgId] = (dueByOrg[matchedOrgId] || 0) + balance;

              // Track organization totals
              totalInvoicedByOrg[matchedOrgId] = (totalInvoicedByOrg[matchedOrgId] || 0) + total;
              totalPaidByOrg[matchedOrgId] = (totalPaidByOrg[matchedOrgId] || 0) + paid;

              // Credit per invoice: (amount paid - invoice) when paid > total
              const invoiceCredit = Math.max(0, paid - total);
              creditByOrg[matchedOrgId] = (creditByOrg[matchedOrgId] || 0) + invoiceCredit;
            }
          });
        }

        // Check any advance payments recorded for these organizations
        (quotesData || []).forEach((q) => {
          if (q.organization_id) {
            const qPaid = parseFloat(q.paid_amount || 0);
            if (qPaid > 0 && !orgsWithInvoices.has(q.organization_id)) {
              // Advance payments received before invoice generation: credit = (amount paid - 0 invoice)
              totalPaidByOrg[q.organization_id] = (totalPaidByOrg[q.organization_id] || 0) + qPaid;
              creditByOrg[q.organization_id] = (creditByOrg[q.organization_id] || 0) + qPaid;
            }
          }
        });

        enriched = enriched.map((o) => {
          // Receivables are calculated strictly against generated invoices, NEVER quotations
          const invoiceDue = dueByOrg[o.id] || 0;
          const finalReceivables = orgsWithInvoices.has(o.id) ? invoiceDue : 0;

          // Credit is calculated strictly by (amount paid - invoice)
          const totalInvoiced = totalInvoicedByOrg[o.id] || 0;
          const totalPaid = totalPaidByOrg[o.id] || 0;
          const netCredit = Math.max(0, totalPaid - totalInvoiced);
          const invExcessCredit = creditByOrg[o.id] || 0;
          const calculatedCredits = Math.max(netCredit, invExcessCredit);

          return {
            ...o,
            receivables: Math.round(finalReceivables * 100) / 100,
            credits: Math.round(calculatedCredits * 100) / 100,
          };
        });
      }
    } catch (finErr) {
      console.warn("[getOrganizations] Could not enrich financial dues:", finErr.message);
      enriched = enriched.map((o) => ({
        ...o,
        receivables: 0,
        credits: 0,
      }));
    }

    enriched = enriched.map((o) => {
      const resolvedNum = o.contact_number || o.contact_phone || o.phone || null;
      const resolvedEmail = o.contact_email || o.email || null;
      return {
        ...o,
        contact_number: resolvedNum,
        contact_phone: resolvedNum,
        phone: resolvedNum,
        contact_email: resolvedEmail,
        email: resolvedEmail,
        is_b2b: Boolean(o.is_b2b || (o.gst_number && String(o.gst_number).trim() !== '')),
      };
    });

    console.log(`[DB] Fetched ${enriched.length} organizations`);
    res.json(enriched);
  } catch (err) {
    console.error("[getOrganizations] Exception:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.createOrganization = async (req, res) => {
  const {
    name,
    address,
    city,
    state,
    pincode,
    pin_code,
    country,
    phone,
    email,
    contact_email,
    contact_person,
    username,
    password,
    industry_id,
    relationship_manager_id,
    customer_code,
    receivables,
    credits,
    gst_number,
    pan_number,
    legal_name,
    delivery_address,
    delivery_city,
    delivery_state,
    delivery_pincode,
    delivery_country,
    is_b2b,
    credit_period_days,
  } = req.body;

  try {
    // 1. Validate credentials & phone
    if (!username || !password) {
      return res.status(400).json({
        error:
          "Username and password are required for organization registration.",
      });
    }

    if (!phone || String(phone).trim() === "") {
      return res.status(400).json({
        error: "Phone number is required for customer registration.",
      });
    }

    const cleanEmail =
      email && String(email).trim() !== ""
        ? String(email).trim().toLowerCase()
        : null;

    // Check if username/email already taken in user_profiles
    let userCollisionQuery = supabase.from("user_profiles").select("id");
    if (cleanEmail) {
      userCollisionQuery = userCollisionQuery.or(
        `email.eq.${cleanEmail},username.eq.${username}`,
      );
    } else {
      userCollisionQuery = userCollisionQuery.eq("username", username);
    }
    const { data: existingUser } = await userCollisionQuery.maybeSingle();

    if (existingUser) {
      return res.status(400).json({
        error: `Username "${username}" or email is already in use. Please choose a different username.`,
      });
    }

    // 2. Create User Profile first - dynamically resolve valid user_type_id from user_types table
    let orgRoleId = null;
    const { data: roleRecords } = await supabase
      .from("user_types")
      .select("id, name")
      .or("name.ilike.%organis%,name.ilike.%customer%,name.ilike.%school%")
      .limit(1);

    if (roleRecords && roleRecords.length > 0) {
      orgRoleId = roleRecords[0].id;
    } else {
      const { data: anyRole } = await supabase
        .from("user_types")
        .select("id")
        .limit(1);
      if (anyRole && anyRole.length > 0) {
        orgRoleId = anyRole[0].id;
      } else {
        const { data: newRole } = await supabase
          .from("user_types")
          .insert([
            {
              name: "Organisation",
              permissions: [
                "view_schools",
                "view_own_students",
                "manage_classes",
                "view_own_measurements",
              ],
            },
          ])
          .select("id")
          .single();
        if (newRole) orgRoleId = newRole.id;
      }
    }

    const { data: userData, error: userError } = await supabase
      .from("user_profiles")
      .insert([
        {
          full_name: name,
          username: username,
          email: cleanEmail,
          password: password,
          user_type_id: orgRoleId,
        },
      ])
      .select()
      .single();

    if (userError) throw userError;

    // Generate next customer code if not provided
    let finalCustomerCode = customer_code;
    if (!finalCustomerCode || finalCustomerCode.trim() === "") {
      finalCustomerCode = await generateNextCustomerCodeLocal();
    }

    // 3. Create Organization and link to user
    const resolvedPincode = (pincode !== undefined ? pincode : pin_code) ? String(pincode || pin_code).trim() : null;
    const rawPhone = phone !== undefined ? phone : (req.body.contact_number !== undefined ? req.body.contact_number : req.body.contact_phone);
    const cleanPhone = rawPhone ? String(rawPhone).trim() : null;
    const resolvedContactEmail = contact_email || email || cleanEmail || null;

    // Automatically resolve relationship manager (sales person) from logged-in user
    let resolvedRmId = relationship_manager_id ? parseInt(relationship_manager_id, 10) : null;
    if (!resolvedRmId && req.user) {
      if (req.user.employeeRecordId) {
        resolvedRmId = req.user.employeeRecordId;
      } else {
        try {
          let empQuery = supabase.from("employees").select("id");
          if (req.user.employeeId) {
            empQuery = empQuery.eq("employee_id", req.user.employeeId);
          } else if (req.user.id && !String(req.user.id).startsWith("branch_user_")) {
            empQuery = empQuery.eq("user_id", req.user.id);
          } else if (req.user.email) {
            empQuery = empQuery.eq("email", String(req.user.email).trim().toLowerCase());
          }
          const { data: userEmp } = await empQuery.maybeSingle();
          if (userEmp) {
            resolvedRmId = userEmp.id;
          }
        } catch (eErr) {
          console.warn("[createOrganization] Could not auto-resolve employee ID for RM:", eErr.message);
        }
      }
    }

    const orgPayload = {
      name,
      contact_person: contact_person ? String(contact_person).trim() : null,
      contact_email: resolvedContactEmail ? String(resolvedContactEmail).trim().toLowerCase() : null,
      address: address ? String(address).trim() : null,
      city: city ? String(city).trim() : null,
      state: state ? String(state).trim() : null,
      pincode: resolvedPincode,
      country: country ? String(country).trim() : 'India',
      contact_number: cleanPhone,
      user_id: userData.id,
      industry_id: industry_id || 1, // Default to 1 (School) for backward compatibility
      customer_code: finalCustomerCode,
      relationship_manager_id: resolvedRmId,
      receivables: receivables !== undefined && receivables !== null && !isNaN(parseFloat(receivables)) ? parseFloat(receivables) : 0,
      credits: credits !== undefined && credits !== null && !isNaN(parseFloat(credits)) ? parseFloat(credits) : 0,
      gst_number: gst_number ? String(gst_number).trim().toUpperCase() : null,
      pan_number: pan_number ? String(pan_number).trim().toUpperCase() : (gst_number && String(gst_number).trim().length >= 12 ? String(gst_number).trim().substring(2, 12).toUpperCase() : null),
      legal_name: legal_name ? String(legal_name).trim() : null,
      delivery_address: delivery_address ? String(delivery_address).trim() : null,
      delivery_city: delivery_city ? String(delivery_city).trim() : null,
      delivery_state: delivery_state ? String(delivery_state).trim() : null,
      delivery_pincode: delivery_pincode ? String(delivery_pincode).trim() : null,
      delivery_country: delivery_country ? String(delivery_country).trim() : 'India',
      is_b2b: Boolean(gst_number && String(gst_number).trim() !== '') || Boolean(is_b2b),
      credit_period_days: credit_period_days !== undefined && credit_period_days !== null && !isNaN(parseInt(credit_period_days, 10)) ? parseInt(credit_period_days, 10) : 30,
    };

    let currentInsert = { ...orgPayload };
    let insertResult = null;
    let insertError = null;

    for (let attempt = 0; attempt <= 12; attempt++) {
      const { data: resData, error: resErr } = await supabase
        .from("organizations")
        .insert([currentInsert])
        .select()
        .maybeSingle();

      if (!resErr) {
        insertResult = resData;
        insertError = null;
        break;
      }

      insertError = resErr;
      const errLower = (resErr.message || "").toLowerCase();
      let pruned = false;

      // Fallback hierarchy: contact_number -> contact_phone -> phone
      if (errLower.includes("contact_number") && currentInsert.contact_number !== undefined) {
        delete currentInsert.contact_number;
        if (cleanPhone) currentInsert.contact_phone = cleanPhone;
        pruned = true;
      } else if (errLower.includes("contact_phone") && currentInsert.contact_phone !== undefined) {
        delete currentInsert.contact_phone;
        if (cleanPhone) currentInsert.phone = cleanPhone;
        pruned = true;
      } else if (errLower.includes("phone") && currentInsert.phone !== undefined) {
        delete currentInsert.phone;
        pruned = true;
      }

      for (const col of Object.keys(currentInsert)) {
        if (errLower.includes(col.toLowerCase())) {
          delete currentInsert[col];
          pruned = true;
          break;
        }
      }

      if (!pruned) break;
    }

    let data = insertResult;
    let error = insertError;

    if (error) {
      await supabase.from("user_profiles").delete().eq("id", userData.id);
      throw error;
    }

    if (data) {
      const savedNum = data.contact_number || data.contact_phone || data.phone || cleanPhone || null;
      data.phone = savedNum;
      data.contact_number = savedNum;
      data.contact_phone = savedNum;
    }

    // 4. Log the action
    await logAction(req.user.id, "CREATE", "organization", data.id, {
      name: data.name,
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateOrganization = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    address,
    city,
    state,
    pincode,
    pin_code,
    country,
    phone,
    email,
    contact_email,
    contact_person,
    industry_id,
    relationship_manager_id,
    customer_code,
    is_active,
    is_special,
    is_risk,
    client_tag,
    receivables,
    credits,
    gst_number,
    pan_number,
    legal_name,
    delivery_address,
    delivery_city,
    delivery_state,
    delivery_pincode,
    delivery_country,
    is_b2b,
    credit_period_days,
  } = req.body;

  try {
    const updatePayload = {};
    if (name !== undefined) updatePayload.name = name;
    if (contact_person !== undefined) updatePayload.contact_person = contact_person ? String(contact_person).trim() : null;
    if (contact_email !== undefined || email !== undefined) {
      const em = contact_email || email;
      updatePayload.contact_email = em ? String(em).trim().toLowerCase() : null;
    }
    if (address !== undefined) updatePayload.address = address ? String(address).trim() : null;
    if (city !== undefined) updatePayload.city = city ? String(city).trim() : null;
    if (state !== undefined) updatePayload.state = state ? String(state).trim() : null;
    if (pincode !== undefined || pin_code !== undefined) {
      const p = (pincode !== undefined ? pincode : pin_code) ? String(pincode || pin_code).trim() : null;
      updatePayload.pincode = p;
    }
    if (country !== undefined) updatePayload.country = country ? String(country).trim() : 'India';
    const rawPhone = phone !== undefined ? phone : (req.body.contact_number !== undefined ? req.body.contact_number : req.body.contact_phone);
    if (rawPhone !== undefined) {
      const cleanPhone = rawPhone ? String(rawPhone).trim() : null;
      updatePayload.contact_number = cleanPhone;
    }
    if (industry_id !== undefined) updatePayload.industry_id = industry_id;
    if (relationship_manager_id !== undefined)
      updatePayload.relationship_manager_id = relationship_manager_id;
    if (customer_code !== undefined)
      updatePayload.customer_code = customer_code;

    // Active / Inactive
    if (is_active !== undefined) {
      updatePayload.is_active = Boolean(is_active);
    }

    // Mutually Exclusive Special vs Risk rule
    if (
      is_special !== undefined ||
      is_risk !== undefined ||
      client_tag !== undefined
    ) {
      if (client_tag === "special" || is_special === true) {
        updatePayload.is_special = true;
        updatePayload.is_risk = false;
      } else if (client_tag === "risk" || is_risk === true) {
        updatePayload.is_special = false;
        updatePayload.is_risk = true;
      } else if (
        client_tag === "standard" ||
        (is_special === false && is_risk === false)
      ) {
        updatePayload.is_special = false;
        updatePayload.is_risk = false;
      }
    }

    if (receivables !== undefined) {
      updatePayload.receivables =
        receivables !== null && !isNaN(parseFloat(receivables))
          ? parseFloat(receivables)
          : 0;
    }
    if (credits !== undefined) {
      updatePayload.credits =
        credits !== null && !isNaN(parseFloat(credits))
          ? parseFloat(credits)
          : 0;
    }

    if (gst_number !== undefined) {
      const cleanGst = gst_number ? String(gst_number).trim().toUpperCase() : null;
      updatePayload.gst_number = cleanGst;
      updatePayload.is_b2b = Boolean(cleanGst && cleanGst !== '');
      if (cleanGst && cleanGst.length >= 12 && (!pan_number || String(pan_number).trim() === '')) {
        updatePayload.pan_number = cleanGst.substring(2, 12).toUpperCase();
      }
    }
    if (pan_number !== undefined) updatePayload.pan_number = pan_number ? String(pan_number).trim().toUpperCase() : null;
    if (legal_name !== undefined) updatePayload.legal_name = legal_name ? String(legal_name).trim() : null;
    if (delivery_address !== undefined) updatePayload.delivery_address = delivery_address ? String(delivery_address).trim() : null;
    if (delivery_city !== undefined) updatePayload.delivery_city = delivery_city ? String(delivery_city).trim() : null;
    if (delivery_state !== undefined) updatePayload.delivery_state = delivery_state ? String(delivery_state).trim() : null;
    if (delivery_pincode !== undefined) updatePayload.delivery_pincode = delivery_pincode ? String(delivery_pincode).trim() : null;
    if (delivery_country !== undefined) updatePayload.delivery_country = delivery_country ? String(delivery_country).trim() : 'India';
    if (is_b2b !== undefined) updatePayload.is_b2b = Boolean(is_b2b);
    if (credit_period_days !== undefined) {
      updatePayload.credit_period_days = credit_period_days !== null && !isNaN(parseInt(credit_period_days, 10))
        ? parseInt(credit_period_days, 10)
        : 30;
    }

    // Robust execution loop: iteratively prune any columns that PostgREST schema does not have
    let currentUpdate = { ...updatePayload };
    let updateResult = null;
    let updateError = null;

    for (let attempt = 0; attempt <= 12; attempt++) {
      const { data: resData, error: resErr } = await supabase
        .from("organizations")
        .update(currentUpdate)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (!resErr) {
        updateResult = resData;
        updateError = null;
        break;
      }

      updateError = resErr;
      const errLower = (resErr.message || "").toLowerCase();
      let pruned = false;

      // Handle contact_number -> contact_phone -> phone fallback
      if (errLower.includes("contact_number") && currentUpdate.contact_number !== undefined) {
        delete currentUpdate.contact_number;
        if (rawPhone !== undefined) {
          currentUpdate.contact_phone = rawPhone ? String(rawPhone).trim() : null;
        }
        pruned = true;
      } else if (errLower.includes("contact_phone") && currentUpdate.contact_phone !== undefined) {
        delete currentUpdate.contact_phone;
        if (rawPhone !== undefined) {
          currentUpdate.phone = rawPhone ? String(rawPhone).trim() : null;
        }
        pruned = true;
      } else if (errLower.includes("phone") && currentUpdate.phone !== undefined) {
        delete currentUpdate.phone;
        pruned = true;
      }

      // Handle special / risk
      if ((errLower.includes("is_special") || errLower.includes("is_risk")) && (currentUpdate.is_special !== undefined || currentUpdate.is_risk !== undefined)) {
        delete currentUpdate.is_special;
        delete currentUpdate.is_risk;
        pruned = true;
      }

      // Check any other key in currentUpdate mentioned in error
      for (const col of Object.keys(currentUpdate)) {
        if (errLower.includes(col.toLowerCase())) {
          delete currentUpdate[col];
          pruned = true;
          break;
        }
      }

      if (!pruned) break;
    }

    if (updateError) throw updateError;
    const data = updateResult;

    if (data) {
      const savedNum = data.contact_number || data.contact_phone || data.phone || (rawPhone ? String(rawPhone).trim() : null);
      data.phone = savedNum;
      data.contact_number = savedNum;
      data.contact_phone = savedNum;
    }

    // 2. Log the action
    if (req.user?.id) {
      await logAction(req.user.id, "UPDATE", "organization", id, {
        updated_fields: Object.keys(updatePayload),
      });
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getOrganizationDetails = async (req, res) => {
  const { id } = req.params;
  const userOrgId = req.user?.organizationId;
  if (userOrgId && String(userOrgId) !== String(id)) {
    return res.status(403).json({
      error: "Access Denied: You cannot view another organization's details",
    });
  }
  try {
    // 1. Get Departments
    const { data: departments } = await supabase
      .from("departments")
      .select("*")
      .eq("organization_id", id);

    const enrichedDepartments = (departments || []).map((d) => ({
      ...d,
      division: d.section,
    }));

    // 2. Get Members and Measurement Status
    const { data: members } = await supabase
      .from("registry_members")
      .select("id")
      .eq("organization_id", id);

    let completed = 0;
    let pending = 0;

    if (members && members.length > 0) {
      const memberIds = members.map((m) => m.id);
      const { data: measurements } = await supabase
        .from("measurements")
        .select("member_id, status")
        .in("member_id", memberIds);

      const measuredMemberIds = new Set();
      if (measurements) {
        measurements.forEach((m) => {
          if (m.member_id) {
            measuredMemberIds.add(String(m.member_id));
          }
        });
      }

      completed = measuredMemberIds.size;
      pending = Math.max(0, members.length - completed);
    }

    // 3. Get Orders
    const { data: orders } = await supabase
      .from("orders")
      .select(
        "*, quotations!inner(id, quotation_no, title, final_quote_value, organization_id)",
      )
      .eq("quotations.organization_id", id);

    // 4. Get Organization Details
    let orgData = null;
    try {
      const { data: oRow } = await supabase
        .from("organizations")
        .select("*, industries(name)")
        .eq("id", id)
        .maybeSingle();
      if (oRow) {
        const resolvedNum = oRow.contact_number || oRow.contact_phone || oRow.phone || null;
        const resolvedEmail = oRow.contact_email || oRow.email || null;
        orgData = {
          ...oRow,
          phone: resolvedNum,
          contact_number: resolvedNum,
          contact_phone: resolvedNum,
          email: resolvedEmail,
          contact_email: resolvedEmail,
          is_b2b: Boolean(oRow.is_b2b || (oRow.gst_number && String(oRow.gst_number).trim() !== '')),
          credit_period_days: oRow.credit_period_days !== undefined && oRow.credit_period_days !== null ? oRow.credit_period_days : 30
        };
      }
    } catch (oErr) {
      console.warn("[getOrganizationDetails] Could not fetch org header:", oErr.message);
    }

    res.json({
      success: true,
      organization: orgData,
      departments: enrichedDepartments,
      measurements: {
        total: members ? members.length : 0,
        completed,
        pending,
      },
      orders: orders || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAssignedStaff = async (req, res) => {
  const { id } = req.params;
  const userOrgId = req.user?.organizationId;
  if (userOrgId && String(userOrgId) !== String(id)) {
    return res.status(403).json({
      error:
        "Access Denied: You cannot view another organization's assigned staff",
    });
  }
  try {
    const { data, error } = await supabase
      .from("organization_staff")
      .select(
        `
        id,
        employee_id,
        assigned_at,
        employees (
          full_name,
          employee_id,
          department
        )
      `,
      )
      .eq("organization_id", id);

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.assignStaff = async (req, res) => {
  const { id } = req.params;
  const { employee_ids } = req.body; // Array of employee IDs

  try {
    if (!Array.isArray(employee_ids)) {
      return res.status(400).json({ error: "employee_ids must be an array" });
    }

    // Prepare inserts
    const inserts = employee_ids.map((empId) => ({
      organization_id: id,
      employee_id: empId,
    }));

    // First delete existing assignments for these employees in this org to avoid unique constraint errors?
    // Actually, it's better to just delete all current assignments and re-insert, or handle it properly.
    // We will do a full sync: delete all existing, insert new ones.
    const { error: deleteError } = await supabase
      .from("organization_staff")
      .delete()
      .eq("organization_id", id);

    if (deleteError) throw deleteError;

    if (inserts.length > 0) {
      const { data, error } = await supabase
        .from("organization_staff")
        .insert(inserts)
        .select();
      if (error) throw error;
    }

    res.json({ success: true, message: "Staff assignments updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteOrganization = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("user_id")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("organizations")
      .delete()
      .eq("id", id);

    if (error) throw error;

    if (org?.user_id) {
      await supabase.from("user_profiles").delete().eq("id", org.user_id);
    }

    // 4. Log the action
    await logAction(req.user.id, "DELETE", "organization", id, { org_id: id });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("user_id, user_profiles(username, email)")
      .eq("id", id)
      .single();

    if (!org?.user_id) throw new Error("Organization has no login account");

    const newPassword = generatePassword();
    await supabase
      .from("user_profiles")
      .update({ password: newPassword })
      .eq("id", org.user_id);

    res.json({
      success: true,
      newPassword,
      username: org.user_profiles?.username || org.user_profiles?.email,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

function calculateLedgerDueInfo(invoiceDate, creditPeriodDays, paymentStatus, balanceAmount) {
  if (paymentStatus === "Paid" || Number(balanceAmount) <= 0) {
    return {
      due_status: "Paid",
      due_label: "Paid in Full",
      diff_days: 0,
      is_due_today: false,
      is_overdue: false,
    };
  }

  const invDate = invoiceDate ? new Date(invoiceDate) : new Date();
  const period = parseInt(creditPeriodDays, 10) || 30;
  const dueDate = new Date(invDate);
  dueDate.setDate(dueDate.getDate() + period);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueMidnight = new Date(dueDate);
  dueMidnight.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((today.getTime() - dueMidnight.getTime()) / msPerDay);

  let due_status = "Active";
  let due_label = `${Math.abs(diffDays)} days remaining`;

  if (diffDays === 0) {
    due_status = "Due";
    due_label = "Due Today (Last day of credit period)";
  } else if (diffDays > 0) {
    due_status = "Overdue";
    due_label = `Overdue by ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }

  return {
    due_status,
    due_label,
    diff_days: diffDays,
    due_date: dueDate.toISOString(),
    is_due_today: diffDays === 0,
    is_overdue: diffDays > 0,
  };
}

// Phase 1 Option B: Customer Account Ledger Statement
exports.getOrganizationLedger = async (req, res) => {
  const { id } = req.params;
  const userOrgId = req.user?.organizationId;
  const userRole = (req.user?.role || "").toLowerCase();

  if (
    req.user?.memberId ||
    ["entity", "student", "member"].includes(userRole)
  ) {
    return res.status(403).json({
      error:
        "Access Denied: Individual members cannot view organization financial ledgers",
    });
  }

  if (userOrgId && String(userOrgId) !== String(id)) {
    return res.status(403).json({
      error: "Access Denied: You cannot view another organization's ledger",
    });
  }
  try {
    // 1. Fetch organization master details
    let org = null;
    try {
      const { data: orgWithCredit } = await supabase
        .from("organizations")
        .select("id, name, customer_code, address, credit_period_days, created_at, industries(name)")
        .eq("id", id)
        .single();
      org = orgWithCredit;
    } catch (e) {
      // Fallback if credit_period_days not yet in schema cache
      const { data: orgBasic } = await supabase
        .from("organizations")
        .select("id, name, customer_code, address, created_at, industries(name)")
        .eq("id", id)
        .single();
      org = orgBasic;
    }

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // 2. Fetch all quotations for this organization
    const { data: quotations } = await supabase
      .from("quotations")
      .select(
        "id, quotation_no, title, final_quote_value, paid_amount, status, created_at",
      )
      .eq("organization_id", id);

    const quotationIds = (quotations || []).map((q) => q.id);

    // 3. Fetch all orders for this organization
    let orders = [];
    if (quotationIds.length > 0) {
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, quotation_id, order_no, status, created_at")
        .in("quotation_id", quotationIds);
      orders = ordersData || [];
    }
    const orderIds = orders.map((o) => o.id);

    // 4. Fetch all invoices for these orders or quotations or matching customer name or organization_id
    const invMap = new Map();
    try {
      const { data: directOrgInvoices } = await supabase
        .from("invoices")
        .select("*")
        .eq("organization_id", id);
      (directOrgInvoices || []).forEach((i) => invMap.set(i.id, i));
    } catch (e) {
      // organization_id may not exist yet in postgrest cache
    }

    if (quotationIds.length > 0) {
      const { data: qInvoices } = await supabase
        .from("invoices")
        .select("*")
        .in("quotation_id", quotationIds);
      (qInvoices || []).forEach((i) => invMap.set(i.id, i));
    }
    if (orderIds.length > 0) {
      const { data: oInvoices } = await supabase
        .from("invoices")
        .select("*")
        .in("order_id", orderIds);
      (oInvoices || []).forEach((i) => invMap.set(i.id, i));
    }
    const { data: nameInvoices } = await supabase
      .from("invoices")
      .select("*")
      .ilike("customer_name", org.name);
    (nameInvoices || []).forEach((i) => invMap.set(i.id, i));

    const invoices = Array.from(invMap.values());

    // 5. Fetch all payments for these quotations
    let payments = [];
    if (quotationIds.length > 0) {
      const { data: payData } = await supabase
        .from("payments")
        .select(
          "id, quotation_id, amount, payment_method, reference_no, notes, paid_at, created_at",
        )
        .in("quotation_id", quotationIds);
      payments = payData || [];
    }

    // 6. Build combined chronological ledger transactions
    const rawTransactions = [];

    // Map Invoices as Debits (commercial credit billings)
    invoices.forEach((inv) => {
      const amount = parseFloat(inv.total_amount || 0);
      const paid = parseFloat(inv.paid_amount || 0);
      const linkedOrder = orders.find((o) => o.id === inv.order_id);
      const linkedQuote = (quotations || []).find(
        (q) => q.id === inv.quotation_id,
      );
      const orderRef =
        linkedOrder?.order_no || linkedQuote?.quotation_no || (inv.sale_type === 'retail' ? "Retail Direct" : "Direct");

      const orgCreditPeriod = org.credit_period_days || 30;
      const invCreditPeriod = inv.credit_period_days || orgCreditPeriod;
      const invDate = inv.invoice_date || inv.created_at;
      const dueInfo = calculateLedgerDueInfo(
        invDate,
        invCreditPeriod,
        inv.payment_status,
        amount - paid
      );

      rawTransactions.push({
        id: `INV-${inv.id}`,
        raw_id: inv.id,
        date: invDate,
        type: "INVOICE",
        reference_no: inv.invoice_no,
        description: inv.sale_type === "retail" ? `Retail Tax Invoice (Manual)` : `Bulk Order Invoice for ${orderRef}`,
        order_ref: orderRef,
        sale_type: inv.sale_type || (linkedOrder ? "bulk" : "retail"),
        credit_period_days: invCreditPeriod,
        due_date: inv.due_date || dueInfo.due_date,
        due_status: dueInfo.due_status,
        due_label: dueInfo.due_label,
        is_due_today: dueInfo.is_due_today,
        is_overdue: dueInfo.is_overdue,
        debit: amount,
        credit: 0,
        status: inv.payment_status || "Unpaid",
        payment_mode: null,
        notes: inv.notes,
      });
    });

    // Debits to the customer account ledger are strictly from generated invoices, NOT un-invoiced orders or quotations.

    // Map Payments as Credits (amount received)
    payments.forEach((pay) => {
      const amount = parseFloat(pay.amount || 0);
      const linkedQuote = (quotations || []).find(
        (q) => q.id === pay.quotation_id,
      );
      const linkedOrder = orders.find(
        (o) => o.quotation_id === pay.quotation_id,
      );
      const orderRef =
        linkedOrder?.order_no ||
        linkedQuote?.quotation_no ||
        "Quotation Deposit";

      rawTransactions.push({
        id: `PAY-${pay.id}`,
        raw_id: pay.id,
        date: pay.paid_at || pay.created_at,
        type: "PAYMENT",
        reference_no: pay.reference_no || `REC-${pay.id}`,
        description: `Payment Received (${pay.payment_method || "Bank/Cash"}) for ${orderRef}`,
        order_ref: orderRef,
        debit: 0,
        credit: amount,
        status: "Received",
        payment_mode: pay.payment_method,
        notes: pay.notes,
      });
    });

    // Sort transactions chronologically (oldest to newest)
    rawTransactions.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // Calculate running balance
    let currentBalance = 0;
    const transactions = rawTransactions.map((tx) => {
      currentBalance = currentBalance + tx.debit - tx.credit;
      return {
        ...tx,
        running_balance: Math.round(currentBalance * 100) / 100,
      };
    });

    // 7. Calculate summary totals
    const totalInvoiced = rawTransactions.reduce(
      (sum, tx) => sum + tx.debit,
      0,
    );
    const totalPaid = rawTransactions.reduce((sum, tx) => sum + tx.credit, 0);
    const outstandingBalance =
      Math.round((totalInvoiced - totalPaid) * 100) / 100;

    let settlementStatus = "Settled";
    if (outstandingBalance > 0) {
      settlementStatus = totalPaid > 0 ? "Partially Paid" : "Unpaid";
    } else if (outstandingBalance < 0) {
      settlementStatus = "Credit Balance";
    }

    const creditAmount = Math.max(0, Math.round((totalPaid - totalInvoiced) * 100) / 100);

    res.json({
      success: true,
      organization: {
        id: org.id,
        name: org.name,
        customer_code: org.customer_code,
        address: org.address,
        credit_period_days: org.credit_period_days || 30,
        phone: null,
        email: null,
        industry: org.industries?.name || "General",
        created_at: org.created_at,
      },
      summary: {
        total_invoiced: Math.round(totalInvoiced * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        outstanding_balance: outstandingBalance,
        credits: creditAmount,
        credit_balance: creditAmount,
        settlement_status: settlementStatus,
        total_orders: orders.length,
        total_invoices: invoices.length,
        total_payments: payments.length,
      },
      transactions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
