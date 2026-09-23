const supabase = require("../config/supabase");
const { toSafeInt, isUuid } = require("../utils/sanitize");

const VALID_STANDARD_SIZES = new Set([
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "XXL",
  "3XL",
  "XXXL",
  "4XL",
  "5XL",
  "6XL",
  "24",
  "26",
  "28",
  "30",
  "32",
  "34",
  "36",
  "38",
  "40",
  "42",
  "44",
  "46",
  "48",
  "50",
  "52",
  "54",
  "SHORT",
  "REGULAR",
  "LONG",
  "EXTRA LONG",
  "STANDARD",
  "CUSTOM",
  "FREE SIZE",
  "OS",
]);

function isAValidSizeKey(key) {
  if (!key || typeof key !== "string") return false;
  const clean = key.trim().toUpperCase();
  if (VALID_STANDARD_SIZES.has(clean)) return true;
  if (/^\d{2}$/.test(clean)) {
    const n = parseInt(clean, 10);
    return n >= 20 && n <= 60;
  }
  const lower = key.toLowerCase();
  if (
    lower.includes("_") ||
    lower.includes("id") ||
    lower.includes("name") ||
    lower.includes("code") ||
    lower.includes("fabric") ||
    lower.includes("button") ||
    lower.includes("thread") ||
    lower.includes("sam") ||
    lower.includes("meter") ||
    lower.includes("price") ||
    lower.includes("qty") ||
    lower.includes("quantity") ||
    lower.includes("total") ||
    lower.includes("rate") ||
    lower.includes("readiness") ||
    lower.includes("status") ||
    lower.includes("count") ||
    lower.includes("design") ||
    lower.includes("dept") ||
    lower.includes("department")
  ) {
    return false;
  }
  return false;
}

// Helper: Isolate custom measurements for the specific garment/dress of this Job Card (PRD M11.1 & M11.2)
function isolateGarmentMeasurements(
  dynamicData,
  itemName,
  productName,
  productTypeName,
) {
  if (!dynamicData || typeof dynamicData !== "object") return {};

  const cardNames = [productName, itemName, productTypeName]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase().trim());

  const topKeywords = [
    "shirt",
    "t-shirt",
    "tshirt",
    "t shirt",
    "polo",
    "shirting",
    "top",
    "kurti",
    "blazer",
    "coat",
    "jacket",
    "hoodie",
    "sweater",
    "vest",
    "waistcoat",
    "blouse",
    "tunic",
  ];
  const bottomKeywords = [
    "pant",
    "pants",
    "trouser",
    "trousers",
    "suiting",
    "bottom",
    "skirt",
    "salwar",
    "short",
    "shorts",
    "track pant",
    "cargo",
    "jeans",
    "pyjama",
    "pajama",
  ];

  const isCardTop = cardNames.some((cn) =>
    topKeywords.some((kw) => cn.includes(kw)),
  );
  const isCardBottom = cardNames.some((cn) =>
    bottomKeywords.some((kw) => cn.includes(kw)),
  );

  // Strictly exclusive to leg/bottom garments (never for tops)
  const bottomExclusive = new Set([
    "inseam", "outseam", "thigh", "knee", "bottom hem", "ankle",
    "crotch", "rise", "leg length", "leg opening", "calf"
  ]);
  // Strictly exclusive to torso/arms (never for pants/bottoms)
  const topExclusive = new Set([
    "chest", "bust", "shoulder", "sleeve", "sleeve length", "top length",
    "collar", "neck", "armhole", "bicep", "cuff", "front cross", "back cross"
  ]);

  const reservedKeys = new Set([
    "strategy", "chart_id", "chart_name", "chart_unit", "selected_size",
    "assigned_dimensions", "fabric", "fabrics", "button", "thread", "custom_measurements"
  ]);

  // Identify true garment groups
  const garmentGroups = Object.entries(dynamicData).filter(([k, v]) => {
    if (k.startsWith("_")) return false;
    if (reservedKeys.has(k.toLowerCase())) return false;
    return v && typeof v === "object" && !Array.isArray(v);
  });

  if (garmentGroups.length > 0) {
    let matchedGroup = null;
    let matchedGroupName = "";

    for (const [groupName, groupData] of garmentGroups) {
      const gNameLower = groupName.toLowerCase().trim();
      const directMatch = cardNames.some(
        (cn) => gNameLower.includes(cn) || cn.includes(gNameLower),
      );
      if (directMatch) {
        matchedGroup = groupData;
        matchedGroupName = groupName;
        break;
      }
    }

    if (!matchedGroup) {
      for (const [groupName, groupData] of garmentGroups) {
        const gNameLower = groupName.toLowerCase().trim();
        const isGroupTop = topKeywords.some((kw) => gNameLower.includes(kw));
        const isGroupBottom = bottomKeywords.some((kw) =>
          gNameLower.includes(kw),
        );

        if (isCardTop && isGroupTop && !isGroupBottom) {
          matchedGroup = groupData;
          matchedGroupName = groupName;
          break;
        }
        if (isCardBottom && isGroupBottom && !isGroupTop) {
          matchedGroup = groupData;
          matchedGroupName = groupName;
          break;
        }
      }
    }

    if (!matchedGroup && garmentGroups.length === 1) {
      matchedGroup = garmentGroups[0][1];
      matchedGroupName = garmentGroups[0][0];
    }

    if (matchedGroup) {
      const isolated = {};
      Object.entries(matchedGroup).forEach(([k, v]) => {
        if (
          !reservedKeys.has(k.toLowerCase()) &&
          !k.startsWith("_") &&
          v !== undefined &&
          v !== null &&
          v !== "" &&
          typeof v !== "object"
        ) {
          isolated[k] = v;
        }
      });
      if (matchedGroup.selected_size) {
        isolated.selected_size = matchedGroup.selected_size;
      }
      if (matchedGroup.assigned_dimensions) {
        isolated.assigned_dimensions = matchedGroup.assigned_dimensions;
      }
      if (matchedGroup.strategy) {
        isolated.strategy = matchedGroup.strategy;
      }
      if (matchedGroup.chart_id) {
        isolated.chart_id = matchedGroup.chart_id;
      }
      if (matchedGroup.chart_name) {
        isolated.chart_name = matchedGroup.chart_name;
      }
      if (matchedGroup.chart_unit) {
        isolated.chart_unit = matchedGroup.chart_unit;
      }
      isolated._garment = matchedGroupName;
      return isolated;
    }
  }

  // Fallback: Flat structure
  const isolated = {};
  Object.entries(dynamicData).forEach(([mKey, mVal]) => {
    if (mKey.startsWith("_") || reservedKeys.has(mKey.toLowerCase())) {
      if (mKey === "selected_size" || mKey === "assigned_dimensions") {
        isolated[mKey] = mVal;
      }
      return;
    }
    const mKeyLower = mKey.toLowerCase().trim();

    if (isCardTop && !isCardBottom && bottomExclusive.has(mKeyLower)) return;
    if (isCardBottom && !isCardTop && topExclusive.has(mKeyLower)) return;

    isolated[mKey] = mVal;
  });

  return isolated;
}

// Helper: calculate live measurement readiness for an order based on registry members and approved measurements
async function checkOrderMeasurementReadiness(order_id) {
  try {
    const { data: orderRec } = await supabase
      .from("orders")
      .select(
        "id, quotation_id, quotations(id, organization_id, metrics_summary)",
      )
      .eq("id", order_id)
      .maybeSingle();

    if (!orderRec || !orderRec.quotations) {
      return {
        isMeasurementsPending: false,
        pendingCount: 0,
        totalMembers: 0,
        approvedMembers: 0,
      };
    }

    const orgId = orderRec.quotations.organization_id;
    if (!orgId) {
      return {
        isMeasurementsPending: false,
        pendingCount: 0,
        totalMembers: 0,
        approvedMembers: 0,
        quotationId: orderRec.quotation_id,
      };
    }

    // Fetch registered members for this organization
    const { data: members } = await supabase
      .from("registry_members")
      .select("id, full_name")
      .eq("organization_id", orgId);

    const totalMembers = members?.length || 0;
    if (totalMembers === 0) {
      // Standard / Readymade order with no individual registered members
      return {
        isMeasurementsPending: false,
        pendingCount: 0,
        totalMembers: 0,
        approvedMembers: 0,
        quotationId: orderRec.quotation_id,
      };
    }

    // Fetch measurements for these members
    const memberIds = members.map((m) => m.id);
    const { data: measurements } = await supabase
      .from("measurements")
      .select("id, member_id, status, recorded_at")
      .in("member_id", memberIds)
      .order("recorded_at", { ascending: false });

    const memberStatus = {};
    measurements?.forEach((m) => {
      // Prioritize Approved status
      if (
        !memberStatus[m.member_id] ||
        m.status === "Approved" ||
        m.status === "Completed"
      ) {
        memberStatus[m.member_id] = m.status;
      }
    });

    const approvedMembers = Object.keys(memberStatus).filter(
      (mid) =>
        memberStatus[mid] === "Approved" || memberStatus[mid] === "Completed",
    ).length;

    const pendingCount = Math.max(0, totalMembers - approvedMembers);
    const isMeasurementsPending = pendingCount > 0;

    return {
      isMeasurementsPending,
      pendingCount,
      totalMembers,
      approvedMembers,
      quotationId: orderRec.quotation_id,
      quotation: orderRec.quotations,
    };
  } catch (e) {
    console.error(
      "[JobCardController] checkOrderMeasurementReadiness error:",
      e.message,
    );
    return {
      isMeasurementsPending: false,
      pendingCount: 0,
      totalMembers: 0,
      approvedMembers: 0,
    };
  }
}

// Helper: Check physical fabric readiness from factory stock (PRD M9.8)
async function checkFabricReadiness(
  fabric_id,
  fabric_name,
  quantity,
  main_fabric_meters,
) {
  try {
    if (!fabric_id && !fabric_name) {
      return {
        isFabricDepleted: false,
        availableMeters: 0,
        requiredMeters: 0,
        fabricHoldReason: null,
      };
    }

    let fQuery = supabase
      .from("fabrics")
      .select("id, name, code, quantity, low_stock_threshold");
    if (fabric_id) fQuery = fQuery.eq("id", fabric_id);
    else fQuery = fQuery.ilike("name", fabric_name);

    const { data: fData } = await fQuery.maybeSingle();
    if (!fData) {
      return {
        isFabricDepleted: false,
        availableMeters: 0,
        requiredMeters: 0,
        fabricHoldReason: null,
      };
    }

    const availableMeters = parseFloat(fData.quantity || 0);
    const consumptionPerPc = parseFloat(main_fabric_meters || 1.25);
    const requiredMeters = parseFloat(
      ((quantity || 1) * consumptionPerPc).toFixed(2),
    );

    const isFabricDepleted = availableMeters < requiredMeters;
    const fabricHoldReason = isFabricDepleted
      ? `Fabric "${fData.name}" (#${fData.code || "N/A"}) is out of stock / depleted (Available: ${availableMeters.toFixed(2)}m, Required: ${requiredMeters.toFixed(2)}m) — release to cutting is blocked until PO fabric arrives.`
      : null;

    return {
      isFabricDepleted,
      availableMeters,
      requiredMeters,
      fabricId: fData.id,
      fabricName: fData.name,
      fabricCode: fData.code,
      fabricHoldReason,
    };
  } catch (err) {
    console.error(
      "[JobCardController] checkFabricReadiness error:",
      err.message,
    );
    return {
      isFabricDepleted: false,
      availableMeters: 0,
      requiredMeters: 0,
      fabricHoldReason: null,
    };
  }
}

// Helper: Sync all job cards for an order against current measurement and material readiness
async function syncJobCardsForOrder(order_id) {
  try {
    const readiness = await checkOrderMeasurementReadiness(order_id);
    const { data: jobCards } = await supabase
      .from("job_cards")
      .select(
        "id, status, po_handler_action, hold_reason, size_breakdown, quantity",
      )
      .eq("order_id", order_id);

    if (!jobCards || jobCards.length === 0) return readiness;

    for (const jc of jobCards) {
      const fId = jc.size_breakdown?.fabric_id;
      const fName = jc.size_breakdown?.fabric_name;
      const cRate = jc.size_breakdown?.main_fabric_meters || 1.25;
      const fReadiness = await checkFabricReadiness(
        fId,
        fName,
        jc.quantity,
        cRate,
      );
      const isFabricDepleted = fReadiness.isFabricDepleted;

      let holdReasons = [];
      if (readiness.isMeasurementsPending) {
        holdReasons.push(
          `Awaiting ${readiness.pendingCount} recipient measurement(s) (${readiness.approvedMembers}/${readiness.totalMembers} approved) — release to cutting is blocked.`,
        );
      }
      if (isFabricDepleted) {
        holdReasons.push(fReadiness.fabricHoldReason);
      }

      let newStatus = "Pending PO Handler";
      if (readiness.isMeasurementsPending && isFabricDepleted) {
        newStatus = "Held (Awaiting Measurements & PO Fabric)";
      } else if (isFabricDepleted) {
        newStatus = "Held (Awaiting PO Fabric)";
      } else if (readiness.isMeasurementsPending) {
        newStatus = "Held (Awaiting Measurements)";
      } else {
        newStatus = jc.status.startsWith("Held")
          ? "Pending PO Handler"
          : jc.status;
      }

      const updatedBreakdown = {
        ...(jc.size_breakdown || {}),
        fabric_id: fReadiness.fabricId || fId || null,
        fabric_name: fReadiness.fabricName || fName || null,
        measurement_readiness: readiness.isMeasurementsPending
          ? "Awaiting Measurements"
          : "Ready",
        material_readiness: isFabricDepleted ? "Awaiting PO Fabric" : "Ready",
        pending_measurements: readiness.pendingCount,
        available_fabric_meters: fReadiness.availableMeters,
        required_fabric_meters: fReadiness.requiredMeters,
      };

      const updatePayload = {
        hold_reason: holdReasons.length > 0 ? holdReasons.join(" | ") : null,
        size_breakdown: updatedBreakdown,
        updated_at: new Date().toISOString(),
      };

      if (jc.status.startsWith("Held") || newStatus.startsWith("Held")) {
        updatePayload.status = newStatus;
        updatePayload.po_handler_action = newStatus.startsWith("Held")
          ? "Hold"
          : jc.po_handler_action === "Hold"
            ? "Pending"
            : jc.po_handler_action;
      }

      await supabase.from("job_cards").update(updatePayload).eq("id", jc.id);
    }

    // Also update quotation metrics_summary if available
    if (readiness.quotationId && readiness.totalMembers > 0) {
      const currentMetrics = readiness.quotation?.metrics_summary || {};
      const updatedMetrics = {
        ...currentMetrics,
        total_entities: readiness.totalMembers,
        measured: readiness.approvedMembers,
        pending: readiness.pendingCount,
        missing: Math.max(
          0,
          readiness.totalMembers - readiness.approvedMembers,
        ),
      };
      await supabase
        .from("quotations")
        .update({ metrics_summary: updatedMetrics })
        .eq("id", readiness.quotationId);
    }

    return readiness;
  } catch (e) {
    console.error("[JobCardController] syncJobCardsForOrder error:", e.message);
  }
}

// Helper: Extract materials metadata from text string
function parseMaterialsMetadataLocal(rawText) {
  if (!rawText)
    return {
      main_fabric_id: null,
      attachment_fabric1_id: null,
      attachment_fabric2_id: null,
    };
  let main_fabric_id = null;
  let attachment_fabric1_id = null;
  let attachment_fabric2_id = null;

  const mainMatch = rawText.match(/\[MainFabricId:\s*([^\]]+)\]/);
  if (mainMatch) main_fabric_id = mainMatch[1].trim();

  const att1Match = rawText.match(/\[AttachmentFabric1Id:\s*([^\]]+)\]/);
  if (att1Match) attachment_fabric1_id = att1Match[1].trim();

  const att2Match = rawText.match(/\[AttachmentFabric2Id:\s*([^\]]+)\]/);
  if (att2Match) attachment_fabric2_id = att2Match[1].trim();

  return { main_fabric_id, attachment_fabric1_id, attachment_fabric2_id };
}

