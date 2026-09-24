const supabase = require("../config/supabase");

const createInventoryHandler = (tableName) => {
  return {
    list: async (req, res) => {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select("*")
          .order("code", { ascending: true });
        if (error) throw error;
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },
    create: async (req, res) => {
      const { code, name } = req.body;
      try {
        const { data, error } = await supabase
          .from(tableName)
          .insert([{ code, name }])
          .select()
          .single();
        if (error) throw error;
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },
    update: async (req, res) => {
      const { id } = req.params;
      const { code, name } = req.body;
      try {
        const { data, error } = await supabase
          .from(tableName)
          .update({ code, name })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },
    delete: async (req, res) => {
      const { id } = req.params;
      try {
        const { error } = await supabase.from(tableName).delete().eq("id", id);
        if (error) throw error;
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },
  };
};

// Helper to generate the next fabric code (FAB-0001, FAB-0002, etc.)
async function generateNextFabricCodeLocal() {
  try {
    const { data, error } = await supabase
      .from("fabrics")
      .select("code")
      .not("code", "is", null);

    if (error) {
      console.error("Error fetching fabrics codes:", error.message);
      return "FAB-0001";
    }

    let maxNum = 0;
    if (data && data.length > 0) {
      data.forEach((item) => {
        const c = item.code;
        if (c && c.startsWith("FAB-")) {
          const numPart = c.substring(4);
          const num = parseInt(numPart, 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
    }

    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(4, "0");
    return `FAB-${padded}`;
  } catch (err) {
    console.error("Exception in generateNextFabricCodeLocal:", err.message);
    return "FAB-0001";
  }
}

// Fabrics get a dedicated handler with extra fields (brand_name, quantity, shade, width, latest_sam, vendors, images)
exports.fabrics = {
  list: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("fabrics")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  create: async (req, res) => {
    const {
      code,
      name,
      brand_name,
      quantity,
      shade,
      width,
      description,
      brand_type,
      quality,
      image,
      images,
      latest_sam,
      vendors,
      garment_category,
    } = req.body;
    try {
      let finalCode = code;
      if (!finalCode || finalCode.trim() === "") {
        finalCode = await generateNextFabricCodeLocal();
      }

      const { data, error } = await supabase
        .from("fabrics")
        .insert([
          {
            code: finalCode,
            name,
            brand_name: brand_name || null,
            quantity: quantity || 0,
            shade: shade || null,
            width: width || null,
            description: description || null,
            brand_type: brand_type || null,
            quality: quality || null,
            image: image || null,
            images: images || [],
            latest_sam:
              latest_sam !== undefined &&
              latest_sam !== null &&
              latest_sam !== ""
                ? parseFloat(latest_sam)
                : 0,
            vendors: vendors || [],
            garment_category: garment_category || null,
          },
        ])
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  update: async (req, res) => {
    const { id } = req.params;
    const {
      code,
      name,
      brand_name,
      quantity,
      shade,
      width,
      description,
      brand_type,
      quality,
      image,
      images,
      latest_sam,
      vendors,
      garment_category,
    } = req.body;
    try {
      const { data, error } = await supabase
        .from("fabrics")
        .update({
          code,
          name,
          brand_name: brand_name || null,
          quantity: quantity || 0,
          shade: shade || null,
          width: width || null,
          description: description || null,
          brand_type: brand_type || null,
          quality: quality || null,
          image: image || null,
          images: images || [],
          latest_sam:
            latest_sam !== undefined && latest_sam !== null && latest_sam !== ""
              ? parseFloat(latest_sam)
              : 0,
          vendors: vendors || [],
          garment_category: garment_category || null,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  delete: async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase.from("fabrics").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};
// Helper to generate the next button code (BTN-0001, BTN-0002, etc.)
async function generateNextButtonCodeLocal() {
  try {
    const { data, error } = await supabase
      .from("buttons")
      .select("code")
      .not("code", "is", null);

    if (error) {
      console.error("Error fetching buttons codes:", error.message);
      return "BTN-0001";
    }

    let maxNum = 0;
    if (data && data.length > 0) {
      data.forEach((item) => {
        const c = item.code;
        if (c && c.startsWith("BTN-")) {
          const numPart = c.substring(4);
          const num = parseInt(numPart, 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
    }

    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(4, "0");
    return `BTN-${padded}`;
  } catch (err) {
    console.error("Exception in generateNextButtonCodeLocal:", err.message);
    return "BTN-0001";
  }
}

exports.buttons = {
  list: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("buttons")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  create: async (req, res) => {
    const {
      code,
      name,
      description,
      unit_price,
      quantity,
      low_stock_threshold,
      images,
      vendors,
    } = req.body;
    try {
      let finalCode = code;
      if (!finalCode || finalCode.trim() === "") {
        finalCode = await generateNextButtonCodeLocal();
      }

      const { data, error } = await supabase
        .from("buttons")
        .insert([
          {
            code: finalCode,
            name,
            description: description || null,
            unit_price:
              unit_price !== undefined &&
              unit_price !== "" &&
              unit_price !== null
                ? parseFloat(unit_price)
                : null,
            quantity:
              quantity !== undefined && quantity !== "" && quantity !== null
                ? parseFloat(quantity)
                : 0,
            low_stock_threshold:
              low_stock_threshold !== undefined &&
              low_stock_threshold !== "" &&
              low_stock_threshold !== null
                ? parseFloat(low_stock_threshold)
                : 10,
            images: images || [],
            vendors: vendors || [],
          },
        ])
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  update: async (req, res) => {
    const { id } = req.params;
    const {
      code,
      name,
      description,
      unit_price,
      quantity,
      low_stock_threshold,
      images,
      vendors,
    } = req.body;
    try {
      const { data, error } = await supabase
        .from("buttons")
        .update({
          code,
          name,
          description: description || null,
          unit_price:
            unit_price !== undefined && unit_price !== "" && unit_price !== null
              ? parseFloat(unit_price)
              : null,
          quantity:
            quantity !== undefined && quantity !== "" && quantity !== null
              ? parseFloat(quantity)
              : 0,
          low_stock_threshold:
            low_stock_threshold !== undefined &&
            low_stock_threshold !== "" &&
            low_stock_threshold !== null
              ? parseFloat(low_stock_threshold)
              : 10,
          images: images || [],
          vendors: vendors || [],
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  delete: async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase.from("buttons").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

// Helper to generate the next thread code (THR-0001, THR-0002, etc.)
async function generateNextThreadCodeLocal() {
  try {
    const { data, error } = await supabase
      .from("threads")
      .select("code")
      .not("code", "is", null);

    if (error) {
      console.error("Error fetching threads codes:", error.message);
      return "THR-0001";
    }

    let maxNum = 0;
    if (data && data.length > 0) {
      data.forEach((item) => {
        const c = item.code;
        if (c && c.startsWith("THR-")) {
          const numPart = c.substring(4);
          const num = parseInt(numPart, 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
    }

    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(4, "0");
    return `THR-${padded}`;
  } catch (err) {
    console.error("Exception in generateNextThreadCodeLocal:", err.message);
    return "THR-0001";
  }
}

exports.threads = {
  list: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("threads")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  create: async (req, res) => {
    const {
      code,
      name,
      type,
      description,
      unit_price,
      quantity,
      low_stock_threshold,
      images,
      vendors,
    } = req.body;
    try {
      let finalCode = code;
      if (!finalCode || finalCode.trim() === "") {
        finalCode = await generateNextThreadCodeLocal();
      }

      const { data, error } = await supabase
        .from("threads")
        .insert([
          {
            code: finalCode,
            name,
            type: type || null,
            description: description || null,
            unit_price:
              unit_price !== undefined &&
              unit_price !== "" &&
              unit_price !== null
                ? parseFloat(unit_price)
                : null,
            quantity:
              quantity !== undefined && quantity !== "" && quantity !== null
                ? parseFloat(quantity)
                : 0,
            low_stock_threshold:
              low_stock_threshold !== undefined &&
              low_stock_threshold !== "" &&
              low_stock_threshold !== null
                ? parseFloat(low_stock_threshold)
                : 10,
            images: images || [],
            vendors: vendors || [],
          },
        ])
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  update: async (req, res) => {
    const { id } = req.params;
    const {
      code,
      name,
      type,
      description,
      unit_price,
      quantity,
      low_stock_threshold,
      images,
      vendors,
    } = req.body;
    try {
      const { data, error } = await supabase
        .from("threads")
        .update({
          code,
          name,
          type: type || null,
          description: description || null,
          unit_price:
            unit_price !== undefined && unit_price !== "" && unit_price !== null
              ? parseFloat(unit_price)
              : null,
          quantity:
            quantity !== undefined && quantity !== "" && quantity !== null
              ? parseFloat(quantity)
              : 0,
          low_stock_threshold:
            low_stock_threshold !== undefined &&
            low_stock_threshold !== "" &&
            low_stock_threshold !== null
              ? parseFloat(low_stock_threshold)
              : 10,
          images: images || [],
          vendors: vendors || [],
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  delete: async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase.from("threads").delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};
// Helper to generate the next trim code (e.g. ZIP-0001, ELA-0002, etc.)
async function generateNextTrimCodeLocal(prefix = "TRM") {
  try {
    const cleanPrefix = (prefix || "TRM").trim().toUpperCase();
    const { data, error } = await supabase
      .from("trims")
      .select("code")
      .ilike("code", `${cleanPrefix}-%`);

    if (error) {
      console.error("Error fetching trims codes:", error.message);
      return `${cleanPrefix}-0001`;
    }

    let maxNum = 0;
    if (data && data.length > 0) {
      data.forEach((item) => {
        const c = item.code;
        if (c && c.toUpperCase().startsWith(`${cleanPrefix}-`)) {
          const numPart = c.substring(cleanPrefix.length + 1);
          const num = parseInt(numPart, 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
    }

    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(4, "0");
    return `${cleanPrefix}-${padded}`;
  } catch (err) {
    console.error("Exception in generateNextTrimCodeLocal:", err.message);
    return `${(prefix || "TRM").trim().toUpperCase()}-0001`;
  }
}

exports.trimCategories = {
  list: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("trim_categories")
        .select("*")
        .order("is_system", { ascending: false })
        .order("name", { ascending: true });

      if (error) {
        if (error.code === "42P01") {
          return res.json({
            error: "SCHEMA_MISSING",
            message: "trim_categories table not created yet.",
          });
        }
        throw error;
      }
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  create: async (req, res) => {
    const { name, code_prefix, default_uom } = req.body;
    try {
      if (!name || !name.trim()) {
        return res
          .status(400)
          .json({ error: "Trim category name is required." });
      }
      const cleanName = name.trim();
      const cleanPrefix = (code_prefix || cleanName.substring(0, 3))
        .trim()
        .toUpperCase();
      const cleanUom = (default_uom || "Pcs").trim();

      const { data, error } = await supabase
        .from("trim_categories")
        .insert([
          {
            name: cleanName,
            code_prefix: cleanPrefix,
            default_uom: cleanUom,
            is_system: false,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  update: async (req, res) => {
    const { id } = req.params;
    const { name, code_prefix, default_uom } = req.body;
    try {
      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (code_prefix !== undefined)
        updates.code_prefix = code_prefix.trim().toUpperCase();
      if (default_uom !== undefined) updates.default_uom = default_uom.trim();

      const { data, error } = await supabase
        .from("trim_categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  delete: async (req, res) => {
    const { id } = req.params;
    try {
      const { data: cat } = await supabase
        .from("trim_categories")
        .select("is_system, name")
        .eq("id", id)
        .single();

      if (cat && cat.is_system) {
        return res
          .status(400)
          .json({
            error: `Cannot delete default system category "${cat.name}".`,
          });
      }

      const { count } = await supabase
        .from("trims")
        .select("*", { count: "exact", head: true })
        .eq("category_id", id);

      if (count && count > 0) {
        return res
          .status(400)
          .json({
            error: `Cannot delete category because it contains ${count} trim item(s).`,
          });
      }

      const { error } = await supabase
        .from("trim_categories")
        .delete()
        .eq("id", id);

      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

exports.trims = {
  list: async (req, res) => {
    try {
      const { category_id } = req.query;
      let query = supabase
        .from("trims")
        .select(
          "*, category:trim_categories(id, name, code_prefix, default_uom)",
        )
        .order("code", { ascending: true });

      if (category_id) {
        query = query.eq("category_id", category_id);
      }

      const { data, error } = await query;
      if (error) {
        if (error.code === "42P01") {
          return res.json({
            error: "SCHEMA_MISSING",
            message: "trims table not created yet.",
          });
        }
        throw error;
      }
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  create: async (req, res) => {
    const {
      category_id,
      code,
      name,
      type,
      uom,
      description,
      unit_price,
      quantity,
      low_stock_threshold,
      images,
      vendors,
    } = req.body;
    try {
      if (!category_id) {
        return res.status(400).json({ error: "Trim category is required." });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Trim name is required." });
      }

      const { data: category } = await supabase
        .from("trim_categories")
        .select("*")
        .eq("id", category_id)
        .single();

      let finalCode = code;
      if (!finalCode || finalCode.trim() === "") {
        const prefix = category?.code_prefix || "TRM";
        finalCode = await generateNextTrimCodeLocal(prefix);
      }

      const finalUom = uom || category?.default_uom || "Pcs";

      const { data, error } = await supabase
        .from("trims")
        .insert([
          {
            category_id,
            code: finalCode.trim(),
            name: name.trim(),
            type: type ? type.trim() : null,
            uom: finalUom,
            description: description ? description.trim() : null,
            unit_price:
              unit_price !== undefined &&
              unit_price !== "" &&
              unit_price !== null
                ? parseFloat(unit_price)
                : 0,
            quantity:
              quantity !== undefined && quantity !== "" && quantity !== null
                ? parseFloat(quantity)
                : 0,
            low_stock_threshold:
              low_stock_threshold !== undefined &&
              low_stock_threshold !== "" &&
              low_stock_threshold !== null
                ? parseFloat(low_stock_threshold)
                : 10,
            images: images || [],
            vendors: vendors || [],
          },
        ])
        .select(
          "*, category:trim_categories(id, name, code_prefix, default_uom)",
        )
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  update: async (req, res) => {
    const { id } = req.params;
    const {
      category_id,
      code,
      name,
      type,
      uom,
      description,
      unit_price,
      quantity,
      low_stock_threshold,
      images,
      vendors,
    } = req.body;
    try {
      const updates = {
        updated_at: new Date(),
      };
      if (category_id !== undefined) updates.category_id = category_id;
      if (code !== undefined) updates.code = code.trim();
      if (name !== undefined) updates.name = name.trim();
      if (type !== undefined) updates.type = type ? type.trim() : null;
      if (uom !== undefined) updates.uom = uom;
      if (description !== undefined)
        updates.description = description ? description.trim() : null;
      if (unit_price !== undefined && unit_price !== "" && unit_price !== null)
        updates.unit_price = parseFloat(unit_price);
      if (quantity !== undefined && quantity !== "" && quantity !== null)
        updates.quantity = parseFloat(quantity);
      if (
        low_stock_threshold !== undefined &&
        low_stock_threshold !== "" &&
        low_stock_threshold !== null
      )
        updates.low_stock_threshold = parseFloat(low_stock_threshold);
      if (images !== undefined) updates.images = images || [];
      if (vendors !== undefined) updates.vendors = vendors || [];

      const { data, error } = await supabase
        .from("trims")
        .update(updates)
        .eq("id", id)
        .select(
          "*, category:trim_categories(id, name, code_prefix, default_uom)",
        )
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  delete: async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase.from("trims").delete().eq("id", id);

      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

// Stocks Controller
exports.stocks = {
  list: async (req, res) => {
    try {
      // 1. Fetch all products with product types
      const { data: products, error: prodError } = await supabase
        .from("products")
        .select("*, product_types(id, name)")
        .order("created_at", { ascending: false });

      if (prodError) throw prodError;

      // 2. Fetch all size-based stock records
      const { data: stockRecords, error: stockError } = await supabase
        .from("product_stocks")
        .select("*");

      if (stockError) throw stockError;

      // Map products with their stock entries
      const enrichedProducts = (products || []).map((p) => {
        const matchedStocks = (stockRecords || []).filter(
          (s) => String(s.product_id) === String(p.id),
        );
        return {
          ...p,
          stocks: matchedStocks || [],
        };
      });

      // 3. Fetch raw fabrics list
      const { data: fabrics, error: fabError } = await supabase
        .from("fabrics")
        .select("*")
        .order("code", { ascending: true });

      if (fabError) throw fabError;

      // 4. Fetch threads list
      const { data: threads, error: threadError } = await supabase
        .from("threads")
        .select("*")
        .order("code", { ascending: true });

      if (threadError) throw threadError;

      // 5. Fetch buttons list
      const { data: buttons, error: buttonError } = await supabase
        .from("buttons")
        .select("*")
        .order("code", { ascending: true });

      if (buttonError) throw buttonError;

      // 6. Fetch dynamic trims list with categories
      let trims = [];
      try {
        const { data: trimsData, error: trimError } = await supabase
          .from("trims")
          .select(
            "*, category:trim_categories(id, name, code_prefix, default_uom)",
          )
          .order("code", { ascending: true });
        if (!trimError && trimsData) {
          trims = trimsData;
        }
      } catch (trimEx) {
        // Table might not exist yet if migration pending
      }

      res.json({
        products: enrichedProducts,
        fabrics: fabrics || [],
        threads: threads || [],
        buttons: buttons || [],
        trims: trims || [],
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  adjust: async (req, res) => {
    const {
      product_id,
      size,
      fabric_id,
      thread_id,
      button_id,
      quantity_delta,
      low_stock_threshold,
    } = req.body;
    try {
      const {
        ensureStockRecord,
        checkAndTriggerFabricAutoPO,
      } = require("../services/inventoryService");

      // Case 1: Fabric Stock/Threshold Adjustment
      if (fabric_id) {
        const { data: fabric, error: fetchErr } = await supabase
          .from("fabrics")
          .select("*")
          .eq("id", fabric_id)
          .single();

        if (fetchErr || !fabric) {
          return res.status(404).json({ error: "Fabric record not found." });
        }

        const updates = {
          created_at: fabric.created_at,
        };

        if (quantity_delta !== undefined) {
          updates.quantity = Math.max(
            0.0,
            parseFloat(fabric.quantity || 0) + parseFloat(quantity_delta),
          );
        }

        if (low_stock_threshold !== undefined) {
          updates.low_stock_threshold = Math.max(
            0.0,
            parseFloat(low_stock_threshold),
          );
        }

        const { data: updatedFabric, error: updateErr } = await supabase
          .from("fabrics")
          .update(updates)
          .eq("id", fabric_id)
          .select()
          .single();

        if (updateErr) throw updateErr;

        // Check fabric threshold and trigger auto-PO if needed
        await checkAndTriggerFabricAutoPO(fabric_id);

        return res.json(updatedFabric);
      }

      // Case 2: Thread Stock/Threshold Adjustment
      if (thread_id) {
        const { data: thread, error: fetchErr } = await supabase
          .from("threads")
          .select("*")
          .eq("id", thread_id)
          .single();

        if (fetchErr || !thread) {
          return res.status(404).json({ error: "Thread record not found." });
        }

        const updates = {};

        if (quantity_delta !== undefined) {
          updates.quantity = Math.max(
            0.0,
            parseFloat(thread.quantity || 0) + parseFloat(quantity_delta),
          );
        }

        if (low_stock_threshold !== undefined) {
          updates.low_stock_threshold = Math.max(
            0.0,
            parseFloat(low_stock_threshold),
          );
        }

        const { data: updatedThread, error: updateErr } = await supabase
          .from("threads")
          .update(updates)
          .eq("id", thread_id)
          .select()
          .single();

        if (updateErr) throw updateErr;

        return res.json(updatedThread);
      }

      // Case 3: Button Stock/Threshold Adjustment
      if (button_id) {
        const { data: button, error: fetchErr } = await supabase
          .from("buttons")
          .select("*")
          .eq("id", button_id)
          .single();

        if (fetchErr || !button) {
          return res.status(404).json({ error: "Button record not found." });
        }

        const updates = {};

        if (quantity_delta !== undefined) {
          updates.quantity = Math.max(
            0.0,
            parseFloat(button.quantity || 0) + parseFloat(quantity_delta),
          );
        }

        if (low_stock_threshold !== undefined) {
          updates.low_stock_threshold = Math.max(
            0.0,
            parseFloat(low_stock_threshold),
          );
        }

        const { data: updatedButton, error: updateErr } = await supabase
          .from("buttons")
          .update(updates)
          .eq("id", button_id)
          .select()
          .single();

        if (updateErr) throw updateErr;

        return res.json(updatedButton);
      }

      // Case 3b: Dynamic Trims Stock/Threshold Adjustment
      const { trim_id } = req.body;
      if (trim_id) {
        const { data: trim, error: fetchErr } = await supabase
          .from("trims")
          .select("*")
          .eq("id", trim_id)
          .single();

        if (fetchErr || !trim) {
          return res.status(404).json({ error: "Trim record not found." });
        }

        const updates = {
          updated_at: new Date(),
        };

        if (quantity_delta !== undefined) {
          updates.quantity = Math.max(
            0.0,
            parseFloat(trim.quantity || 0) + parseFloat(quantity_delta),
          );
        }

        if (low_stock_threshold !== undefined) {
          updates.low_stock_threshold = Math.max(
            0.0,
            parseFloat(low_stock_threshold),
          );
        }

        const { data: updatedTrim, error: updateErr } = await supabase
          .from("trims")
          .update(updates)
          .eq("id", trim_id)
          .select(
            "*, category:trim_categories(id, name, code_prefix, default_uom)",
          )
          .single();

        if (updateErr) throw updateErr;

        return res.json(updatedTrim);
      }

      // Case 4: Product Sizing Stock/Threshold Adjustment
      if (product_id && size) {
        const stock = await ensureStockRecord(product_id, size);
        if (!stock) {
          return res
            .status(404)
            .json({
              error: "Product stock record could not be created or found.",
            });
        }

        const updates = {
          updated_at: new Date(),
        };

        if (quantity_delta !== undefined) {
          updates.quantity = Math.max(
            0,
            (stock.quantity || 0) + parseInt(quantity_delta),
          );
        }

        if (low_stock_threshold !== undefined) {
          updates.low_stock_threshold = Math.max(
            0,
            parseInt(low_stock_threshold),
          );
        }

        const { data: updatedStock, error: updateErr } = await supabase
          .from("product_stocks")
          .update(updates)
          .eq("id", stock.id)
          .select()
          .single();

        if (updateErr) throw updateErr;

        return res.json(updatedStock);
      }

      return res
        .status(400)
        .json({
          error:
            "Either fabric_id, thread_id, button_id, OR product_id and size must be provided.",
        });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

// Purchase Orders Controller
exports.purchaseOrders = {
  list: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  getDetails: async (req, res) => {
    const { id } = req.params;
    try {
      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("id", id)
        .single();

      if (poErr) throw poErr;
      if (!po)
        return res.status(404).json({ error: "Purchase order not found" });

      // Fetch items with fabric metadata
      const { data: items, error: itemsErr } = await supabase
        .from("purchase_order_items")
        .select("*, fabrics(id, name, code, brand_name, shade, width)")
        .eq("purchase_order_id", id);

      if (itemsErr) throw itemsErr;

      res.json({
        ...po,
        items: items || [],
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  create: async (req, res) => {
    const { supplier_name, notes, items } = req.body;
    try {
      const poNumber = `PO-MAN-${Date.now().toString().slice(-6)}`;

      // Insert PO Header
      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert([
          {
            po_number: poNumber,
            status: "Draft",
            supplier_name: supplier_name || "Default Supplier",
            notes: notes || "",
            is_auto_triggered: false,
          },
        ])
        .select()
        .single();

      if (poErr) throw poErr;

      // Insert PO Items
      if (items && items.length > 0) {
        const itemsToInsert = items.map((item) => ({
          purchase_order_id: po.id,
          fabric_id: item.fabric_id,
          quantity: parseFloat(item.quantity || 0),
          status: "Pending",
        }));

        const { error: itemsErr } = await supabase
          .from("purchase_order_items")
          .insert(itemsToInsert);

        if (itemsErr) {
          await supabase.from("purchase_orders").delete().eq("id", po.id);
          throw itemsErr;
        }
      }

      res.json({ success: true, purchaseOrderId: po.id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  updateStatus: async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
      // Fetch current PO
      const { data: po, error: fetchErr } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr || !po)
        return res.status(404).json({ error: "Purchase order not found" });

      const updates = {
        status,
        updated_at: new Date(),
      };

      const { data: updatedPO, error: updateErr } = await supabase
        .from("purchase_orders")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // If PO is received, credit raw fabric quantities and close items
      if (status === "Received" && po.status !== "Received") {
        const { data: items } = await supabase
          .from("purchase_order_items")
          .select("*")
          .eq("purchase_order_id", id);

        for (const item of items || []) {
          // Close item
          await supabase
            .from("purchase_order_items")
            .update({ status: "Received", updated_at: new Date() })
            .eq("id", item.id);

          // Add physical stock quantity
          const { data: fabric } = await supabase
            .from("fabrics")
            .select("quantity")
            .eq("id", item.fabric_id)
            .single();

          if (fabric) {
            const newQty =
              parseFloat(fabric.quantity || 0) + parseFloat(item.quantity || 0);
            await supabase
              .from("fabrics")
              .update({
                quantity: newQty,
              })
              .eq("id", item.fabric_id);
          }
        }
      }

      res.json(updatedPO);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

// PRD M7.6 & M12.5: Barcode & Item Code Real-Time Lookup for Counter Sales & Invoicing
exports.lookupItem = async (req, res) => {
  try {
    const { code, branch_id } = req.query;
    if (!code) {
      return res
        .status(400)
        .json({ error: "Barcode or item code query parameter is required." });
    }

    const cleanCode = code.trim();

    // 1. Search in branch_inventory first (check item_code or item_name)
    let branchQuery = supabase
      .from("branch_inventory")
      .select("*")
      .or(`item_code.ilike.%${cleanCode}%,item_name.ilike.%${cleanCode}%`);

    if (branch_id) {
      branchQuery = branchQuery.eq("branch_id", branch_id);
    }

    const { data: branchItems } = await branchQuery.limit(1);
    if (branchItems && branchItems.length > 0) {
      const bItem = branchItems[0];
      return res.json({
        found: true,
        source: "branch_inventory",
        item_description: bItem.item_name,
        design_number: bItem.item_code || cleanCode,
        barcode: bItem.item_code || cleanCode,
        available_stock: parseFloat(bItem.quantity || 0),
        unit: bItem.unit || "units",
        unit_price: 850, // Default ready-made apparel counter price
        tax_rate: 5,
      });
    }

    // 2. Search in products catalog by design_number or name
    const { data: products } = await supabase
      .from("products")
      .select("id, name, design_number")
      .or(`design_number.ilike.%${cleanCode}%,name.ilike.%${cleanCode}%`)
      .limit(1);

    if (products && products.length > 0) {
      const prod = products[0];
      return res.json({
        found: true,
        source: "products_catalog",
        item_description: prod.name,
        design_number: prod.design_number || cleanCode,
        barcode: cleanCode,
        available_stock: 50,
        unit: "units",
        unit_price: 950,
        tax_rate: 5,
      });
    }

    // 3. Search in design_numbers table
    const { data: dns } = await supabase
      .from("design_numbers")
      .select("id, design_number, garment_category")
      .ilike("design_number", `%${cleanCode}%`)
      .limit(1);

    if (dns && dns.length > 0) {
      const dn = dns[0];
      return res.json({
        found: true,
        source: "design_numbers",
        item_description: `${dn.garment_category || "Apparel"} (${dn.design_number})`,
        design_number: dn.design_number,
        barcode: cleanCode,
        available_stock: 25,
        unit: "units",
        unit_price: 850,
        tax_rate: 5,
      });
    }

    // Not found in database — return fallback format for custom entry
    return res.json({
      found: false,
      item_description: `Scanned Item (${cleanCode})`,
      design_number: cleanCode,
      barcode: cleanCode,
      available_stock: 0,
      unit_price: 500,
      tax_rate: 5,
    });
  } catch (err) {
    console.error("[InventoryController] lookupItem error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