// Helper: Resolve all fabrics (Main Fabric, Attachment Fabric 1, Attachment Fabric 2)
// Cross-checking with Product Master, Quotation/Order Item, and Class/Department specs
async function resolveAllFabricsForJobCard(jobCard, sizeBreakdown = null) {
  const sb = sizeBreakdown || jobCard?.size_breakdown || {};
  let qItem = null;
  let qItemSb = null;

  // 1. Fetch parent Quotation Item
  if (jobCard?.item_id) {
    try {
      const { data: itemData } = await supabase
        .from("quotation_items")
        .select(
          "id, product_type_id, quantity, size_breakdown, product_types(name)",
        )
        .eq("id", jobCard.item_id)
        .maybeSingle();
      if (itemData) {
        qItem = itemData;
        qItemSb = itemData.size_breakdown || {};
      }
    } catch (qErr) {
      console.warn(
        "[JobCardController] Quotation item fabric fetch caught:",
        qErr.message,
      );
    }
  }

  // Fallback quotation item lookup from order if item_id was not directly set
  if (!qItem && jobCard?.order_id) {
    try {
      const { data: orderData } = await supabase
        .from("orders")
        .select(
          "id, quotation_id, quotations(id, quotation_items(id, product_type_id, size_breakdown, product_types(name)))",
        )
        .eq("id", jobCard.order_id)
        .maybeSingle();
      const allQItems = orderData?.quotations?.quotation_items || [];
      if (allQItems.length > 0) {
        const matched = allQItems.find(
          (it) =>
            (sb.product_id &&
              it.size_breakdown?.product_id === sb.product_id) ||
            (jobCard.item_name &&
              it.product_types?.name &&
              it.product_types.name.toLowerCase() ===
                jobCard.item_name.toLowerCase()) ||
            (jobCard.item_name &&
              it.size_breakdown?.product_name &&
              it.size_breakdown.product_name.toLowerCase() ===
                jobCard.item_name.toLowerCase()),
        );
        if (matched) {
          qItem = matched;
          qItemSb = matched.size_breakdown || {};
        } else if (allQItems.length === 1) {
          qItem = allQItems[0];
          qItemSb = allQItems[0].size_breakdown || {};
        }
      }
    } catch (ordErr) {
      console.warn(
        "[JobCardController] Order quotation items lookup caught:",
        ordErr.message,
      );
    }
  }

  // 2. Fetch Product Master details from products table
  let product = null;
  const candidateProductId = sb.product_id || qItemSb?.product_id || null;
  if (candidateProductId) {
    try {
      const { data: pData } = await supabase
        .from("products")
        .select(
          "id, name, art_number, button_id, button_count, thread_id, thread_count, main_fabric, attachment_fabric1, attachment_fabric2, class_fabric_consumption, materials, main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, sam_value, design_number_id, design_numbers(code)",
        )
        .eq("id", candidateProductId)
        .maybeSingle();
      if (pData) product = pData;
    } catch (pErr) {
      console.warn(
        "[JobCardController] Product lookup by ID caught:",
        pErr.message,
      );
    }
  }

  // Fallback product lookup by art_number, design_number or item_name
  if (!product && jobCard?.design_number) {
    const rawDn = jobCard.design_number.trim();
    // 1. Try matching art_number prefix if rawDn starts with gender-dress-pattern (e.g. 1-4J012)
    const artMatch = rawDn.match(/^([0-9]+-[A-Za-z0-9]+)/);
    if (artMatch) {
      try {
        const { data: pByArt } = await supabase
          .from("products")
          .select(
            "id, name, art_number, button_id, button_count, thread_id, thread_count, main_fabric, attachment_fabric1, attachment_fabric2, class_fabric_consumption, materials, main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, sam_value, design_number_id, design_numbers(code)",
          )
          .eq("art_number", artMatch[1])
          .maybeSingle();
        if (pByArt) product = pByArt;
      } catch (artErr) {
        console.warn("[JobCardController] Product lookup by art_number caught:", artErr.message);
      }
    }

    // 2. Try matching design_numbers code (e.g. DNS-0001)
    if (!product) {
      try {
        const { data: dNum } = await supabase
          .from("design_numbers")
          .select("id, code")
          .eq("code", rawDn)
          .maybeSingle();
        if (dNum) {
          const { data: pByDNum } = await supabase
            .from("products")
            .select(
              "id, name, art_number, button_id, button_count, thread_id, thread_count, main_fabric, attachment_fabric1, attachment_fabric2, class_fabric_consumption, materials, main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, sam_value, design_number_id, design_numbers(code)",
            )
            .eq("design_number_id", dNum.id)
            .maybeSingle();
          if (pByDNum) product = pByDNum;
        }
      } catch (dnErr) {
        console.warn(
          "[JobCardController] Product lookup by design_number caught:",
          dnErr.message,
        );
      }
    }
  }

  if (!product && jobCard?.item_name) {
    try {
      const { data: pByName } = await supabase
        .from("products")
        .select(
          "id, name, art_number, button_id, button_count, thread_id, thread_count, main_fabric, attachment_fabric1, attachment_fabric2, class_fabric_consumption, materials, main_fabric_id, attachment_fabric1_id, attachment_fabric2_id, sam_value, design_number_id, design_numbers(code)",
        )
        .ilike("name", jobCard.item_name.trim())
        .maybeSingle();
      if (pByName) product = pByName;
    } catch (pnErr) {
      console.warn(
        "[JobCardController] Product lookup by name caught:",
        pnErr.message,
      );
    }
  }

  // 3. Resolve Class / Department Specific Fabric Consumption
  let classConsumption = null;
  const deptName =
    sb.department_name ||
    sb.class_name ||
    qItemSb?.department_name ||
    qItemSb?.class_name ||
    null;

  if (
    product?.class_fabric_consumption &&
    typeof product.class_fabric_consumption === "object"
  ) {
    if (deptName && product.class_fabric_consumption[deptName]) {
      classConsumption = product.class_fabric_consumption[deptName];
    } else if (deptName) {
      const cleanDept = deptName.toLowerCase().trim();
      const matchedKey = Object.keys(product.class_fabric_consumption).find(
        (k) =>
          cleanDept.includes(k.toLowerCase().trim()) ||
          k.toLowerCase().trim().includes(cleanDept),
      );
      if (matchedKey)
        classConsumption = product.class_fabric_consumption[matchedKey];
    }
  }

  // Parse materials text from product
  const parsedMaterials = parseMaterialsMetadataLocal(product?.materials);

  // 4. Resolve Main Fabric attributes & Cut Length
  let mainId =
    sb.fabric_id ||
    sb.main_fabric_id ||
    qItemSb?.fabric_id ||
    qItemSb?.main_fabric_id ||
    product?.main_fabric_id ||
    parsedMaterials.main_fabric_id ||
    null;
  let mainName =
    sb.fabric_name ||
    sb.main_fabric_name ||
    qItemSb?.fabric_name ||
    qItemSb?.main_fabric_name ||
    null;
  let mainCode = sb.fabric_code || qItemSb?.fabric_code || null;
  let mainShade = sb.shade || sb.fabric_shade || qItemSb?.shade || null;

  // Cross-check Main Fabric Cut Length per Piece:
  // Order quotation item > Department/Class consumption > Product master > Job Card breakdown > 1.25 fallback
  const qItemMainMeters =
    qItemSb?.main_fabric_meters !== undefined &&
    qItemSb?.main_fabric_meters !== null
      ? parseFloat(qItemSb.main_fabric_meters)
      : NaN;
  const classMainMeters =
    classConsumption?.main_fabric !== undefined &&
    classConsumption?.main_fabric !== null
      ? parseFloat(classConsumption.main_fabric)
      : NaN;
  const prodMainMeters =
    product?.main_fabric !== undefined && product?.main_fabric !== null
      ? parseFloat(product.main_fabric)
      : NaN;
  const sbMainMeters =
    sb.main_fabric_meters !== undefined && sb.main_fabric_meters !== null
      ? parseFloat(sb.main_fabric_meters)
      : parseFloat(sb.consumption);

  let finalMainLength = 1.25;
  if (!isNaN(qItemMainMeters) && qItemMainMeters > 0) {
    finalMainLength = qItemMainMeters;
  } else if (!isNaN(classMainMeters) && classMainMeters > 0) {
    finalMainLength = classMainMeters;
  } else if (!isNaN(prodMainMeters) && prodMainMeters > 0) {
    finalMainLength = prodMainMeters;
  } else if (!isNaN(sbMainMeters) && sbMainMeters > 0) {
    finalMainLength = sbMainMeters;
  }

  // 5. Resolve Attachment Fabric 1 attributes & Cut Length
  let att1Id =
    sb.attachment_fabric1_id ||
    qItemSb?.attachment_fabric1_id ||
    product?.attachment_fabric1_id ||
    parsedMaterials.attachment_fabric1_id ||
    null;
  let att1Name =
    sb.attachment_fabric1_name || qItemSb?.attachment_fabric1_name || null;
  let att1Code =
    sb.attachment_fabric1_code || qItemSb?.attachment_fabric1_code || null;
  let att1Shade =
    sb.attachment_fabric1_shade || qItemSb?.attachment_fabric1_shade || null;

  const qItemAtt1Meters =
    qItemSb?.attachment_fabric1_meters !== undefined &&
    qItemSb?.attachment_fabric1_meters !== null
      ? parseFloat(qItemSb.attachment_fabric1_meters)
      : NaN;
  const classAtt1Meters =
    classConsumption?.attachment_fabric1 !== undefined &&
    classConsumption?.attachment_fabric1 !== null
      ? parseFloat(classConsumption.attachment_fabric1)
      : NaN;
  const prodAtt1Meters =
    product?.attachment_fabric1 !== undefined &&
    product?.attachment_fabric1 !== null
      ? parseFloat(product.attachment_fabric1)
      : NaN;
  const sbAtt1Meters =
    sb.attachment_fabric1_meters !== undefined &&
    sb.attachment_fabric1_meters !== null
      ? parseFloat(sb.attachment_fabric1_meters)
      : NaN;

  let finalAtt1Length = 0;
  if (!isNaN(qItemAtt1Meters) && qItemAtt1Meters > 0) {
    finalAtt1Length = qItemAtt1Meters;
  } else if (!isNaN(classAtt1Meters) && classAtt1Meters > 0) {
    finalAtt1Length = classAtt1Meters;
  } else if (!isNaN(prodAtt1Meters) && prodAtt1Meters > 0) {
    finalAtt1Length = prodAtt1Meters;
  } else if (!isNaN(sbAtt1Meters) && sbAtt1Meters > 0) {
    finalAtt1Length = sbAtt1Meters;
  }

  // 6. Resolve Attachment Fabric 2 attributes & Cut Length
  let att2Id =
    sb.attachment_fabric2_id ||
    qItemSb?.attachment_fabric2_id ||
    product?.attachment_fabric2_id ||
    parsedMaterials.attachment_fabric2_id ||
    null;
  let att2Name =
    sb.attachment_fabric2_name || qItemSb?.attachment_fabric2_name || null;
  let att2Code =
    sb.attachment_fabric2_code || qItemSb?.attachment_fabric2_code || null;
  let att2Shade =
    sb.attachment_fabric2_shade || qItemSb?.attachment_fabric2_shade || null;

  const qItemAtt2Meters =
    qItemSb?.attachment_fabric2_meters !== undefined &&
    qItemSb?.attachment_fabric2_meters !== null
      ? parseFloat(qItemSb.attachment_fabric2_meters)
      : NaN;
  const classAtt2Meters =
    classConsumption?.attachment_fabric2 !== undefined &&
    classConsumption?.attachment_fabric2 !== null
      ? parseFloat(classConsumption.attachment_fabric2)
      : NaN;
  const prodAtt2Meters =
    product?.attachment_fabric2 !== undefined &&
    product?.attachment_fabric2 !== null
      ? parseFloat(product.attachment_fabric2)
      : NaN;
  const sbAtt2Meters =
    sb.attachment_fabric2_meters !== undefined &&
    sb.attachment_fabric2_meters !== null
      ? parseFloat(sb.attachment_fabric2_meters)
      : NaN;

  let finalAtt2Length = 0;
  if (!isNaN(qItemAtt2Meters) && qItemAtt2Meters > 0) {
    finalAtt2Length = qItemAtt2Meters;
  } else if (!isNaN(classAtt2Meters) && classAtt2Meters > 0) {
    finalAtt2Length = classAtt2Meters;
  } else if (!isNaN(prodAtt2Meters) && prodAtt2Meters > 0) {
    finalAtt2Length = prodAtt2Meters;
  } else if (!isNaN(sbAtt2Meters) && sbAtt2Meters > 0) {
    finalAtt2Length = sbAtt2Meters;
  }

  // Query fabrics table for all referenced IDs or names
  const fabIds = [mainId, att1Id, att2Id].filter(Boolean);
  let fabMap = {};
  if (fabIds.length > 0) {
    try {
      const { data: fabRecs } = await supabase
        .from("fabrics")
        .select("id, code, name, shade")
        .in("id", fabIds);
      if (fabRecs) {
        fabRecs.forEach((f) => {
          fabMap[String(f.id)] = f;
          if (f.name) fabMap[f.name.toLowerCase().trim()] = f;
        });
      }
    } catch (fErr) {
      console.warn("[JobCardController] Fabric query caught:", fErr.message);
    }
  }

  // Also query by name if ID was not matched
  const missingNames = [mainName, att1Name, att2Name].filter(
    (n) => n && !fabMap[n.toLowerCase().trim()],
  );
  if (missingNames.length > 0) {
    try {
      for (const mName of missingNames) {
        const { data: byName } = await supabase
          .from("fabrics")
          .select("id, code, name, shade")
          .ilike("name", mName)
          .maybeSingle();
        if (byName) {
          fabMap[mName.toLowerCase().trim()] = byName;
          fabMap[String(byName.id)] = byName;
        }
      }
    } catch (nErr) {
      console.warn("[JobCardController] Fabric by name caught:", nErr.message);
    }
  }

  // Finalize Main Fabric
  const matchedMain =
    (mainId && fabMap[String(mainId)]) ||
    (mainName && fabMap[mainName.toLowerCase().trim()]);
  const finalMainCode =
    matchedMain?.code || mainCode || (mainId ? `FAB-${mainId}` : "FAB-STD");
  const finalMainName =
    matchedMain?.name ||
    mainName ||
    (product?.name
      ? `${product.name} Production Fabric`
      : "Standard Production Fabric");
  const finalMainShade = matchedMain?.shade || mainShade || null;

  const mainObj = {
    role: "Main Fabric",
    id: mainId || matchedMain?.id || null,
    code: finalMainCode,
    number: finalMainCode,
    name: finalMainName,
    length: finalMainLength,
    meters: finalMainLength,
    shade: finalMainShade,
  };

  // Helper to determine if an attachment fabric was genuinely selected/specified in quotation or product
  const isRealFabricSpecified = (id, name, code) => {
    if (id && String(id).trim() !== "" && String(id) !== "null" && String(id) !== "undefined") return true;
    if (name && typeof name === "string") {
      const clean = name.toLowerCase().trim();
      if (
        clean &&
        clean !== "null" &&
        clean !== "undefined" &&
        clean !== "optional..." &&
        clean !== "optional" &&
        clean !== "none" &&
        clean !== "n/a" &&
        !clean.includes("attachment fabric") &&
        !clean.includes("att1-std") &&
        !clean.includes("att2-std")
      ) {
        return true;
      }
    }
    if (code && typeof code === "string") {
      const clean = code.toLowerCase().trim();
      if (
        clean &&
        clean !== "null" &&
        clean !== "undefined" &&
        clean !== "optional" &&
        clean !== "none" &&
        clean !== "n/a" &&
        !clean.includes("att1-std") &&
        !clean.includes("att2-std")
      ) {
        return true;
      }
    }
    return false;
  };

  // Finalize Attachment 1 - ONLY if genuine fabric was selected and length > 0
  let att1Obj = null;
  const hasRealAtt1 = isRealFabricSpecified(att1Id, att1Name, att1Code);

  if (hasRealAtt1 && finalAtt1Length > 0) {
    const matchedAtt1 =
      (att1Id && fabMap[String(att1Id)]) ||
      (att1Name && fabMap[att1Name.toLowerCase().trim()]);
    const finalAtt1Code =
      matchedAtt1?.code || att1Code || (att1Id ? `FAB-${att1Id}` : "ATT1-STD");
    const finalAtt1Name =
      matchedAtt1?.name || att1Name || "Attachment Fabric 1";
    const finalAtt1Shade = matchedAtt1?.shade || att1Shade || null;

    att1Obj = {
      role: "Attachment Fabric 1",
      id: att1Id || matchedAtt1?.id || null,
      code: finalAtt1Code,
      number: finalAtt1Code,
      name: finalAtt1Name,
      length: finalAtt1Length,
      meters: finalAtt1Length,
      shade: finalAtt1Shade,
    };
  }

  // Finalize Attachment 2 - ONLY if genuine fabric was selected and length > 0
  let att2Obj = null;
  const hasRealAtt2 = isRealFabricSpecified(att2Id, att2Name, att2Code);

  if (hasRealAtt2 && finalAtt2Length > 0) {
    const matchedAtt2 =
      (att2Id && fabMap[String(att2Id)]) ||
      (att2Name && fabMap[att2Name.toLowerCase().trim()]);
    const finalAtt2Code =
      matchedAtt2?.code || att2Code || (att2Id ? `FAB-${att2Id}` : "ATT2-STD");
    const finalAtt2Name =
      matchedAtt2?.name || att2Name || "Attachment Fabric 2";
    const finalAtt2Shade = matchedAtt2?.shade || att2Shade || null;

    att2Obj = {
      role: "Attachment Fabric 2",
      id: att2Id || matchedAtt2?.id || null,
      code: finalAtt2Code,
      number: finalAtt2Code,
      name: finalAtt2Name,
      length: finalAtt2Length,
      meters: finalAtt2Length,
      shade: finalAtt2Shade,
    };
  }

  const allList = [mainObj, att1Obj, att2Obj].filter(Boolean);

  // Resolve Button & Thread specifications
  let buttonObj = null;
  const buttonId = sb.button_id || qItemSb?.button_id || product?.button_id || null;
  const buttonCount = parseFloat(sb.button_count || qItemSb?.button_count || product?.button_count || 0) || 0;
  if (buttonId) {
    try {
      const { data: bData } = await supabase
        .from("buttons")
        .select("id, code, name, description")
        .eq("id", buttonId)
        .maybeSingle();
      if (bData) {
        buttonObj = {
          id: bData.id,
          code: bData.code || `BTN-${bData.id}`,
          name: bData.name,
          description: bData.description,
          count: buttonCount,
        };
      }
    } catch (bErr) {
      console.warn("[JobCardController] Button lookup caught:", bErr.message);
    }
  }
  if (!buttonObj && (buttonId || buttonCount > 0)) {
    buttonObj = {
      id: buttonId || null,
      code: buttonId ? `BTN-${buttonId}` : "BTN-STD",
      name: sb.button_name || "Standard Matching Buttons",
      description: null,
      count: buttonCount,
    };
  }

  let threadObj = null;
  const threadId = sb.thread_id || qItemSb?.thread_id || product?.thread_id || null;
  const threadCount = parseFloat(sb.thread_count || qItemSb?.thread_count || product?.thread_count || 0) || 0;
  if (threadId) {
    try {
      const { data: tData } = await supabase
        .from("threads")
        .select("id, code, name, description")
        .eq("id", threadId)
        .maybeSingle();
      if (tData) {
        threadObj = {
          id: tData.id,
          code: tData.code || `THR-${tData.id}`,
          name: tData.name,
          description: tData.description,
          count: threadCount,
        };
      }
    } catch (tErr) {
      console.warn("[JobCardController] Thread lookup caught:", tErr.message);
    }
  }
  if (!threadObj && (threadId || threadCount > 0)) {
    threadObj = {
      id: threadId || null,
      code: threadId ? `THR-${threadId}` : "THR-STD",
      name: sb.thread_name || "Color Matched Stitching Thread",
      description: null,
      count: threadCount,
    };
  }

  // Resolve Art Number & Design Number
  let resolvedArtNumber = product?.art_number || sb.art_number || qItemSb?.art_number || null;
  if (!resolvedArtNumber && jobCard?.design_number) {
    const artM = jobCard.design_number.trim().match(/^([0-9]+-[A-Za-z0-9]+)/);
    if (artM) resolvedArtNumber = artM[1];
  }

  let resolvedDesignNumber =
    product?.design_numbers?.code ||
    (jobCard?.design_number && jobCard.design_number.trim().startsWith("DNS-") ? jobCard.design_number.trim() : null) ||
    (sb.design_number && sb.design_number.trim().startsWith("DNS-") ? sb.design_number.trim() : null) ||
    "DNS-STANDARD";

  return {
    code: finalMainCode,
    number: finalMainCode,
    name: finalMainName,
    length: finalMainLength,
    meters: finalMainLength,
    shade: finalMainShade,
    main: mainObj,
    attachment1: att1Obj,
    attachment2: att2Obj,
    all: allList,
    product_id: product?.id || null,
    product_name: product?.name || null,
    art_number: resolvedArtNumber,
    design_number: resolvedDesignNumber,
    button: buttonObj,
    thread: threadObj,
  };
}

// Helper: Provision piece-level Child Job Cards with unique Barcodes (PRD M9.6, M11.1, M11.2)
async function generateChildJobCardsForJobCard(jobCard, options = {}) {
  try {
    const jobCardId = jobCard.id;
    const orderId = jobCard.order_id;
    const sizeBreakdown = jobCard.size_breakdown || {};
    const totalQty = parseInt(jobCard.quantity, 10) || 1;

    // Check if child cards already exist
    const { data: existing } = await supabase
      .from("child_job_cards")
      .select("id")
      .eq("job_card_id", jobCardId);

    if (existing && existing.length > 0 && !options.force) {
      return { success: true, count: existing.length, existing: true };
    }

    // If force re-generating, remove existing ones first
    if (existing && existing.length > 0 && options.force) {
      await supabase
        .from("child_job_cards")
        .delete()
        .eq("job_card_id", jobCardId);
    }

    // Fetch order details with quotation & organization
    const { data: orderData } = await supabase
      .from("orders")
      .select(
        "id, order_no, organization_id, quotation_id, quotations(id, organization_id, organizations(id, name, customer_code))",
      )
      .eq("id", orderId)
      .maybeSingle();

    const orgId =
      orderData?.quotations?.organization_id ||
      orderData?.organization_id ||
      jobCard.organization_id;
    const orgCode = (
      orderData?.quotations?.organizations?.customer_code || "ORG"
    )
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const cleanOrderNo = (orderData?.order_no || `ORD${orderId}`)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const cleanItemName = (jobCard.item_name || "ITEM")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5);
    const jcNoDigits =
      (jobCard.job_card_no || `JC${jobCardId}`)
        .replace(/[^0-9]/g, "")
        .slice(-4) || String(jobCardId);

    // Resolve target department from size_breakdown or parent quotation item
    let targetDeptId = sizeBreakdown?.department_id || null;
    if (!targetDeptId && jobCard.item_id) {
      try {
        const { data: qItem } = await supabase
          .from("quotation_items")
          .select("size_breakdown")
          .eq("id", jobCard.item_id)
          .maybeSingle();
        if (qItem?.size_breakdown?.department_id) {
          targetDeptId = qItem.size_breakdown.department_id;
        }
      } catch (qErr) {
        console.warn(
          "[JobCardController] Could not resolve item department:",
          qErr.message,
        );
      }
    }

    let deptMembers = [];
    if (orgId) {
      // 1. Fetch registry members for this organization
      let mQuery = supabase
        .from("registry_members")
        .select(
          "id, full_name, admission_no, gender, department_id, organization_id",
        )
        .eq("organization_id", orgId);

      // If targetDeptId is present, try filtering by department
      if (targetDeptId) {
        mQuery = mQuery.eq("department_id", targetDeptId);
      }

      let { data: fetchedMembers } = await mQuery.order("id", {
        ascending: true,
      });

      // Fallback: If department filter produced 0 members, fall back to all members of the organization
      if ((!fetchedMembers || fetchedMembers.length === 0) && targetDeptId) {
        const { data: allOrgMembers } = await supabase
          .from("registry_members")
          .select(
            "id, full_name, admission_no, gender, department_id, organization_id",
          )
          .eq("organization_id", orgId)
          .order("id", { ascending: true });
        if (allOrgMembers && allOrgMembers.length > 0) {
          fetchedMembers = allOrgMembers;
        }
      }

      if (fetchedMembers && fetchedMembers.length > 0) {
        const memberIds = fetchedMembers.map((m) => m.id);
        const { data: measList } = await supabase
          .from("measurements")
          .select(
            "id, member_id, dynamic_data, suggested_size, notes, status, recorded_at",
          )
          .in("member_id", memberIds)
          .order("recorded_at", { ascending: false });

        const measByMember = {};
        (measList || []).forEach((meas) => {
          if (!measByMember[meas.member_id]) {
            measByMember[meas.member_id] = meas;
          }
        });

        deptMembers = fetchedMembers.map((m) => ({
          ...m,
          latest_measurement: measByMember[m.id] || null,
        }));
      }
    }

    // Resolve target product details
    let targetProductId = sizeBreakdown?.product_id || null;
    let targetProductName = sizeBreakdown?.product_name || null;
    let targetProductTypeName = jobCard.item_name || null;

    if (targetProductId) {
      try {
        const { data: prodData } = await supabase
          .from("products")
          .select("id, name, product_types(name)")
          .eq("id", targetProductId)
          .maybeSingle();
        if (prodData) {
          targetProductName = prodData.name;
          targetProductTypeName =
            prodData.product_types?.name || targetProductTypeName;
        }
      } catch (pErr) {
        console.warn(
          "[JobCardController] Could not fetch product details:",
          pErr.message,
        );
      }
    }

    // Resolve all fabric specifications (Main Fabric, Attachment Fabric 1, Attachment Fabric 2)
    const fabricSpecObj = await resolveAllFabricsForJobCard(
      jobCard,
      sizeBreakdown,
    );

    // Custom Mode if organization has members (or size_breakdown indicates custom)
    const isCustomMode =
      deptMembers.length > 0 || Boolean(sizeBreakdown?.is_custom);
    const piecesToInsert = [];

    if (isCustomMode && deptMembers.length > 0) {
      // CUSTOM ENTITY MODE (PRD M11.1 & M11.2):
      // Calculate piece allocation strictly per member of THIS department (e.g. 1 member, 2 total pieces => 2 pieces/person)
      const numMembers = deptMembers.length;
      const basePiecesPerMember = Math.max(
        1,
        Math.floor(totalQty / numMembers),
      );
      const extraPieces = totalQty % numMembers;

      let seq = 1;
      deptMembers.forEach((member, mIdx) => {
        const memberQty = basePiecesPerMember + (mIdx < extraPieces ? 1 : 0);
        const admCode = (member.admission_no || `M${member.id}`)
          .replace(/[^A-Z0-9]/gi, "")
          .toUpperCase();

        // Isolate measurements strictly for this specific dress (e.g. T-Shirt only or Pants only)
        const rawDyn = member.latest_measurement?.dynamic_data || {};
        const isolatedMeas = isolateGarmentMeasurements(
          rawDyn,
          jobCard.item_name,
          targetProductName,
          targetProductTypeName,
        );

        let pieceSize = member.latest_measurement?.suggested_size || "Custom";
        if (isolatedMeas.selected_size) {
          if (typeof isolatedMeas.selected_size === "object") {
            const formattedParts = Object.entries(isolatedMeas.selected_size)
              .filter(([_, v]) => Boolean(v))
              .map(([label, szVal]) => {
                const sStr = String(szVal).trim();
                let dim = isolatedMeas.assigned_dimensions?.[label];
                if (!dim) {
                  const sLower = sStr.toLowerCase();
                  const lLower = label.toLowerCase();
                  if (
                    lLower.includes("waist") &&
                    (sLower === "s" || sLower === "small")
                  )
                    dim = "76–81 cm";
                  else if (
                    lLower.includes("waist") &&
                    (sLower === "m" || sLower === "medium")
                  )
                    dim = "81–86 cm";
                  else if (
                    lLower.includes("leg length") &&
                    sLower.includes("long")
                  )
                    dim = "84–86 cm";
                  else if (
                    lLower.includes("chest") &&
                    (sLower === "m" || sLower === "medium")
                  )
                    dim = "38-40 in";
                  else if (
                    lLower.includes("chest") &&
                    (sLower === "s" || sLower === "small")
                  )
                    dim = "36-38 in";
                  else if (
                    lLower.includes("body length") &&
                    sLower.includes("standard")
                  )
                    dim = "28-29 in";
                }
                return dim ? `${sStr} (${dim})` : sStr;
              });
            if (formattedParts.length > 0) {
              pieceSize = formattedParts.join(" / ");
            }
          } else if (typeof isolatedMeas.selected_size === "string") {
            pieceSize = isolatedMeas.selected_size;
          }
        }

        // Unified Barcode: Same barcode for all pcs of the same person in this order/job card
        const memberSeqStr = String(mIdx + 1).padStart(3, "0");
        const personBarcode = `CJC-${jcNoDigits}-${memberSeqStr}`;

        for (let pIdx = 1; pIdx <= memberQty && seq <= totalQty; pIdx++) {
          const childCardNo =
            memberQty > 1
              ? `CJC-${jobCard.job_card_no.replace("JC-", "")}-${memberSeqStr}-P${pIdx}`
              : `CJC-${jobCard.job_card_no.replace("JC-", "")}-${memberSeqStr}`;

          piecesToInsert.push({
            child_card_no: childCardNo,
            job_card_id: jobCardId,
            order_id: orderId,
            barcode: personBarcode, // SAME barcode for all pcs of the same person
            item_type: "custom",
            size: pieceSize,
            member_id: member.id,
            member_name: member.full_name,
            admission_no: member.admission_no || `#${member.id}`,
            custom_measurements: {
              ...isolatedMeas,
              _target_dress:
                targetProductName || targetProductTypeName || "Garment",
              _pieces_for_member: memberQty,
              _piece_index: pIdx,
              _fabric: fabricSpecObj,
              _fabrics: fabricSpecObj.all,
            },
            fabric_code: fabricSpecObj.code,
            fabric_name: fabricSpecObj.name,
            fabric_length: fabricSpecObj.length,
            fabric_meters: fabricSpecObj.length,
            fabric_shade: fabricSpecObj.shade,
            attachment1_name: fabricSpecObj.attachment1?.name || null,
            attachment1_code: fabricSpecObj.attachment1?.code || null,
            attachment1_number: fabricSpecObj.attachment1?.code || null,
            attachment1_length: fabricSpecObj.attachment1?.length || null,
            attachment1_meters: fabricSpecObj.attachment1?.length || null,
            attachment1_shade: fabricSpecObj.attachment1?.shade || null,
            attachment2_name: fabricSpecObj.attachment2?.name || null,
            attachment2_code: fabricSpecObj.attachment2?.code || null,
            attachment2_number: fabricSpecObj.attachment2?.code || null,
            attachment2_length: fabricSpecObj.attachment2?.length || null,
            attachment2_meters: fabricSpecObj.attachment2?.length || null,
            attachment2_shade: fabricSpecObj.attachment2?.shade || null,
            fabrics: fabricSpecObj.all,
            sequence_no: seq,
            stage: "Cutting",
            status: "In Production",
            notes:
              memberQty > 1
                ? `Piece ${pIdx} of ${memberQty}`
                : member.latest_measurement?.notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          seq++;
        }
      });

      // If total quantity exceeds department members (e.g. buffer units), fill remaining pieces as standard
      while (seq <= totalQty) {
        const seqStr = String(seq).padStart(3, "0");
        const childCardNo = `CJC-${jobCard.job_card_no.replace("JC-", "")}-${seqStr}`;
        const barcode = `CJC-${jcNoDigits}-${seqStr}`;
        piecesToInsert.push({
          child_card_no: childCardNo,
          job_card_id: jobCardId,
          order_id: orderId,
          barcode,
          item_type: "standard",
          size: "M",
          member_id: null,
          member_name: null,
          admission_no: null,
          custom_measurements: {
            _fabric: fabricSpecObj,
            _fabrics: fabricSpecObj.all,
          },
          fabric_code: fabricSpecObj.code,
          fabric_name: fabricSpecObj.name,
          fabric_length: fabricSpecObj.length,
          fabric_meters: fabricSpecObj.length,
          fabric_shade: fabricSpecObj.shade,
          attachment1_name: fabricSpecObj.attachment1?.name || null,
          attachment1_code: fabricSpecObj.attachment1?.code || null,
          attachment1_number: fabricSpecObj.attachment1?.code || null,
          attachment1_length: fabricSpecObj.attachment1?.length || null,
          attachment1_meters: fabricSpecObj.attachment1?.length || null,
          attachment1_shade: fabricSpecObj.attachment1?.shade || null,
          attachment2_name: fabricSpecObj.attachment2?.name || null,
          attachment2_code: fabricSpecObj.attachment2?.code || null,
          attachment2_number: fabricSpecObj.attachment2?.code || null,
          attachment2_length: fabricSpecObj.attachment2?.length || null,
          attachment2_meters: fabricSpecObj.attachment2?.length || null,
          attachment2_shade: fabricSpecObj.attachment2?.shade || null,
          fabrics: fabricSpecObj.all,
          sequence_no: seq,
          stage: "Cutting",
          status: "In Production",
          notes: "Department Buffer Unit",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        seq++;
      }
    } else {
      // STANDARD US SIZE MODE (PRD M9.6 / M8.3):
      const sizePairs = [];
      Object.entries(sizeBreakdown).forEach(([key, val]) => {
        if (isAValidSizeKey(key)) {
          const qty = parseInt(val, 10);
          if (!isNaN(qty) && qty > 0) {
            sizePairs.push({ size: key.trim().toUpperCase(), count: qty });
          }
        }
      });

      if (sizePairs.length === 0) {
        sizePairs.push({ size: "M", count: totalQty });
      }

      let seq = 1;
      sizePairs.forEach(({ size, count }) => {
        for (let i = 0; i < count && seq <= totalQty; i++) {
          const seqStr = String(seq).padStart(3, "0");
          const childCardNo = `CJC-${jobCard.job_card_no.replace("JC-", "")}-${seqStr}`;
          const barcode = `CJC-${jcNoDigits}-${seqStr}`;

          piecesToInsert.push({
            child_card_no: childCardNo,
            job_card_id: jobCardId,
            order_id: orderId,
            barcode,
            item_type: "standard",
            size,
            member_id: null,
            member_name: null,
            admission_no: null,
            custom_measurements: {
              _fabric: fabricSpecObj,
              _fabrics: fabricSpecObj.all,
            },
            fabric_code: fabricSpecObj.code,
            fabric_name: fabricSpecObj.name,
            fabric_length: fabricSpecObj.length,
            fabric_meters: fabricSpecObj.length,
            fabric_shade: fabricSpecObj.shade,
            attachment1_name: fabricSpecObj.attachment1?.name || null,
            attachment1_code: fabricSpecObj.attachment1?.code || null,
            attachment1_number: fabricSpecObj.attachment1?.code || null,
            attachment1_length: fabricSpecObj.attachment1?.length || null,
            attachment1_meters: fabricSpecObj.attachment1?.length || null,
            attachment1_shade: fabricSpecObj.attachment1?.shade || null,
            attachment2_name: fabricSpecObj.attachment2?.name || null,
            attachment2_code: fabricSpecObj.attachment2?.code || null,
            attachment2_number: fabricSpecObj.attachment2?.code || null,
            attachment2_length: fabricSpecObj.attachment2?.length || null,
            attachment2_meters: fabricSpecObj.attachment2?.length || null,
            attachment2_shade: fabricSpecObj.attachment2?.shade || null,
            fabrics: fabricSpecObj.all,
            sequence_no: seq,
            stage: "Cutting",
            status: "In Production",
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          seq++;
        }
      });

      // Ensure total pieces exactly equals totalQty
      while (seq <= totalQty) {
        const seqStr = String(seq).padStart(3, "0");
        const childCardNo = `CJC-${jobCard.job_card_no.replace("JC-", "")}-${seqStr}`;
        const barcode = `CJC-${jcNoDigits}-${seqStr}`;
        piecesToInsert.push({
          child_card_no: childCardNo,
          job_card_id: jobCardId,
          order_id: orderId,
          barcode,
          item_type: "standard",
          size: "M",
          member_id: null,
          member_name: null,
          admission_no: null,
          custom_measurements: {
            _fabric: fabricSpecObj,
            _fabrics: fabricSpecObj.all,
          },
          fabric_code: fabricSpecObj.code,
          fabric_name: fabricSpecObj.name,
          fabric_length: fabricSpecObj.length,
          fabric_meters: fabricSpecObj.length,
          fabric_shade: fabricSpecObj.shade,
          attachment1_name: fabricSpecObj.attachment1?.name || null,
          attachment1_code: fabricSpecObj.attachment1?.code || null,
          attachment1_number: fabricSpecObj.attachment1?.code || null,
          attachment1_length: fabricSpecObj.attachment1?.length || null,
          attachment1_meters: fabricSpecObj.attachment1?.length || null,
          attachment1_shade: fabricSpecObj.attachment1?.shade || null,
          attachment2_name: fabricSpecObj.attachment2?.name || null,
          attachment2_code: fabricSpecObj.attachment2?.code || null,
          attachment2_number: fabricSpecObj.attachment2?.code || null,
          attachment2_length: fabricSpecObj.attachment2?.length || null,
          attachment2_meters: fabricSpecObj.attachment2?.length || null,
          attachment2_shade: fabricSpecObj.attachment2?.shade || null,
          fabrics: fabricSpecObj.all,
          sequence_no: seq,
          stage: "Cutting",
          status: "In Production",
          notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        seq++;
      }
    }

    if (piecesToInsert.length > 0) {
      try {
        const { data: inserted, error: insertErr } = await supabase
          .from("child_job_cards")
          .insert(piecesToInsert)
          .select();

        if (insertErr) {
          console.warn(
            "[JobCardController] child_job_cards DB insert skipped (table pending in Supabase):",
            insertErr.message,
          );
          return {
            success: true,
            count: piecesToInsert.length,
            isCustomMode,
            fallback: true,
            pieces: piecesToInsert,
          };
        }
        return {
          success: true,
          count: inserted?.length || piecesToInsert.length,
          isCustomMode,
          pieces: inserted || piecesToInsert,
        };
      } catch (dbErr) {
        console.warn(
          "[JobCardController] child_job_cards DB insert caught:",
          dbErr.message,
        );
        return {
          success: true,
          count: piecesToInsert.length,
          isCustomMode,
          fallback: true,
          pieces: piecesToInsert,
        };
      }
    }

    return { success: true, count: 0, pieces: [] };
  } catch (err) {
    console.error(
      "[JobCardController] generateChildJobCardsForJobCard error:",
      err.message,
    );
    return { success: false, error: err.message };
  }
}

// 1. Raise Job Card from confirmed Sales Order (per item)
exports.createJobCardFromOrder = async (req, res) => {
  try {
    const {
      order_id,
      item_id,
      item_name,
      design_number,
      quantity,
      size_breakdown,
    } = req.body;

    if (!order_id || !item_name) {
      return res
        .status(400)
        .json({ error: "Order ID and Item Name are required." });
    }

    // Guard against duplicate Job Card creation for the same order and quotation item
    if (item_id && order_id) {
      const { data: existingCard } = await supabase
        .from("job_cards")
        .select("id, job_card_no, item_name")
        .eq("order_id", order_id)
        .eq("item_id", item_id)
        .maybeSingle();

      if (existingCard) {
        return res.status(409).json({
          error: `Job Card ${existingCard.job_card_no} already exists for "${existingCard.item_name}" in this order. Duplicate creation is blocked.`,
          jobCard: existingCard,
        });
      }
    }

    // Generate unique Job Card number: JC-YY/MM-XXXX
    const dateStr = new Date().toISOString().slice(2, 7).replace("-", "/"); // YY/MM
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const job_card_no = `JC-${dateStr}-${randNum}`;

    // Evaluate live measurement readiness for this order
    const readiness = await checkOrderMeasurementReadiness(order_id);
    const isMeasurementsPending = readiness.isMeasurementsPending;
    const pendingMeasurementsCount = readiness.pendingCount;

    // Resolve fabric info cross-checking with product, quotation, and class/dept specs
    const stubJc = {
      order_id,
      item_id,
      item_name,
      design_number,
      size_breakdown,
      quantity,
    };
    const resolvedFab = await resolveAllFabricsForJobCard(
      stubJc,
      size_breakdown,
    );

    let resolvedFabricId =
      resolvedFab.main?.id || size_breakdown?.fabric_id || null;
    let resolvedFabricName =
      resolvedFab.name || size_breakdown?.fabric_name || null;
    let consumptionPerPc = resolvedFab.length || 1.25;

    // Evaluate live fabric/material readiness (PRD M9.8)
    const fabricReadiness = await checkFabricReadiness(
      resolvedFabricId,
      resolvedFabricName,
      quantity,
      consumptionPerPc,
    );
    const isFabricDepleted = fabricReadiness.isFabricDepleted;

    let initialStatus = "Pending PO Handler";
    let holdReasons = [];

    if (isMeasurementsPending) {
      holdReasons.push(
        `Awaiting ${pendingMeasurementsCount} recipient measurement(s) (${readiness.approvedMembers}/${readiness.totalMembers} approved) — release to cutting is blocked.`,
      );
    }
    if (isFabricDepleted) {
      holdReasons.push(fabricReadiness.fabricHoldReason);
    }

    if (isMeasurementsPending && isFabricDepleted) {
      initialStatus = "Held (Awaiting Measurements & PO Fabric)";
    } else if (isFabricDepleted) {
      initialStatus = "Held (Awaiting PO Fabric)";
    } else if (isMeasurementsPending) {
      initialStatus = "Held (Awaiting Measurements)";
    } else {
      initialStatus = "Pending PO Handler";
    }

    const holdReason = holdReasons.length > 0 ? holdReasons.join(" | ") : null;
    const poHandlerAction = holdReasons.length > 0 ? "Hold" : "Pending";

    // Auto-resolve true DNS code and Art Number
    const finalDesignNumber =
      resolvedFab.design_number ||
      (design_number && design_number.trim().startsWith("DNS-") ? design_number.trim() : "DNS-STANDARD");
    const finalArtNumber =
      resolvedFab.art_number ||
      size_breakdown?.art_number ||
      (design_number ? (design_number.match(/^([0-9]+-[A-Za-z0-9]+)/)?.[1] || null) : null);

    const enrichedSizeBreakdown = {
      ...(size_breakdown || {}),
      art_number: finalArtNumber,
      design_number: finalDesignNumber,
      button_id: resolvedFab.button?.id || size_breakdown?.button_id || null,
      button_code: resolvedFab.button?.code || null,
      button_name: resolvedFab.button?.name || null,
      button_count: resolvedFab.button?.count || size_breakdown?.button_count || null,
      button: resolvedFab.button || null,
      thread_id: resolvedFab.thread?.id || size_breakdown?.thread_id || null,
      thread_code: resolvedFab.thread?.code || null,
      thread_name: resolvedFab.thread?.name || null,
      thread_count: resolvedFab.thread?.count || size_breakdown?.thread_count || null,
      thread: resolvedFab.thread || null,
      fabric_id: fabricReadiness.fabricId || resolvedFabricId || null,
      fabric_name: fabricReadiness.fabricName || resolvedFabricName || null,
      fabric_code: resolvedFab.code || null,
      fabric_shade: resolvedFab.shade || null,
      main_fabric_meters: consumptionPerPc,
      attachment_fabric1_id: resolvedFab.attachment1?.id || null,
      attachment_fabric1_name: resolvedFab.attachment1?.name || null,
      attachment_fabric1_code: resolvedFab.attachment1?.code || null,
      attachment_fabric1_meters: resolvedFab.attachment1?.length || null,
      attachment_fabric1_shade: resolvedFab.attachment1?.shade || null,
      attachment_fabric2_id: resolvedFab.attachment2?.id || null,
      attachment_fabric2_name: resolvedFab.attachment2?.name || null,
      attachment_fabric2_code: resolvedFab.attachment2?.code || null,
      attachment_fabric2_meters: resolvedFab.attachment2?.length || null,
      attachment_fabric2_shade: resolvedFab.attachment2?.shade || null,
      product_id: resolvedFab.product_id || size_breakdown?.product_id || null,
      product_name:
        resolvedFab.product_name || size_breakdown?.product_name || null,
      required_fabric_meters: fabricReadiness.requiredMeters,
      available_fabric_meters: fabricReadiness.availableMeters,
      measurement_readiness: isMeasurementsPending
        ? "Awaiting Measurements"
        : "Ready",
      material_readiness: isFabricDepleted ? "Awaiting PO Fabric" : "Ready",
      pending_measurements: pendingMeasurementsCount,
    };

    const { data: jobCard, error } = await supabase
      .from("job_cards")
      .insert([
        {
          job_card_no,
          order_id,
          item_id: item_id || null,
          item_name,
          design_number: finalDesignNumber,
          quantity: quantity || 1,
          size_breakdown: enrichedSizeBreakdown,
          status: initialStatus,
          po_handler_action: poHandlerAction,
          hold_reason: holdReason,
          created_by:
            req.user?.id && /^\d+$/.test(String(req.user.id))
              ? parseInt(req.user.id, 10)
              : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Log timeline activity
    try {
      await supabase.from("record_activity_logs").insert([
        {
          entity_type: "JobCard",
          entity_id: jobCard.id,
          action: "RAISED",
          performed_by: toSafeInt(req.user?.id),
          performed_by_name: req.user?.fullName || req.user?.email || null,
          details: {
            order_id,
            job_card_no,
            item_name,
            measurement_readiness: isMeasurementsPending
              ? "Awaiting Measurements"
              : "Ready",
          },
        },
      ]);
    } catch (logErr) {
      console.warn("[JobCardController] Activity log caught:", logErr.message);
    }

    // Auto-generate piece-level Child Job Cards with barcodes
    try {
      await generateChildJobCardsForJobCard(jobCard);
    } catch (cjcErr) {
      console.warn(
        "[JobCardController] Child cards generation warning:",
        cjcErr.message,
      );
    }

    res.status(201).json(jobCard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 2. Factory PO Handler Action (Accept / Reject with reason / Hold)
exports.poHandlerAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body; // Accept, Reject, Hold

    if (!["Accept", "Reject", "Hold"].includes(action)) {
      return res
        .status(400)
        .json({ error: "Action must be Accept, Reject, or Hold." });
    }

    if ((action === "Reject" || action === "Hold") && !reason) {
      return res.status(400).json({
        error: `A reason is required when setting status to ${action}.`,
      });
    }

    // Readiness Guard: Block acceptance if measurements are pending
    if (action === "Accept") {
      const { data: currentCard } = await supabase
        .from("job_cards")
        .select("id, order_id, status, size_breakdown, hold_reason")
        .eq("id", id)
        .maybeSingle();

      if (currentCard) {
        const readiness = await checkOrderMeasurementReadiness(
          currentCard.order_id,
        );
        if (readiness.isMeasurementsPending) {
          return res.status(400).json({
            error: `Cannot release Job Card to cutting: Recipient measurements are incomplete (${readiness.approvedMembers}/${readiness.totalMembers} approved). All measurements must be completed before acceptance.`,
          });
        }
      }
    }

    let newStatus = "Pending PO Handler";
    if (action === "Accept") newStatus = "Accepted";
    else if (action === "Reject") newStatus = "Rejected";
    else if (action === "Hold") newStatus = "Hold";

    const updateData = {
      po_handler_action: action,
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (action === "Reject") updateData.po_handler_reason = reason;
    if (action === "Hold") updateData.hold_reason = reason;

    const { data: updated, error } = await supabase
      .from("job_cards")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Log timeline activity
    try {
      await supabase.from("record_activity_logs").insert([
        {
          entity_type: "JobCard",
          entity_id: id,
          action: `PO_HANDLER_${action.toUpperCase()}`,
          performed_by: toSafeInt(req.user?.id),
          performed_by_name: req.user?.fullName || req.user?.email || null,
          details: { action, reason },
        },
      ]);
    } catch (logErr) {
      console.warn(
        "[JobCardController] PO Handler activity log caught:",
        logErr.message,
      );
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Helper: Check and auto-update Job Card status to 'Ready' once all batches/pieces finish production,
// and advance Sales Order to 'Ready for Dispatch' once all Job Cards for the order are Ready.
async function checkAndUpdateJobCardCompletion(jobCardId, user = null) {
  if (!jobCardId) return;
  try {
    const safeJcId = toSafeInt(jobCardId);
    if (!safeJcId) return;

    // Fetch parent Job Card
    const { data: jc, error: jcErr } = await supabase
      .from("job_cards")
      .select("id, job_card_no, order_id, quantity, status")
      .eq("id", safeJcId)
      .maybeSingle();

    if (jcErr || !jc) return;

    // Fetch all sub-job cards for this Job Card
    const { data: subCards, error: scErr } = await supabase
      .from("sub_job_cards")
      .select("id, sub_card_no, stage, batch_size")
      .eq("job_card_id", safeJcId);

    if (scErr) throw scErr;

    // Fetch child job cards if any
    let childCards = [];
    try {
      const { data: cData } = await supabase
        .from("child_job_cards")
        .select("id, stage, status")
        .eq("job_card_id", safeJcId);
      childCards = cData || [];
    } catch (cErr) {
      console.warn(
        "[JobCardController] child_job_cards check warning:",
        cErr.message,
      );
    }

    let isCompleted = false;

    if (subCards && subCards.length > 0) {
      // If batches exist, all batches must be in 'Ready' stage
      const allBatchesReady = subCards.every(
        (sc) => (sc.stage || "").toLowerCase() === "ready",
      );
      if (allBatchesReady) {
        isCompleted = true;
      }
    } else if (childCards && childCards.length > 0) {
      // If only child cards exist directly without sub-job cards
      const allPiecesReady = childCards.every(
        (c) =>
          (c.stage || "").toLowerCase() === "ready" ||
          (c.status || "").toLowerCase() === "ready" ||
          (c.status || "").toLowerCase() === "completed",
      );
      if (allPiecesReady) {
        isCompleted = true;
      }
    }

    if (isCompleted) {
      if (jc.status !== "Ready") {
        await supabase
          .from("job_cards")
          .update({
            status: "Ready",
            updated_at: new Date().toISOString(),
          })
          .eq("id", safeJcId);

        try {
          await supabase.from("record_activity_logs").insert([
            {
              entity_type: "JobCard",
              entity_id: safeJcId,
              action: "PRODUCTION_JOURNEY_COMPLETED",
              performed_by: toSafeInt(user?.id),
              performed_by_name:
                user?.fullName || user?.email || "System Automation",
              details: {
                job_card_no: jc.job_card_no,
                total_batches: subCards?.length || 0,
                status: "Ready",
                message: `Job Card ${jc.job_card_no} has completed its production journey and is marked Ready.`,
              },
            },
          ]);
        } catch (actErr) {
          console.warn(
            "[JobCardController] Completion activity log caught:",
            actErr.message,
          );
        }
      }

      // Check if all other Job Cards for this order are now Ready!
      if (jc.order_id) {
        const safeOrderId = toSafeInt(jc.order_id);
        const { data: orderJcs } = await supabase
          .from("job_cards")
          .select("id, status")
          .eq("order_id", safeOrderId);

        if (orderJcs && orderJcs.length > 0) {
          const allOrderJcsReady = orderJcs.every((card) => {
            if (card.id === safeJcId) return true; // Just marked ready
            const s = (card.status || "").toLowerCase();
            return s === "ready" || s === "completed";
          });

          if (allOrderJcsReady) {
            // Update order status to 'Ready for Dispatch'
            const { data: currentOrder } = await supabase
              .from("orders")
              .select("id, status, order_no")
              .eq("id", safeOrderId)
              .maybeSingle();

            if (
              currentOrder &&
              currentOrder.status !== "Ready for Dispatch" &&
              currentOrder.status !== "Dispatched" &&
              currentOrder.status !== "Delivered"
            ) {
              await supabase
                .from("orders")
                .update({
                  status: "Ready for Dispatch",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", safeOrderId);

              try {
                await supabase.from("record_activity_logs").insert([
                  {
                    entity_type: "Order",
                    entity_id: safeOrderId,
                    action: "ORDER_READY_FOR_DISPATCH",
                    performed_by: toSafeInt(user?.id),
                    performed_by_name:
                      user?.fullName || user?.email || "Production Floor",
                    details: {
                      order_no: currentOrder.order_no,
                      total_job_cards: orderJcs.length,
                      message:
                        "All Job Cards for this sales order have completed production. Order advanced to Ready for Dispatch.",
                    },
                  },
                ]);
              } catch (oActErr) {
                console.warn(
                  "[JobCardController] Order dispatch log caught:",
                  oActErr.message,
                );
              }
            }
          }
        }
      }
    }
  } catch (compErr) {
    console.error(
      "[JobCardController] checkAndUpdateJobCardCompletion error:",
      compErr.message,
    );
  }
}

// 3. List Job Cards for Factory / Production Coordinator queue (PRD M9.13)
exports.listJobCards = async (req, res) => {
  try {
    const { status, orderId } = req.query;

    const buildQuery = () => {
      let q = supabase
        .from("job_cards")
        .select(
          "*, orders(order_no, quotations(quotation_no, organization_id, organizations(name))), fabric_consumption_logs(id, fabric_name, required_meters, safety_margin_meters, issued_meters, returned_meters, cut_piece_batch_no, created_at)",
        )
        .order("created_at", { ascending: false });

      if (status) {
        let statusList = status.includes(",")
          ? status.split(",").map((s) => s.trim())
          : [status.trim()];

        // If filtering for production cards, include Ready lots so floor managers see completed items
        if (
          statusList.includes("Accepted") &&
          statusList.includes("In Production") &&
          !statusList.includes("Ready")
        ) {
          statusList.push("Ready");
        }

        if (statusList.length === 1) {
          q = q.eq("status", statusList[0]);
        } else {
          q = q.in("status", statusList);
        }
      }
      if (orderId) q = q.eq("order_id", orderId);
      return q;
    };

    const { data, error } = await buildQuery();
    if (error) throw error;

    // Auto-sync any orders with held or awaiting measurement cards (PRD M9.8)
    const uniqueOrderIds = [
      ...new Set((data || []).map((j) => j.order_id).filter(Boolean)),
    ];
    for (const oid of uniqueOrderIds) {
      await syncJobCardsForOrder(oid);
    }

    // Auto-sync completion for any cards whose batches/pieces are finished
    for (const jc of data || []) {
      if (jc.status !== "Ready") {
        await checkAndUpdateJobCardCompletion(jc.id, req.user);
      }
    }

    // Clean fetch with refreshed status
    const { data: finalData, error: finalError } = await buildQuery();
    if (finalError) throw finalError;

    // Enrich top-level measurement_readiness & fabric issue status (PRD M9.8, M9.10)
    const enriched = (finalData || []).map((jc) => {
      const logs = jc.fabric_consumption_logs || [];
      const isFabricIssued = logs.length > 0;
      const totalFabricIssued = logs.reduce(
        (sum, l) => sum + (parseFloat(l.issued_meters) || 0),
        0,
      );
      // Resolve clean Art Number and Design Number for both new and legacy cards
      let artNumber = jc.size_breakdown?.art_number || null;
      let cleanDesignNumber = jc.design_number || 'DNS-STANDARD';

      if (cleanDesignNumber && cleanDesignNumber.includes(' - ')) {
        const parts = cleanDesignNumber.split(' - ');
        if (!artNumber && parts[0]) {
          artNumber = parts[0].trim();
        }
        cleanDesignNumber = (jc.size_breakdown?.design_number && jc.size_breakdown.design_number.startsWith('DNS-'))
          ? jc.size_breakdown.design_number
          : 'DNS-STANDARD';
      } else if (cleanDesignNumber && /^([0-9]+-[A-Za-z0-9]+)/.test(cleanDesignNumber.trim()) && !cleanDesignNumber.startsWith('DNS-')) {
        if (!artNumber) artNumber = cleanDesignNumber.trim();
        cleanDesignNumber = 'DNS-STANDARD';
      }

      return {
        ...jc,
        art_number: artNumber,
        clean_design_number: cleanDesignNumber,
        button: jc.size_breakdown?.button || (jc.size_breakdown?.button_code || jc.size_breakdown?.button_name ? {
          code: jc.size_breakdown.button_code,
          name: jc.size_breakdown.button_name,
          count: jc.size_breakdown.button_count || 0
        } : null),
        thread: jc.size_breakdown?.thread || (jc.size_breakdown?.thread_code || jc.size_breakdown?.thread_name ? {
          code: jc.size_breakdown.thread_code,
          name: jc.size_breakdown.thread_name,
          count: jc.size_breakdown.thread_count || 0
        } : null),
        is_fabric_issued: isFabricIssued,
        fabric_issued_meters: totalFabricIssued,
        fabric_issue_details: logs[0] || null,
        measurement_readiness:
          jc.size_breakdown?.measurement_readiness ||
          (jc.status === "Held (Awaiting Measurements)"
            ? "Awaiting Measurements"
            : "Ready"),
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 4. Sub-Job Card / Batch Breakdown by Production Coordinator
exports.createSubJobCard = async (req, res) => {
  try {
    const {
      job_card_id,
      batch_size,
      target_date,
      assigned_to,
      selected_child_ids,
    } = req.body;

    if (!job_card_id) {
      return res.status(400).json({ error: "Job Card ID is required." });
    }

    // Allocate Child Job Cards to this batch
    let allocatedPieces = [];
    let sizeDist = {};

    if (Array.isArray(selected_child_ids) && selected_child_ids.length > 0) {
      // Custom selection by piece IDs
      const { data: cjcs } = await supabase
        .from("child_job_cards")
        .select("id, size, member_name, barcode")
        .in("id", selected_child_ids)
        .eq("job_card_id", job_card_id)
        .is("sub_job_card_id", null);

      allocatedPieces = cjcs || [];
    }

    const requestedBatchSize =
      allocatedPieces.length > 0
        ? allocatedPieces.length
        : parseInt(batch_size, 10);

    if (isNaN(requestedBatchSize) || requestedBatchSize <= 0) {
      return res
        .status(400)
        .json({
          error: "Batch size must be a positive number greater than 0.",
        });
    }

    // Fetch parent job card with total target quantity
    const { data: parentCard, error: parentError } = await supabase
      .from("job_cards")
      .select("id, job_card_no, quantity")
      .eq("id", job_card_id)
      .single();

    if (parentError || !parentCard)
      return res.status(404).json({ error: "Parent Job Card not found." });

    // If pieces weren't explicitly selected, auto-allocate unassigned child cards
    if (allocatedPieces.length === 0) {
      try {
        const { data: autoPieces } = await supabase
          .from("child_job_cards")
          .select("id, size, member_name, barcode")
          .eq("job_card_id", job_card_id)
          .is("sub_job_card_id", null)
          .order("sequence_no", { ascending: true })
          .limit(requestedBatchSize);

        allocatedPieces = autoPieces || [];
      } catch {
        allocatedPieces = [];
      }

      if (allocatedPieces.length === 0) {
        const inMem = await generateInMemoryPiecesForJobCard(job_card_id);
        allocatedPieces = inMem.slice(0, requestedBatchSize);
      }
    }

    // Compute multi-size distribution
    allocatedPieces.forEach((p) => {
      const label = p.size || p.member_name || "Standard";
      sizeDist[label] = (sizeDist[label] || 0) + 1;
    });

    // Fetch existing sub-job cards to calculate already allocated pieces
    const { data: existingSubCards, error: subError } = await supabase
      .from("sub_job_cards")
      .select("id, batch_size, sub_card_no")
      .eq("job_card_id", job_card_id);

    if (subError) throw subError;

    const alreadyAllocated = (existingSubCards || []).reduce(
      (acc, sc) => acc + (parseInt(sc.batch_size, 10) || 0),
      0,
    );
    const totalQty = parseInt(parentCard.quantity, 10) || 0;
    const remainingQty = totalQty - alreadyAllocated;

    if (remainingQty <= 0) {
      return res.status(400).json({
        error: `Job Card ${parentCard.job_card_no} is already fully allocated (${alreadyAllocated}/${totalQty} pcs across ${(existingSubCards || []).length} batches). No remaining quantity to batch.`,
      });
    }

    if (requestedBatchSize > remainingQty) {
      return res.status(400).json({
        error: `Requested batch size (${requestedBatchSize} pcs) exceeds the remaining unallocated quantity (${remainingQty} pcs remaining out of ${totalQty} pcs total).`,
      });
    }

    // Determine the next batch number by inspecting existing sub-cards
    const existingIndices = (existingSubCards || [])
      .map((sc) => {
        const match = (sc.sub_card_no || "").match(/BATCH(\d+)$/i);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n) && n > 0);

    let nextIndex =
      existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 1;
    let sub_card_no = `${parentCard.job_card_no}-BATCH${nextIndex}`;

    // Guaranteed collision prevention against sub_job_cards_sub_card_no_key
    let isUnique = false;
    while (!isUnique) {
      const { data: dup, error: dupErr } = await supabase
        .from("sub_job_cards")
        .select("id")
        .eq("sub_card_no", sub_card_no)
        .maybeSingle();

      if (dupErr) throw dupErr;
      if (!dup) {
        isUnique = true;
      } else {
        nextIndex++;
        sub_card_no = `${parentCard.job_card_no}-BATCH${nextIndex}`;
      }
    }

    let subCard = null;
    const insertPayload = {
      job_card_id,
      sub_card_no,
      batch_size: requestedBatchSize,
      size_distribution: sizeDist,
      stage: "Cutting",
      assigned_to: assigned_to || "Factory Floor",
      target_date: target_date || null,
    };

    const initialRes = await supabase
      .from("sub_job_cards")
      .insert([insertPayload])
      .select()
      .single();

    if (initialRes.error) {
      if (
        initialRes.error.message?.includes("size_distribution") ||
        initialRes.error.code === "PGRST204"
      ) {
        console.warn(
          "[JobCardController] size_distribution column not in sub_job_cards schema cache. Inserting without size_distribution column.",
        );
        delete insertPayload.size_distribution;
        const retryRes = await supabase
          .from("sub_job_cards")
          .insert([insertPayload])
          .select()
          .single();
        if (retryRes.error) throw retryRes.error;
        subCard = { ...retryRes.data, size_distribution: sizeDist };
      } else {
        throw initialRes.error;
      }
    } else {
      subCard = initialRes.data;
    }

    // Link allocated child job cards to this sub-job card (safely caught if table pending in Supabase)
    if (allocatedPieces.length > 0 && subCard) {
      try {
        const pIds = allocatedPieces.map((p) => p.id).filter(Boolean);
        if (pIds.length > 0) {
          await supabase
            .from("child_job_cards")
            .update({
              sub_job_card_id: subCard.id,
              stage: "Cutting",
              updated_at: new Date().toISOString(),
            })
            .in("id", pIds);
        }
      } catch (cjcErr) {
        console.warn(
          "[JobCardController] child_job_cards link notice:",
          cjcErr.message,
        );
      }
    }

    // Update parent Job Card status to In Production
    await supabase
      .from("job_cards")
      .update({ status: "In Production" })
      .eq("id", job_card_id);

    // Log Sub-Job Card creation to activity timeline (PRD M1.7)
    try {
      await supabase.from("record_activity_logs").insert([
        {
          entity_type: "JobCard",
          entity_id: job_card_id,
          action: "SUB_JOB_CARD_CREATED",
          performed_by: toSafeInt(req.user?.id),
          performed_by_name: req.user?.fullName || req.user?.email || null,
          details: {
            sub_card_no: subCard.sub_card_no,
            batch_size: subCard.batch_size,
            stage: subCard.stage,
            assigned_to: subCard.assigned_to,
            target_date: subCard.target_date,
          },
        },
      ]);
    } catch (logErr) {
      console.error(
        "[JobCardController] Sub-job card activity log failed:",
        logErr.message,
      );
    }

    res.status(201).json(subCard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 5. Update Production Stage for Sub-Job Card
exports.updateSubJobCardStage = async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body; // Cutting, Stitching, Finishing, QC, Packing, Ready

    const validStages = [
      "Cutting",
      "Stitching",
      "Finishing",
      "QC",
      "Packing",
      "Ready",
    ];
    if (!validStages.includes(stage)) {
      return res
        .status(400)
        .json({ error: `Invalid stage. Allowed: ${validStages.join(", ")}` });
    }

    const { data: updated, error } = await supabase
      .from("sub_job_cards")
      .update({
        stage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Propagate stage update to all Child Job Cards in this batch
    try {
      await supabase
        .from("child_job_cards")
        .update({
          stage,
          updated_at: new Date().toISOString(),
        })
        .eq("sub_job_card_id", id);
    } catch (e) {
      console.warn(
        "[JobCardController] Child card stage update warning:",
        e.message,
      );
    }

    // Auto-update parent Job Card status to 'Ready' if all batches are completed
    if (updated?.job_card_id) {
      await checkAndUpdateJobCardCompletion(updated.job_card_id, req.user);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 5b. List Sub-Job Cards for Production Floor Stage Tracking
exports.listSubJobCards = async (req, res) => {
  try {
    const { job_card_id, stage } = req.query;
    let query = supabase
      .from("sub_job_cards")
      .select(
        "*, job_cards(id, job_card_no, item_name, quantity, status, orders(order_no))",
      )
      .order("created_at", { ascending: false });

    if (job_card_id) query = query.eq("job_card_id", job_card_id);
    if (stage && stage !== "all") query = query.eq("stage", stage);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 5c. Delete / Void Sub-Job Card Batch (Only allowed if still in Cutting stage)
exports.deleteSubJobCard = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: subCard, error: fetchErr } = await supabase
      .from("sub_job_cards")
      .select("id, job_card_id, sub_card_no, batch_size, stage")
      .eq("id", id)
      .single();

    if (fetchErr || !subCard) {
      return res.status(404).json({ error: "Sub-Job Card batch not found." });
    }

    // Only allow deletion if still in Cutting stage
    if (subCard.stage !== "Cutting") {
      return res.status(400).json({
        error: `Cannot delete batch ${subCard.sub_card_no} because it has already progressed past Cutting to ${subCard.stage}.`,
      });
    }

    // Unassign child cards from this batch
    try {
      await supabase
        .from("child_job_cards")
        .update({
          sub_job_card_id: null,
          stage: "Cutting",
          updated_at: new Date().toISOString(),
        })
        .eq("sub_job_card_id", id);
    } catch (e) {}

    const { error: delErr } = await supabase
      .from("sub_job_cards")
      .delete()
      .eq("id", id);

    if (delErr) throw delErr;

    // Check if any other batches remain for this parent job card
    const { data: remainingBatches } = await supabase
      .from("sub_job_cards")
      .select("id")
      .eq("job_card_id", subCard.job_card_id);

    // If no batches remain, revert parent job card status back to 'Accepted'
    if (!remainingBatches || remainingBatches.length === 0) {
      await supabase
        .from("job_cards")
        .update({ status: "Accepted" })
        .eq("id", subCard.job_card_id);
    }

    // Log deletion activity
    try {
      await supabase.from("record_activity_logs").insert([
        {
          entity_type: "JobCard",
          entity_id: subCard.job_card_id,
          action: "SUB_JOB_CARD_DELETED",
          performed_by: toSafeInt(req.user?.id),
          performed_by_name: req.user?.fullName || req.user?.email || null,
          details: {
            sub_card_no: subCard.sub_card_no,
            batch_size: subCard.batch_size,
            stage: subCard.stage,
          },
        },
      ]);
    } catch (e) {}

    res.json({
      success: true,
      message: `Batch ${subCard.sub_card_no} deleted successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 5.5 Get all required fabrics for a Job Card (automatically list Main Fabric, Attachment 1, Attachment 2, etc.)
exports.getRequiredFabricsForJobCard = async (req, res) => {
  try {
    const { id } = req.params;
    const safeId = toSafeInt(id);

    const { data: jc, error: jcErr } = await supabase
      .from("job_cards")
      .select("*, orders(id, order_no, quotation_id)")
      .eq("id", safeId)
      .maybeSingle();

    if (jcErr || !jc)
      return res.status(404).json({ error: "Job Card not found" });

    // Fetch warehouse fabrics
    const { data: stockFabrics } = await supabase
      .from("fabrics")
      .select(
        "id, name, code, quantity, shade, brand_name, low_stock_threshold",
      )
      .order("name", { ascending: true });

    const totalQty = parseInt(jc.quantity, 10) || 1;
    let sizeBreakdown = jc.size_breakdown || {};

    // Also check linked quotation item if available
    let qItemBreakdown = null;
    let qItemProductType = null;
    const safeItemId = toSafeInt(jc.item_id);
    if (safeItemId) {
      const { data: qItem } = await supabase
        .from("quotation_items")
        .select("size_breakdown, product_types(id, name)")
        .eq("id", safeItemId)
        .maybeSingle();
      if (qItem?.size_breakdown) {
        qItemBreakdown = qItem.size_breakdown;
      }
      if (qItem?.product_types?.name) {
        qItemProductType = qItem.product_types.name;
      }
    }

    // Helper to find stock fabric by ID or name/shade
    const findStockFabric = (fId, fName, fShade) => {
      if (!stockFabrics || stockFabrics.length === 0) return null;
      if (fId) {
        const byId = stockFabrics.find((f) => String(f.id) === String(fId));
        if (byId) return byId;
      }
      if (fName) {
        const cleanName = String(fName).toLowerCase().trim();
        const byName = stockFabrics.find(
          (f) => f.name?.toLowerCase().trim() === cleanName,
        );
        if (byName) return byName;
        const byPartial = stockFabrics.find(
          (f) =>
            f.name?.toLowerCase().includes(cleanName) ||
            cleanName.includes(f.name?.toLowerCase()),
        );
        if (byPartial) return byPartial;
      }
      if (fShade) {
        const cleanShade = String(fShade).toLowerCase().trim();
        const byShade = stockFabrics.find(
          (f) => f.shade?.toLowerCase().trim() === cleanShade,
        );
        if (byShade) return byShade;
      }
      return null;
    };

    // 1. Gather all product / garment components for this Job Card
    // Supports Sets / Combos (is_set: true with nested products array)
    const productList = [];

    const nestedProducts =
      Array.isArray(sizeBreakdown.products) && sizeBreakdown.products.length > 0
        ? sizeBreakdown.products
        : Array.isArray(qItemBreakdown?.products) &&
            qItemBreakdown.products.length > 0
          ? qItemBreakdown.products
          : null;

    if (nestedProducts && nestedProducts.length > 0) {
      for (const p of nestedProducts) {
        const pQty = parseInt(p.quantity, 10) || totalQty;
        // Strictly sanitize product_id so that client-generated UUIDs are never treated as bigint catalog IDs
        const safePId = toSafeInt(p.product_id) || toSafeInt(p.id) || null;
        productList.push({
          product_id: safePId,
          product_name:
            p.product_name ||
            p.name ||
            p.product_type_name ||
            jc.item_name ||
            "Garment",
          product_type_name: p.product_type_name || "",
          quantity: pQty,
          fabric_id:
            p.fabric_id ||
            p.main_fabric_id ||
            p.size_breakdown?.fabric_id ||
            null,
          fabric_name:
            p.fabric_name ||
            p.main_fabric_name ||
            p.size_breakdown?.fabric_name ||
            null,
          consumption:
            parseFloat(
              p.main_fabric_meters ||
                p.consumption ||
                p.size_breakdown?.main_fabric_meters,
            ) || 1.25,
          attachment_fabric1_id:
            p.attachment_fabric1_id ||
            p.size_breakdown?.attachment_fabric1_id ||
            null,
          attachment_fabric1_name:
            p.attachment_fabric1_name ||
            p.size_breakdown?.attachment_fabric1_name ||
            null,
          attachment_fabric1_meters: parseFloat(
            p.attachment_fabric1_meters ||
              p.size_breakdown?.attachment_fabric1_meters ||
              0,
          ),
          attachment_fabric2_id:
            p.attachment_fabric2_id ||
            p.size_breakdown?.attachment_fabric2_id ||
            null,
          attachment_fabric2_name:
            p.attachment_fabric2_name ||
            p.size_breakdown?.attachment_fabric2_name ||
            null,
          attachment_fabric2_meters: parseFloat(
            p.attachment_fabric2_meters ||
              p.size_breakdown?.attachment_fabric2_meters ||
              0,
          ),
        });
      }
    } else {
      // Single product / garment definition
      const safePId =
        toSafeInt(sizeBreakdown.product_id) ||
        toSafeInt(qItemBreakdown?.product_id) ||
        null;
      productList.push({
        product_id: safePId,
        product_name:
          jc.item_name ||
          sizeBreakdown.product_name ||
          qItemBreakdown?.product_name ||
          qItemProductType ||
          "Garment Item",
        product_type_name: qItemProductType || jc.item_name || "",
        quantity: totalQty,
        fabric_id:
          sizeBreakdown.fabric_id ||
          sizeBreakdown.main_fabric_id ||
          qItemBreakdown?.fabric_id ||
          null,
        fabric_name:
          sizeBreakdown.fabric_name ||
          sizeBreakdown.main_fabric_name ||
          qItemBreakdown?.fabric_name ||
          null,
        consumption:
          parseFloat(
            sizeBreakdown.main_fabric_meters ||
              qItemBreakdown?.main_fabric_meters,
          ) || 1.25,
        attachment_fabric1_id:
          sizeBreakdown.attachment_fabric1_id ||
          qItemBreakdown?.attachment_fabric1_id ||
          null,
        attachment_fabric1_name:
          sizeBreakdown.attachment_fabric1_name ||
          qItemBreakdown?.attachment_fabric1_name ||
          null,
        attachment_fabric1_meters: parseFloat(
          sizeBreakdown.attachment_fabric1_meters ||
            qItemBreakdown?.attachment_fabric1_meters ||
            0,
        ),
        attachment_fabric2_id:
          sizeBreakdown.attachment_fabric2_id ||
          qItemBreakdown?.attachment_fabric2_id ||
          null,
        attachment_fabric2_name:
          sizeBreakdown.attachment_fabric2_name ||
          qItemBreakdown?.attachment_fabric2_name ||
          null,
        attachment_fabric2_meters: parseFloat(
          sizeBreakdown.attachment_fabric2_meters ||
            qItemBreakdown?.attachment_fabric2_meters ||
            0,
        ),
      });
    }

    // Check catalog products table for any missing fabric specs - strictly only valid numeric IDs
    const prodIdsToFetch = productList
      .map((p) => toSafeInt(p.product_id))
      .filter(Boolean);
    let catalogMap = {};
    if (prodIdsToFetch.length > 0) {
      try {
        const { data: catData } = await supabase
          .from("products")
          .select(
            "id, name, main_fabric, attachment_fabric1, attachment_fabric2, main_fabric_id, attachment_fabric1_id, attachment_fabric2_id",
          )
          .in("id", prodIdsToFetch);
        if (catData) {
          catData.forEach((cp) => {
            catalogMap[cp.id] = cp;
          });
        }
      } catch (catErr) {
        console.warn(
          "[JobCardController] Products catalog lookup caught:",
          catErr.message,
        );
      }
    }

    // Running cumulative deductions to accurately reflect multi-product usage of the same roll
    const runningStockDeductions = {};

    const requiredFabrics = [];

    // Process each product in the Job Card
    for (const prod of productList) {
      const catProd = prod.product_id ? catalogMap[prod.product_id] : null;
      const pQty = prod.quantity || totalQty;

      // 1. Main Fabric for this product
      const mFabId = prod.fabric_id || catProd?.main_fabric_id;
      const mFabName =
        prod.fabric_name ||
        (catProd?.name ? `${catProd.name} Production Fabric` : `${prod.product_name} Production Fabric`);
      const catMainMeters =
        catProd?.main_fabric !== undefined && catProd?.main_fabric !== null
          ? parseFloat(catProd.main_fabric)
          : NaN;
      const mConsumption =
        !isNaN(parseFloat(prod.consumption)) && parseFloat(prod.consumption) > 0
          ? parseFloat(prod.consumption)
          : !isNaN(catMainMeters) && catMainMeters > 0
            ? catMainMeters
            : 1.25;
      const matchedMain = findStockFabric(mFabId, mFabName);

      const mReqMeters = parseFloat((pQty * mConsumption).toFixed(2));
      const mSafetyMargin = parseFloat((mReqMeters * 0.1).toFixed(2));
      const mTotalIssue = parseFloat((mReqMeters + mSafetyMargin).toFixed(2));

      const stockRollId =
        matchedMain?.id || mFabId || stockFabrics?.[0]?.id || null;
      const originalStock = parseFloat(
        matchedMain?.quantity || stockFabrics?.[0]?.quantity || 0,
      );
      const priorDeduction = runningStockDeductions[stockRollId] || 0;
      const currentAvailable = Math.max(0, originalStock - priorDeduction);
      const postIssueStock = Math.max(0, currentAvailable - mTotalIssue);
      runningStockDeductions[stockRollId] = priorDeduction + mTotalIssue;

      requiredFabrics.push({
        product_name: prod.product_name,
        role:
          productList.length > 1
            ? `${prod.product_name} - Main Fabric`
            : "Main Fabric",
        fabric_key: `${prod.product_name}_main_${requiredFabrics.length}`,
        fabric_id: stockRollId,
        fabric_name:
          matchedMain?.name ||
          mFabName ||
          stockFabrics?.[0]?.name ||
          "Standard Production Fabric",
        fabric_code: matchedMain?.code || stockFabrics?.[0]?.code || "N/A",
        shade: matchedMain?.shade || stockFabrics?.[0]?.shade || null,
        consumption_per_pc: mConsumption,
        quantity: pQty,
        required_meters: mReqMeters,
        safety_margin_meters: mSafetyMargin,
        total_issue_meters: mTotalIssue,
        available_stock: currentAvailable,
        is_in_stock: currentAvailable >= mTotalIssue,
        stock_after_issue: postIssueStock,
        returned_meters: 0,
      });

      // 2. Attachment Fabric 1 for this product
      const att1Id =
        prod.attachment_fabric1_id || catProd?.attachment_fabric1_id;
      const att1Name =
        prod.attachment_fabric1_name ||
        (catProd?.attachment_fabric1_id ? "Attachment Fabric 1" : null);
      const catAtt1Meters =
        catProd?.attachment_fabric1 !== undefined &&
        catProd?.attachment_fabric1 !== null
          ? parseFloat(catProd.attachment_fabric1)
          : NaN;
      const att1Meters =
        !isNaN(parseFloat(prod.attachment_fabric1_meters)) &&
        parseFloat(prod.attachment_fabric1_meters) > 0
          ? parseFloat(prod.attachment_fabric1_meters)
          : !isNaN(catAtt1Meters) && catAtt1Meters > 0
            ? catAtt1Meters
            : 0;

      const isRealFab = (id, name) => {
        if (id && String(id).trim() !== "" && String(id) !== "null" && String(id) !== "undefined") return true;
        if (name && typeof name === "string") {
          const clean = name.toLowerCase().trim();
          if (
            clean &&
            clean !== "null" &&
            clean !== "undefined" &&
            clean !== "optional..." &&
            clean !== "optional" &&
            clean !== "none" &&
            clean !== "n/a" &&
            !clean.includes("attachment fabric") &&
            !clean.includes("att1-std") &&
            !clean.includes("att2-std")
          ) {
            return true;
          }
        }
        return false;
      };

      if (isRealFab(att1Id, att1Name) && att1Meters > 0) {
        const matchedAtt1 = findStockFabric(att1Id, att1Name);
        const a1ReqMeters = parseFloat((pQty * att1Meters).toFixed(2));
        const a1SafetyMargin = parseFloat((a1ReqMeters * 0.1).toFixed(2));
        const a1TotalIssue = parseFloat(
          (a1ReqMeters + a1SafetyMargin).toFixed(2),
        );

        const a1RollId = matchedAtt1?.id || att1Id || null;
        const a1OriginalStock = parseFloat(matchedAtt1?.quantity || 0);
        const a1PriorDeduction = runningStockDeductions[a1RollId] || 0;
        const a1Available = Math.max(0, a1OriginalStock - a1PriorDeduction);
        const a1PostStock = Math.max(0, a1Available - a1TotalIssue);
        if (a1RollId)
          runningStockDeductions[a1RollId] = a1PriorDeduction + a1TotalIssue;

        requiredFabrics.push({
          product_name: prod.product_name,
          role:
            productList.length > 1
              ? `${prod.product_name} - Attachment 1 (Collar / Lining)`
              : "Attachment Fabric 1 (Collar / Lining)",
          fabric_key: `${prod.product_name}_att1_${requiredFabrics.length}`,
          fabric_id: a1RollId,
          fabric_name: matchedAtt1?.name || att1Name || "Attachment Fabric 1",
          fabric_code: matchedAtt1?.code || "N/A",
          shade: matchedAtt1?.shade || null,
          consumption_per_pc: att1Meters,
          quantity: pQty,
          required_meters: a1ReqMeters,
          safety_margin_meters: a1SafetyMargin,
          total_issue_meters: a1TotalIssue,
          available_stock: a1Available,
          is_in_stock: a1Available >= a1TotalIssue,
          stock_after_issue: a1PostStock,
          returned_meters: 0,
        });
      }

      // 3. Attachment Fabric 2 for this product
      const att2Id =
        prod.attachment_fabric2_id || catProd?.attachment_fabric2_id;
      const att2Name =
        prod.attachment_fabric2_name ||
        (catProd?.attachment_fabric2_id ? "Attachment Fabric 2" : null);
      const catAtt2Meters =
        catProd?.attachment_fabric2 !== undefined &&
        catProd?.attachment_fabric2 !== null
          ? parseFloat(catProd.attachment_fabric2)
          : NaN;
      const att2Meters =
        !isNaN(parseFloat(prod.attachment_fabric2_meters)) &&
        parseFloat(prod.attachment_fabric2_meters) > 0
          ? parseFloat(prod.attachment_fabric2_meters)
          : !isNaN(catAtt2Meters) && catAtt2Meters > 0
            ? catAtt2Meters
            : 0;

      if (isRealFab(att2Id, att2Name) && att2Meters > 0) {
        const matchedAtt2 = findStockFabric(att2Id, att2Name);
        const a2ReqMeters = parseFloat((pQty * att2Meters).toFixed(2));
        const a2SafetyMargin = parseFloat((a2ReqMeters * 0.1).toFixed(2));
        const a2TotalIssue = parseFloat(
          (a2ReqMeters + a2SafetyMargin).toFixed(2),
        );

        const a2RollId = matchedAtt2?.id || att2Id || null;
        const a2OriginalStock = parseFloat(matchedAtt2?.quantity || 0);
        const a2PriorDeduction = runningStockDeductions[a2RollId] || 0;
        const a2Available = Math.max(0, a2OriginalStock - a2PriorDeduction);
        const a2PostStock = Math.max(0, a2Available - a2TotalIssue);
        if (a2RollId)
          runningStockDeductions[a2RollId] = a2PriorDeduction + a2TotalIssue;

        requiredFabrics.push({
          product_name: prod.product_name,
          role:
            productList.length > 1
              ? `${prod.product_name} - Attachment 2 (Pockets / Trims)`
              : "Attachment Fabric 2 (Pockets / Trims)",
          fabric_key: `${prod.product_name}_att2_${requiredFabrics.length}`,
          fabric_id: a2RollId,
          fabric_name: matchedAtt2?.name || att2Name || "Attachment Fabric 2",
          fabric_code: matchedAtt2?.code || "N/A",
          shade: matchedAtt2?.shade || null,
          consumption_per_pc: att2Meters,
          quantity: pQty,
          required_meters: a2ReqMeters,
          safety_margin_meters: a2SafetyMargin,
          total_issue_meters: a2TotalIssue,
          available_stock: a2Available,
          is_in_stock: a2Available >= a2TotalIssue,
          stock_after_issue: a2PostStock,
          returned_meters: 0,
        });
      }
    }

    // Check existing logs
    const { data: logs } = await supabase
      .from("fabric_consumption_logs")
      .select("id, fabric_name, issued_meters, created_at")
      .eq("job_card_id", safeId);

    const isAlreadyIssued = logs && logs.length > 0;
    const allInStock = requiredFabrics.every((f) => f.is_in_stock);
    const totalMetersAllFabrics = requiredFabrics.reduce(
      (sum, f) => sum + f.total_issue_meters,
      0,
    );

    res.json({
      success: true,
      job_card_id: jc.id,
      job_card_no: jc.job_card_no,
      item_name: jc.item_name,
      quantity: totalQty,
      products_count: productList.length,
      is_already_issued: isAlreadyIssued,
      existing_logs: logs || [],
      fabrics: requiredFabrics,
      required_fabrics: requiredFabrics,
      all_in_stock: allInStock,
      total_meters_all_fabrics: parseFloat(totalMetersAllFabrics.toFixed(2)),
      stock_fabrics: stockFabrics || [],
    });
  } catch (err) {
    console.error(
      "[JobCardController] getRequiredFabricsForJobCard error:",
      err.message,
    );
    res.status(500).json({ error: err.message });
  }
};

// 6. Fabric Consumption Logging & Issue with 10% Safety Margin & Automated Stock Reduction
exports.logFabricConsumption = async (req, res) => {
  try {
    const {
      job_card_id,
      sub_job_card_id,
      fabric_id,
      fabric_name,
      required_meters,
      returned_meters,
      cut_piece_notes,
      items, // Array of required fabrics to issue together
      approval_confirmed,
    } = req.body;

    if (!job_card_id) {
      return res.status(400).json({ error: "Job Card ID is required." });
    }

    const safeJobCardId = toSafeInt(job_card_id);

    // Fetch parent Job Card
    const { data: parentJobCard, error: jcErr } = await supabase
      .from("job_cards")
      .select("id, job_card_no, quantity, size_breakdown, status, hold_reason")
      .eq("id", safeJobCardId)
      .single();

    if (jcErr || !parentJobCard) {
      return res.status(404).json({ error: "Parent Job Card not found." });
    }

    // Guard against duplicate fabric issuing for the same job card
    const { data: existingLogs, error: logCheckErr } = await supabase
      .from("fabric_consumption_logs")
      .select("id, issued_meters, created_at, fabric_name")
      .eq("job_card_id", safeJobCardId);

    if (logCheckErr) throw logCheckErr;

    if (existingLogs && existingLogs.length > 0) {
      const totalIssued = existingLogs.reduce(
        (acc, l) => acc + (parseFloat(l.issued_meters) || 0),
        0,
      );
      const issueDate = new Date(existingLogs[0].created_at).toLocaleDateString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
        },
      );
      return res.status(400).json({
        error: `Fabric has already been issued for Job Card #${safeJobCardId} (${totalIssued.toFixed(2)}m on ${issueDate}). Duplicate issuing is locked to prevent double inventory deduction.`,
      });
    }

    // Determine items to process
    let itemsToProcess = [];
    if (Array.isArray(items) && items.length > 0) {
      itemsToProcess = items;
    } else if (required_meters) {
      itemsToProcess = [
        {
          fabric_id,
          fabric_name,
          required_meters,
          returned_meters,
          role: "Main Fabric",
        },
      ];
    } else {
      return res
        .status(400)
        .json({ error: "No fabric items provided to issue." });
    }

    const processedLogs = [];
    const stockDeductions = [];

    // Pre-flight check: verify all fabrics have sufficient stock before making any deductions
    for (const item of itemsToProcess) {
      const reqMeters = parseFloat(item.required_meters);
      if (isNaN(reqMeters) || reqMeters <= 0) {
        return res
          .status(400)
          .json({
            error: `Invalid required meters for fabric ${item.fabric_name || "item"}.`,
          });
      }

      const safetyMargin = parseFloat((reqMeters * 0.1).toFixed(2));
      const issuedMeters = parseFloat((reqMeters + safetyMargin).toFixed(2));

      let fabricRecord = null;
      if (item.fabric_id) {
        const { data: fById } = await supabase
          .from("fabrics")
          .select("id, quantity, name, code")
          .eq("id", item.fabric_id)
          .maybeSingle();
        fabricRecord = fById;
      }
      if (!fabricRecord && item.fabric_name) {
        const { data: fByName } = await supabase
          .from("fabrics")
          .select("id, quantity, name, code")
          .ilike("name", item.fabric_name)
          .maybeSingle();
        fabricRecord = fByName;
      }

      if (fabricRecord) {
        const availableStock = parseFloat(fabricRecord.quantity || 0);
        if (availableStock < issuedMeters) {
          return res.status(400).json({
            error: `Insufficient stock in warehouse for "${fabricRecord.name}". Required allotment is ${issuedMeters}m (${reqMeters}m BOM + 10% safety margin), but only ${availableStock.toFixed(2)}m is available.`,
          });
        }
      }

      stockDeductions.push({
        item,
        fabricRecord,
        reqMeters,
        safetyMargin,
        issuedMeters,
        returnedMeters: parseFloat(
          item.returned_meters || returned_meters || 0,
        ),
      });
    }

    // Execute stock deduction and logging
    for (const alloc of stockDeductions) {
      const {
        item,
        fabricRecord,
        reqMeters,
        safetyMargin,
        issuedMeters,
        returnedMeters: retM,
      } = alloc;

      let cutPieceBatchNo = null;
      if (retM > 0) {
        const dateStr = new Date().toISOString().slice(2, 7).replace("-", "");
        cutPieceBatchNo = `CUT-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      // 1. Insert consumption log
      let logEntry = null;
      try {
        const { data, error: logErr } = await supabase
          .from("fabric_consumption_logs")
          .insert([
            {
              job_card_id: safeJobCardId,
              sub_job_card_id: sub_job_card_id
                ? toSafeInt(sub_job_card_id)
                : null,
              fabric_id: fabricRecord?.id
                ? String(fabricRecord.id)
                : item.fabric_id
                  ? String(item.fabric_id)
                  : null,
              fabric_name:
                fabricRecord?.name ||
                item.fabric_name ||
                "Standard Production Fabric",
              required_meters: reqMeters,
              safety_margin_meters: safetyMargin,
              issued_meters: issuedMeters,
              consumed_meters: reqMeters,
              returned_meters: retM,
              cut_piece_batch_no: cutPieceBatchNo,
              created_by: toSafeInt(req.user?.id),
            },
          ])
          .select()
          .single();

        if (logErr) throw logErr;
        logEntry = data;
      } catch (insertErr) {
        if (
          insertErr.code === "22P02" ||
          (insertErr.message && insertErr.message.includes("bigint"))
        ) {
          console.warn(
            "[JobCardController] fabric_consumption_logs fabric_id bigint type mismatch, retrying with sanitized integer/null:",
            insertErr.message,
          );
          const { data: retryData, error: retryErr } = await supabase
            .from("fabric_consumption_logs")
            .insert([
              {
                job_card_id: safeJobCardId,
                sub_job_card_id: sub_job_card_id
                  ? toSafeInt(sub_job_card_id)
                  : null,
                fabric_id:
                  toSafeInt(fabricRecord?.id) ||
                  toSafeInt(item.fabric_id) ||
                  null,
                fabric_name:
                  fabricRecord?.name ||
                  item.fabric_name ||
                  "Standard Production Fabric",
                required_meters: reqMeters,
                safety_margin_meters: safetyMargin,
                issued_meters: issuedMeters,
                consumed_meters: reqMeters,
                returned_meters: retM,
                cut_piece_batch_no: cutPieceBatchNo,
                created_by: toSafeInt(req.user?.id),
              },
            ])
            .select()
            .single();

          if (retryErr) throw retryErr;
          logEntry = retryData;
        } else {
          throw insertErr;
        }
      }
      processedLogs.push(logEntry);

      // 2. Automatically reduce warehouse stock (PRD M9.10, M9.11)
      if (fabricRecord) {
        try {
          const netDeduction = issuedMeters - retM;
          const newStock = Math.max(
            0,
            parseFloat(
              ((fabricRecord.quantity || 0) - netDeduction).toFixed(2),
            ),
          );
          await supabase
            .from("fabrics")
            .update({
              quantity: newStock,
              updated_at: new Date().toISOString(),
            })
            .eq("id", fabricRecord.id);
        } catch (stockErr) {
          console.error(
            "[JobCardController] Fabric stock deduction error:",
            stockErr.message,
          );
        }
      }

      // 3. Activity timeline log (PRD M1.7)
      try {
        await supabase.from("record_activity_logs").insert([
          {
            entity_type: "JobCard",
            entity_id: safeJobCardId,
            action: "FABRIC_CONSUMPTION_APPROVED_AND_ISSUED",
            performed_by: toSafeInt(req.user?.id),
            performed_by_name: req.user?.fullName || req.user?.email || null,
            details: {
              fabric_name: logEntry.fabric_name,
              role: item.role || "Fabric",
              required_meters: logEntry.required_meters,
              safety_margin_meters: logEntry.safety_margin_meters,
              issued_meters: logEntry.issued_meters,
              returned_meters: logEntry.returned_meters,
              cut_piece_batch_no: logEntry.cut_piece_batch_no,
              sub_job_card_id,
            },
          },
        ]);
      } catch (logErr) {
        console.error(
          "[JobCardController] Fabric activity log warning:",
          logErr.message,
        );
      }
    }

    // 4. Update Job Card: release PO fabric hold if held
    let updatedStatus = parentJobCard.status;
    let updatedHoldReason = parentJobCard.hold_reason;
    if (parentJobCard.status === "Held (Awaiting PO Fabric)") {
      updatedStatus = "Pending PO Handler";
      updatedHoldReason = null;
    } else if (
      parentJobCard.status === "Held (Awaiting Measurements & PO Fabric)"
    ) {
      updatedStatus = "Held (Awaiting Measurements)";
      updatedHoldReason =
        updatedHoldReason?.replace(
          /Fabric.*?depleted.*?PO fabric arrives\.\s*\|?\s*/gi,
          "",
        ) || updatedHoldReason;
    }

    const updatedSizeBreakdown = {
      ...(parentJobCard.size_breakdown || {}),
      material_readiness: "Ready",
      is_fabric_issued: true,
      fabric_issued_at: new Date().toISOString(),
    };

    await supabase
      .from("job_cards")
      .update({
        status: updatedStatus,
        hold_reason: updatedHoldReason,
        size_breakdown: updatedSizeBreakdown,
        updated_at: new Date().toISOString(),
      })
      .eq("id", safeJobCardId);

    res.status(201).json({
      success: true,
      message: `Successfully approved & issued ${processedLogs.length} fabric(s). Warehouse stock automatically deducted.`,
      logs: processedLogs,
    });
  } catch (err) {
    console.error(
      "[JobCardController] logFabricConsumption error:",
      err.message,
    );
    res.status(500).json({ error: err.message });
  }
};

// 7. Get eligible orders for Job Card creation (confirmed SOs with their quotation items)
exports.getEligibleOrdersForJobCards = async (req, res) => {
  try {
    const isAdmin =
      req.user?.role === "Admin" ||
      req.user?.role === "Super Admin" ||
      req.user?.role === "SuperAdmin";
    const userBranchId = req.user?.branchId;

    let query = supabase
      .from("orders")
      .select(
        `
                id, order_no, status, branch_id,
                quotations(
                    id, quotation_no, title, final_quote_value,
                    organizations(name),
                    quotation_items(
                        id, product_type_id, quantity, size_breakdown, unit_price,
                        product_types(name)
                    )
                )
            `,
      )
      .in("status", ["Corporate Accepted", "Placed", "In Production"])
      .order("created_at", { ascending: false });

    if (!isAdmin && userBranchId) {
      query = query.eq("branch_id", userBranchId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Fetch existing job cards for these orders to determine which items are already raised
    const orderIds = (data || []).map((o) => o.id);
    let existingCardsByOrder = {};
    if (orderIds.length > 0) {
      const { data: existingCards } = await supabase
        .from("job_cards")
        .select("id, order_id, item_id")
        .in("order_id", orderIds);

      (existingCards || []).forEach((jc) => {
        if (!existingCardsByOrder[jc.order_id])
          existingCardsByOrder[jc.order_id] = new Set();
        if (jc.item_id)
          existingCardsByOrder[jc.order_id].add(Number(jc.item_id));
      });
    }

    // Only return orders that have unraised quotation items
    const eligible = [];
    for (const order of data || []) {
      const allItems = order.quotations?.quotation_items || [];
      const raisedSet = existingCardsByOrder[order.id] || new Set();
      const unraisedItems = allItems.filter(
        (it) => !raisedSet.has(Number(it.id)),
      );

      if (unraisedItems.length > 0) {
        eligible.push({
          ...order,
          quotations: {
            ...order.quotations,
            quotation_items: unraisedItems,
          },
        });
      }
    }

    res.json(eligible);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Helper: Generate pieces in-memory if table is not yet migrated in Supabase
async function generateInMemoryPiecesForJobCard(jobCardId) {
  try {
    const { data: jc } = await supabase
      .from("job_cards")
      .select(
        "*, orders(id, order_no, quotation_id, quotations(id, organization_id, organizations(id, name, customer_code)))",
      )
      .eq("id", jobCardId)
      .maybeSingle();

    if (!jc) return [];

    const totalQty = parseInt(jc.quantity, 10) || 1;
    const sizeBreakdown = jc.size_breakdown || {};
    const orgCode = (
      jc.orders?.quotations?.organizations?.customer_code || "ORG"
    )
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const cleanOrderNo = (jc.orders?.order_no || `ORD${jc.order_id}`)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const cleanItemName = (jc.item_name || "ITEM")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5);
    const jcNoDigits =
      (jc.job_card_no || `JC${jobCardId}`).replace(/[^0-9]/g, "").slice(-4) ||
      String(jobCardId);

    const orgId = jc.orders?.quotations?.organization_id;

    // Resolve target department from size_breakdown or quotation item
    let targetDeptId = sizeBreakdown?.department_id || null;
    if (!targetDeptId && jc.item_id) {
      try {
        const { data: qItem } = await supabase
          .from("quotation_items")
          .select("size_breakdown")
          .eq("id", jc.item_id)
          .maybeSingle();
        if (qItem?.size_breakdown?.department_id) {
          targetDeptId = qItem.size_breakdown.department_id;
        }
      } catch (qErr) {
        console.warn(
          "[JobCardController] Could not resolve item department in fallback:",
          qErr.message,
        );
      }
    }

    let deptMembers = [];
    if (orgId) {
      let mQuery = supabase
        .from("registry_members")
        .select(
          "id, full_name, admission_no, gender, department_id, organization_id",
        )
        .eq("organization_id", orgId);

      if (targetDeptId) {
        mQuery = mQuery.eq("department_id", targetDeptId);
      }

      let { data: fetchedMembers } = await mQuery.order("id", {
        ascending: true,
      });

      if ((!fetchedMembers || fetchedMembers.length === 0) && targetDeptId) {
        const { data: allOrgMembers } = await supabase
          .from("registry_members")
          .select(
            "id, full_name, admission_no, gender, department_id, organization_id",
          )
          .eq("organization_id", orgId)
          .order("id", { ascending: true });
        if (allOrgMembers && allOrgMembers.length > 0) {
          fetchedMembers = allOrgMembers;
        }
      }

      if (fetchedMembers && fetchedMembers.length > 0) {
        const memberIds = fetchedMembers.map((m) => m.id);
        const { data: measList } = await supabase
          .from("measurements")
          .select(
            "id, member_id, dynamic_data, suggested_size, notes, status, recorded_at",
          )
          .in("member_id", memberIds)
          .order("recorded_at", { ascending: false });

        const measByMember = {};
        (measList || []).forEach((meas) => {
          if (!measByMember[meas.member_id]) {
            measByMember[meas.member_id] = meas;
          }
        });

        deptMembers = fetchedMembers.map((m) => ({
          ...m,
          latest_measurement: measByMember[m.id] || null,
        }));
      }
    }

    // Resolve target product details
    let targetProductId = sizeBreakdown?.product_id || null;
    let targetProductName = sizeBreakdown?.product_name || null;
    let targetProductTypeName = jc.item_name || null;

    if (targetProductId) {
      try {
        const { data: prodData } = await supabase
          .from("products")
          .select("id, name, product_types(name)")
          .eq("id", targetProductId)
          .maybeSingle();
        if (prodData) {
          targetProductName = prodData.name;
          targetProductTypeName =
            prodData.product_types?.name || targetProductTypeName;
        }
      } catch (pErr) {
        console.warn(
          "[JobCardController] Could not fetch product details:",
          pErr.message,
        );
      }
    }

    // Resolve all fabric specifications (Main Fabric, Attachment Fabric 1, Attachment Fabric 2)
    const fabricSpecObj = await resolveAllFabricsForJobCard(jc, sizeBreakdown);

    const isCustomMode =
      deptMembers.length > 0 || Boolean(sizeBreakdown?.is_custom);
    const pieces = [];

    if (isCustomMode && deptMembers.length > 0) {
      const numMembers = deptMembers.length;
      const basePiecesPerMember = Math.max(
        1,
        Math.floor(totalQty / numMembers),
      );
      const extraPieces = totalQty % numMembers;

      let seq = 1;
      deptMembers.forEach((member, mIdx) => {
        const memberQty = basePiecesPerMember + (mIdx < extraPieces ? 1 : 0);
        const admCode = (member.admission_no || `M${member.id}`)
          .replace(/[^A-Z0-9]/gi, "")
          .toUpperCase();

        // Isolate measurements strictly for this specific dress (e.g. T-Shirt only or Pants only)
        const rawDyn = member.latest_measurement?.dynamic_data || {};
        const isolatedMeas = isolateGarmentMeasurements(
          rawDyn,
          jc.item_name,
          targetProductName,
          targetProductTypeName,
        );

        let pieceSize = member.latest_measurement?.suggested_size || "Custom";
        if (
          isolatedMeas.selected_size &&
          typeof isolatedMeas.selected_size === "object"
        ) {
          const szVals = Object.values(isolatedMeas.selected_size).filter(
            Boolean,
          );
          if (szVals.length > 0) pieceSize = String(szVals[0]);
        }

        // Unified Barcode: Same barcode for all pcs of the same person in this order/job card
        const memberSeqStr = String(mIdx + 1).padStart(3, "0");
        const personBarcode = `CJC-${jcNoDigits}-${memberSeqStr}`;

        for (let pIdx = 1; pIdx <= memberQty && seq <= totalQty; pIdx++) {
          const childCardNo =
            memberQty > 1
              ? `CJC-${jc.job_card_no.replace("JC-", "")}-${memberSeqStr}-P${pIdx}`
              : `CJC-${jc.job_card_no.replace("JC-", "")}-${memberSeqStr}`;

          pieces.push({
            id: seq,
            child_card_no: childCardNo,
            job_card_id: jc.id,
            order_id: jc.order_id,
            barcode: personBarcode, // SAME barcode for all pcs of the same person
            item_type: "custom",
            size: pieceSize,
            member_id: member.id,
            member_name: member.full_name,
            admission_no: member.admission_no || `#${member.id}`,
            custom_measurements: {
              ...isolatedMeas,
              _target_dress:
                targetProductName || targetProductTypeName || "Garment",
              _pieces_for_member: memberQty,
              _piece_index: pIdx,
              _fabric: fabricSpecObj,
              _fabrics: fabricSpecObj.all,
            },
            fabric_code: fabricSpecObj.code,
            fabric_name: fabricSpecObj.name,
            fabric_length: fabricSpecObj.length,
            fabric_meters: fabricSpecObj.length,
            fabric_shade: fabricSpecObj.shade,
            attachment1_name: fabricSpecObj.attachment1?.name || null,
            attachment1_code: fabricSpecObj.attachment1?.code || null,
            attachment1_number: fabricSpecObj.attachment1?.code || null,
            attachment1_length: fabricSpecObj.attachment1?.length || null,
            attachment1_meters: fabricSpecObj.attachment1?.length || null,
            attachment1_shade: fabricSpecObj.attachment1?.shade || null,
            attachment2_name: fabricSpecObj.attachment2?.name || null,
            attachment2_code: fabricSpecObj.attachment2?.code || null,
            attachment2_number: fabricSpecObj.attachment2?.code || null,
            attachment2_length: fabricSpecObj.attachment2?.length || null,
            attachment2_meters: fabricSpecObj.attachment2?.length || null,
            attachment2_shade: fabricSpecObj.attachment2?.shade || null,
            fabrics: fabricSpecObj.all,
            sequence_no: seq,
            stage: "Cutting",
            status: "In Production",
            notes:
              memberQty > 1
                ? `Piece ${pIdx} of ${memberQty}`
                : member.latest_measurement?.notes || null,
            sub_job_cards: null,
            created_at: new Date().toISOString(),
          });
          seq++;
        }
      });

      // If total quantity exceeds department members (e.g. buffer units), fill remaining pieces as standard
      while (seq <= totalQty) {
        const seqStr = String(seq).padStart(3, "0");
        const childCardNo = `CJC-${jc.job_card_no.replace("JC-", "")}-${seqStr}`;
        const barcode = `CJC-${jcNoDigits}-${seqStr}`;
        pieces.push({
          id: seq,
          child_card_no: childCardNo,
          job_card_id: jc.id,
          order_id: jc.order_id,
          barcode,
          item_type: "standard",
          size: "M",
          member_id: null,
          member_name: null,
          admission_no: null,
          custom_measurements: {
            _fabric: fabricSpecObj,
            _fabrics: fabricSpecObj.all,
          },
          fabric_code: fabricSpecObj.code,
          fabric_name: fabricSpecObj.name,
          fabric_length: fabricSpecObj.length,
          fabric_meters: fabricSpecObj.length,
          fabric_shade: fabricSpecObj.shade,
          attachment1_name: fabricSpecObj.attachment1?.name || null,
          attachment1_code: fabricSpecObj.attachment1?.code || null,
          attachment1_number: fabricSpecObj.attachment1?.code || null,
          attachment1_length: fabricSpecObj.attachment1?.length || null,
          attachment1_meters: fabricSpecObj.attachment1?.length || null,
          attachment1_shade: fabricSpecObj.attachment1?.shade || null,
          attachment2_name: fabricSpecObj.attachment2?.name || null,
          attachment2_code: fabricSpecObj.attachment2?.code || null,
          attachment2_number: fabricSpecObj.attachment2?.code || null,
          attachment2_length: fabricSpecObj.attachment2?.length || null,
          attachment2_meters: fabricSpecObj.attachment2?.length || null,
          attachment2_shade: fabricSpecObj.attachment2?.shade || null,
          fabrics: fabricSpecObj.all,
          sequence_no: seq,
          stage: "Cutting",
          status: "In Production",
          notes: "Department Buffer Unit",
          sub_job_cards: null,
          created_at: new Date().toISOString(),
        });
        seq++;
      }
    } else {
      const sizePairs = [];
      Object.entries(sizeBreakdown).forEach(([key, val]) => {
        if (isAValidSizeKey(key)) {
          const qty = parseInt(val, 10);
          if (!isNaN(qty) && qty > 0) {
            sizePairs.push({ size: key.trim().toUpperCase(), count: qty });
          }
        }
      });

      if (sizePairs.length === 0) {
        sizePairs.push({ size: "M", count: totalQty });
      }

      let seq = 1;
      sizePairs.forEach(({ size, count }) => {
        for (let i = 0; i < count && seq <= totalQty; i++) {
          const seqStr = String(seq).padStart(3, "0");
          const childCardNo = `CJC-${jc.job_card_no.replace("JC-", "")}-${seqStr}`;
          const barcode = `CJC-${jcNoDigits}-${seqStr}`;

          pieces.push({
            id: seq,
            child_card_no: childCardNo,
            job_card_id: jc.id,
            order_id: jc.order_id,
            barcode,
            item_type: "standard",
            size,
            member_id: null,
            member_name: null,
            admission_no: null,
            custom_measurements: {
              _fabric: fabricSpecObj,
              _fabrics: fabricSpecObj.all,
            },
            fabric_code: fabricSpecObj.code,
            fabric_name: fabricSpecObj.name,
            fabric_length: fabricSpecObj.length,
            fabric_meters: fabricSpecObj.length,
            fabric_shade: fabricSpecObj.shade,
            attachment1_name: fabricSpecObj.attachment1?.name || null,
            attachment1_code: fabricSpecObj.attachment1?.code || null,
            attachment1_number: fabricSpecObj.attachment1?.code || null,
            attachment1_length: fabricSpecObj.attachment1?.length || null,
            attachment1_meters: fabricSpecObj.attachment1?.length || null,
            attachment1_shade: fabricSpecObj.attachment1?.shade || null,
            attachment2_name: fabricSpecObj.attachment2?.name || null,
            attachment2_code: fabricSpecObj.attachment2?.code || null,
            attachment2_number: fabricSpecObj.attachment2?.code || null,
            attachment2_length: fabricSpecObj.attachment2?.length || null,
            attachment2_meters: fabricSpecObj.attachment2?.length || null,
            attachment2_shade: fabricSpecObj.attachment2?.shade || null,
            fabrics: fabricSpecObj.all,
            sequence_no: seq,
            stage: "Cutting",
            status: "In Production",
            sub_job_cards: null,
            created_at: new Date().toISOString(),
          });
          seq++;
        }
      });
    }

    return pieces;
  } catch (err) {
    console.error(
      "[JobCardController] generateInMemoryPiecesForJobCard error:",
      err.message,
    );
    return [];
  }
}

// 8. Get Child Job Cards for a parent Job Card
exports.getChildJobCards = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch parent job card
    const { data: jc } = await supabase
      .from("job_cards")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const resolvedFabrics = await resolveAllFabricsForJobCard(
      jc,
      jc?.size_breakdown,
    );

    const enrichPiece = (p) => {
      const fMeta = p.custom_measurements?._fabric || {};
      const mainMeta = fMeta.main || {};

      // Authoritative Main Fabric from product/order cross-check
      const fabCode =
        resolvedFabrics.code ||
        p.fabric_code ||
        fMeta.code ||
        mainMeta.code ||
        "FAB-STD";
      const fabName =
        resolvedFabrics.name ||
        p.fabric_name ||
        fMeta.name ||
        mainMeta.name ||
        "Standard Production Fabric";
      const fabLength =
        resolvedFabrics.length ||
        p.fabric_length ||
        p.fabric_meters ||
        1.25;
      const fabShade =
        resolvedFabrics.shade ||
        p.fabric_shade ||
        fMeta.shade ||
        mainMeta.shade ||
        null;

      // Attachment 1 - ONLY if resolvedFabrics has genuine attachment1 configured
      const att1Obj = resolvedFabrics.attachment1;
      const att1Name = att1Obj ? att1Obj.name : null;
      const att1Code = att1Obj ? att1Obj.code : null;
      const att1Length = att1Obj ? att1Obj.length : null;
      const att1Shade = att1Obj ? att1Obj.shade : null;

      // Attachment 2 - ONLY if resolvedFabrics has genuine attachment2 configured
      const att2Obj = resolvedFabrics.attachment2;
      const att2Name = att2Obj ? att2Obj.name : null;
      const att2Code = att2Obj ? att2Obj.code : null;
      const att2Length = att2Obj ? att2Obj.length : null;
      const att2Shade = att2Obj ? att2Obj.shade : null;

      const allFabrics =
        Array.isArray(resolvedFabrics.all) && resolvedFabrics.all.length > 0
          ? resolvedFabrics.all
          : Array.isArray(p.fabrics) && p.fabrics.length > 0
            ? p.fabrics
            : [];

      return {
        ...p,
        fabric_code: fabCode,
        fabric_name: fabName,
        fabric_length: fabLength,
        fabric_meters: fabLength,
        fabric_shade: fabShade,
        attachment1_name: att1Name,
        attachment1_code: att1Code,
        attachment1_number: att1Code,
        attachment1_length: att1Length,
        attachment1_meters: att1Length,
        attachment1_shade: att1Shade,
        attachment2_name: att2Name,
        attachment2_code: att2Code,
        attachment2_number: att2Code,
        attachment2_length: att2Length,
        attachment2_meters: att2Length,
        attachment2_shade: att2Shade,
        fabrics: allFabrics,
      };
    };

    // Attempt querying child_job_cards table
    const { data, error } = await supabase
      .from("child_job_cards")
      .select("*, sub_job_cards(id, sub_card_no, stage, assigned_to)")
      .eq("job_card_id", id)
      .order("sequence_no", { ascending: true });

    if (error) {
      console.warn(
        "[JobCardController] child_job_cards query noticed:",
        error.message,
      );
      // Fall back on-the-fly to in-memory pieces so sticker printing never fails
      const fallbackPieces = await generateInMemoryPiecesForJobCard(id);
      return res.json(fallbackPieces.map(enrichPiece));
    }

    // If table exists but has 0 rows for this card, generate them!
    if (!data || data.length === 0) {
      if (jc) {
        const genResult = await generateChildJobCardsForJobCard(jc);
        if (genResult.pieces && genResult.pieces.length > 0) {
          return res.json(genResult.pieces.map(enrichPiece));
        }
      }
      const fallbackPieces = await generateInMemoryPiecesForJobCard(id);
      return res.json(fallbackPieces.map(enrichPiece));
    }

    // Auto-heal: If existing rows belong to foreign department members, have unisolated dress measurements, OR have legacy long barcodes, auto-clean and regenerate!
    const targetDeptId = jc?.size_breakdown?.department_id;
    let needsHeal = false;

    if (targetDeptId) {
      const memberIds = data.map((p) => p.member_id).filter(Boolean);
      if (memberIds.length > 0) {
        const { data: foreignMembers } = await supabase
          .from("registry_members")
          .select("id")
          .in("id", memberIds)
          .neq("department_id", targetDeptId);

        if (foreignMembers && foreignMembers.length > 0) {
          needsHeal = true;
        }
      }
    }

    if (
      data.some(
        (p) =>
          p.item_type === "custom" &&
          !p.custom_measurements?._target_dress &&
          !p.custom_measurements?._garment,
      )
    ) {
      needsHeal = true;
    }

    if (
      data.some(
        (p) =>
          p.barcode && (p.barcode.length > 14 || p.barcode.startsWith("BRC-")),
      )
    ) {
      needsHeal = true;
    }

    // Auto-heal: Ensure all pieces of the same member share the exact same barcode
    const memberBarcodeMap = {};
    for (const p of data) {
      if (p.member_id) {
        if (!memberBarcodeMap[p.member_id])
          memberBarcodeMap[p.member_id] = new Set();
        memberBarcodeMap[p.member_id].add(p.barcode);
      }
    }
    if (Object.values(memberBarcodeMap).some((set) => set.size > 1)) {
      needsHeal = true;
    }

    // Auto-heal: If piece count does not match parent Job Card quantity, OR contains bogus metadata sizes (e.g. BUTTON_ID)
    const expectedQty = parseInt(jc?.quantity, 10);
    if (!isNaN(expectedQty) && expectedQty > 0 && data.length !== expectedQty) {
      needsHeal = true;
    }

    if (
      data.some((p) => {
        const s = String(p.size || "")
          .toLowerCase()
          .trim();
        return (
          s.includes("button") ||
          s.includes("fabric") ||
          (s.includes("id") && s !== "custom")
        );
      })
    ) {
      needsHeal = true;
    }

    // Auto-heal: If child pieces are standard/unnamed but the order belongs to an organization with registered members
    if (
      !needsHeal &&
      data.some((p) => !p.member_name || p.item_type === "standard")
    ) {
      try {
        const { data: ord } = await supabase
          .from("orders")
          .select(
            "id, organization_id, quotation_id, quotations(organization_id)",
          )
          .eq("id", jc?.order_id)
          .maybeSingle();
        const ordOrgId =
          ord?.quotations?.organization_id ||
          ord?.organization_id ||
          jc?.organization_id;
        if (ordOrgId) {
          const { count } = await supabase
            .from("registry_members")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", ordOrgId);
          if (count && count > 0) {
            needsHeal = true;
          }
        }
      } catch (checkErr) {
        console.warn(
          "[JobCardController] Check members for auto-heal caught:",
          checkErr.message,
        );
      }
    }

    if (needsHeal) {
      try {
        await supabase.from("child_job_cards").delete().eq("job_card_id", id);
        const genResult = await generateChildJobCardsForJobCard(jc, {
          force: true,
        });
        if (genResult.pieces && genResult.pieces.length > 0) {
          return res.json(genResult.pieces.map(enrichPiece));
        }
      } catch (healErr) {
        console.warn("[JobCardController] Auto-heal noticed:", healErr.message);
      }
      const fallbackPieces = await generateInMemoryPiecesForJobCard(id);
      return res.json(fallbackPieces.map(enrichPiece));
    }

    res.json(data.map(enrichPiece));
  } catch (err) {
    console.error(
      "[JobCardController] getChildJobCards caught error:",
      err.message,
    );
    const fallbackPieces = await generateInMemoryPiecesForJobCard(
      req.params.id,
    );
    res.json(fallbackPieces);
  }
};

// 9. Force/On-demand generation of Child Job Cards for legacy Job Cards
exports.generateChildCardsEndpoint = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: jc, error: jcErr } = await supabase
      .from("job_cards")
      .select("*")
      .eq("id", id)
      .single();

    if (jcErr || !jc)
      return res.status(404).json({ error: "Job Card not found" });

    const result = await generateChildJobCardsForJobCard(jc, { force: true });

    // Check if table exists
    const { data: pieces, error: piecesErr } = await supabase
      .from("child_job_cards")
      .select("*")
      .eq("job_card_id", id)
      .order("sequence_no", { ascending: true });

    if (piecesErr || !pieces || pieces.length === 0) {
      const fallback = await generateInMemoryPiecesForJobCard(id);
      return res.json({
        success: true,
        count: fallback.length,
        pieces: fallback,
      });
    }

    res.json({ success: true, count: pieces.length, pieces });
  } catch (err) {
    const fallback = await generateInMemoryPiecesForJobCard(req.params.id);
    res.json({ success: true, count: fallback.length, pieces: fallback });
  }
};

// 10. Scan piece-level barcode
exports.scanChildBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;
    const cleanBarcode = barcode.trim().toUpperCase();

    const { data: matchedPieces, error } = await supabase
      .from("child_job_cards")
      .select(
        `
        *,
        job_cards(id, job_card_no, item_name, design_number, status, size_breakdown),
        sub_job_cards(id, sub_card_no, stage, assigned_to),
        orders(id, order_no, quotations(organization_id, organizations(name)))
      `,
      )
      .eq("barcode", cleanBarcode)
      .order("sequence_no", { ascending: true });

    let piece =
      matchedPieces && matchedPieces.length > 0 ? matchedPieces[0] : null;

    if (!piece) {
      // In-memory fallback lookup: cleanBarcode is CJC-XXXX-MMM
      const match = cleanBarcode.match(/^CJC-([0-9]+)-([0-9]+)/i);
      if (match) {
        const jcNoDigits = match[1];
        const { data: jcRows } = await supabase
          .from("job_cards")
          .select("id, job_card_no")
          .ilike("job_card_no", `%${jcNoDigits}%`)
          .limit(1);

        if (jcRows && jcRows.length > 0) {
          const fallbackPieces = await generateInMemoryPiecesForJobCard(
            jcRows[0].id,
          );
          const found = fallbackPieces.find((p) => p.barcode === cleanBarcode);
          if (found) {
            const { data: fullJc } = await supabase
              .from("job_cards")
              .select(
                "id, job_card_no, item_name, design_number, status, size_breakdown, order_id, orders(id, order_no, quotations(organization_id, organizations(name)))",
              )
              .eq("id", jcRows[0].id)
              .single();
            piece = {
              ...found,
              job_cards: fullJc,
              orders: fullJc?.orders,
            };
          }
        }
      }
    }

    if (!piece)
      return res
        .status(404)
        .json({
          error: `No garment piece found matching barcode: ${cleanBarcode}`,
        });

    const fMeta = piece.custom_measurements?._fabric || {};
    const jcSb = piece.job_cards?.size_breakdown || {};
    const resolvedFabrics = await resolveAllFabricsForJobCard(
      piece.job_cards,
      jcSb,
    );

    const fabCode =
      resolvedFabrics.code ||
      piece.fabric_code ||
      fMeta.code ||
      "FAB-STD";
    const fabName =
      resolvedFabrics.name ||
      piece.fabric_name ||
      fMeta.name ||
      "Standard Production Fabric";
    const fabLength =
      resolvedFabrics.length ||
      piece.fabric_length ||
      piece.fabric_meters ||
      1.25;
    const fabShade =
      resolvedFabrics.shade ||
      piece.fabric_shade ||
      fMeta.shade ||
      null;

    const att1Obj = resolvedFabrics.attachment1;
    const att1Name = att1Obj ? att1Obj.name : null;
    const att1Code = att1Obj ? att1Obj.code : null;
    const att1Length = att1Obj ? att1Obj.length : null;
    const att1Shade = att1Obj ? att1Obj.shade : null;

    const att2Obj = resolvedFabrics.attachment2;
    const att2Name = att2Obj ? att2Obj.name : null;
    const att2Code = att2Obj ? att2Obj.code : null;
    const att2Length = att2Obj ? att2Obj.length : null;
    const att2Shade = att2Obj ? att2Obj.shade : null;

    const allFabrics =
      Array.isArray(resolvedFabrics.all) && resolvedFabrics.all.length > 0
        ? resolvedFabrics.all
        : Array.isArray(piece.fabrics) && piece.fabrics.length > 0
          ? piece.fabrics
          : [];

    res.json({
      ...piece,
      fabric_code: fabCode,
      fabric_name: fabName,
      fabric_length: fabLength,
      fabric_meters: fabLength,
      fabric_shade: fabShade,
      attachment1_name: att1Name,
      attachment1_code: att1Code,
      attachment1_number: att1Code,
      attachment1_length: att1Length,
      attachment1_meters: att1Length,
      attachment1_shade: att1Shade,
      attachment2_name: att2Name,
      attachment2_code: att2Code,
      attachment2_number: att2Code,
      attachment2_length: att2Length,
      attachment2_meters: att2Length,
      attachment2_shade: att2Shade,
      fabrics: allFabrics,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 11. Update individual piece status / stage
exports.updateChildCardStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, stage, notes } = req.body;

    const updatePayload = { updated_at: new Date().toISOString() };
    if (status) updatePayload.status = status;
    if (stage) updatePayload.stage = stage;
    if (notes !== undefined) updatePayload.notes = notes;

    const { data, error } = await supabase
      .from("child_job_cards")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // If piece has a sub_job_card_id, check if all pieces in this batch are Ready
    if (data.sub_job_card_id) {
      try {
        const { data: siblingPieces } = await supabase
          .from("child_job_cards")
          .select("stage, status")
          .eq("sub_job_card_id", data.sub_job_card_id);

        if (siblingPieces && siblingPieces.length > 0) {
          const allBatchPiecesReady = siblingPieces.every(
            (p) => (p.stage || "").toLowerCase() === "ready",
          );
          if (allBatchPiecesReady) {
            await supabase
              .from("sub_job_cards")
              .update({ stage: "Ready", updated_at: new Date().toISOString() })
              .eq("id", data.sub_job_card_id);
          }
        }
      } catch (sibErr) {
        console.warn(
          "[JobCardController] Sibling pieces check warning:",
          sibErr.message,
        );
      }
    }

    // Auto-update parent Job Card and Order status if completed
    if (data.job_card_id) {
      await checkAndUpdateJobCardCompletion(data.job_card_id, req.user);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.generateChildJobCardsForJobCard = generateChildJobCardsForJobCard;
exports.checkAndUpdateJobCardCompletion = checkAndUpdateJobCardCompletion;
exports.checkOrderMeasurementReadiness = checkOrderMeasurementReadiness;
exports.syncJobCardsForOrder = syncJobCardsForOrder;
exports.getRequiredFabricsForJobCard = exports.getRequiredFabricsForJobCard;
