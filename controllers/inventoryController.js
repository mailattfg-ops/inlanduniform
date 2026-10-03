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
      if (!error && data && data.length > 0) {
        return res.json(data);
      }
      // Fallback to trims table for Button category
      const { data: trimButtons, error: trimError } = await supabase
        .from("trims")
        .select("*, trim_categories(name)");
      if (!trimError && trimButtons && trimButtons.length > 0) {
        const filtered = trimButtons.filter(t => 
          (t.trim_categories?.name || '').toLowerCase() === 'button' ||
          (t.name || '').toLowerCase().includes('button')
        );
        return res.json(filtered.length > 0 ? filtered : trimButtons);
      }
      res.json([]);
    } catch (err) {
      console.warn('[InventoryController] buttons.list error, returning empty list:', err.message);
      res.json([]);
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
      if (!error && data && data.length > 0) {
        return res.json(data.map(t => ({
          ...t,
          uom: t.uom || 'Cones'
        })));
      }
      // Fallback to trims table for Thread category
      const { data: trimThreads, error: trimError } = await supabase
        .from("trims")
        .select("*, trim_categories(name, default_uom)");
      if (!trimError && trimThreads && trimThreads.length > 0) {
        const filtered = trimThreads.filter(t => 
          (t.trim_categories?.name || '').toLowerCase() === 'thread' ||
          (t.name || '').toLowerCase().includes('thread')
        );
        const listToReturn = filtered.length > 0 ? filtered : trimThreads;
        return res.json(listToReturn.map(t => ({
          ...t,
          uom: t.uom || t.trim_categories?.default_uom || 'Cones'
        })));
      }
      res.json([]);
    } catch (err) {
      console.warn('[InventoryController] threads.list error, returning empty list:', err.message);
      res.json([]);
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
        console.error('❌ [DATABASE ERROR] Table "trim_categories" query failed:');
        console.error('  Code:', error.code, '| Message:', error.message);
        if (error.code === "42P01") {
          console.error('  Hint: Table public.trim_categories does not exist in database.');
          return res.status(404).json({
            error: "SCHEMA_MISSING",
            message: "trim_categories table not created yet.",
          });
        }
        return res.status(500).json({ error: error.message, code: error.code });
      }
      // Live data directly from database! If table is blank, returns []
      res.json(data || []);
    } catch (err) {
      console.error('❌ [DATABASE ERROR] trimCategories.list exception:', err.message);
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

const DEFAULT_ACCESSORY_CATEGORIES = [
  { id: 'cat-tie', name: 'Tie', code_prefix: 'TIE', is_system: true },
  { id: 'cat-belt', name: 'Belt', code_prefix: 'BLT', is_system: true },
  { id: 'cat-socks', name: 'Socks', code_prefix: 'SCK', is_system: true },
  { id: 'cat-badge', name: 'Badge / Crest', code_prefix: 'BDG', is_system: true },
  { id: 'cat-cap', name: 'Cap / Hat', code_prefix: 'CAP', is_system: true },
  { id: 'cat-lanyard', name: 'Lanyard / ID Card', code_prefix: 'LAN', is_system: true },
  { id: 'cat-scarf', name: 'Scarf / Dupatta', code_prefix: 'SCF', is_system: true },
  { id: 'cat-bottle', name: 'Water Bottle / Lunchbox', code_prefix: 'BOT', is_system: true },
  { id: 'cat-other', name: 'Other Accessory', code_prefix: 'ACC', is_system: true }
];

let inMemoryCustomAccessoryCategories = [];

exports.accessoryCategories = {
  list: async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("accessory_categories")
        .select("*")
        .order("is_system", { ascending: false })
        .order("name", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        return res.json(data);
      }

      // Return default list merged with in-memory custom categories
      return res.json([...DEFAULT_ACCESSORY_CATEGORIES, ...inMemoryCustomAccessoryCategories]);
    } catch (err) {
      console.warn("accessoryCategories.list fallback:", err.message);
      return res.json([...DEFAULT_ACCESSORY_CATEGORIES, ...inMemoryCustomAccessoryCategories]);
    }
  },
  create: async (req, res) => {
    const { name, code_prefix } = req.body;
    try {
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Accessory category name is required." });
      }
      const cleanName = name.trim();
      const cleanPrefix = (code_prefix || cleanName.substring(0, 3)).trim().toUpperCase();

      // Try database insert first
      try {
        const { data, error } = await supabase
          .from("accessory_categories")
          .insert([
            {
              name: cleanName,
              code_prefix: cleanPrefix,
              is_system: false,
            },
          ])
          .select()
          .single();

        if (!error && data) {
          return res.json(data);
        }
      } catch (dbErr) {
        // Table not present yet, fallback
      }

      const newCategory = {
        id: `cat-${Date.now()}`,
        name: cleanName,
        code_prefix: cleanPrefix,
        is_system: false,
        created_at: new Date().toISOString()
      };
      inMemoryCustomAccessoryCategories.push(newCategory);
      return res.json(newCategory);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },
  update: async (req, res) => {
    const { id } = req.params;
    const { name, code_prefix } = req.body;
    try {
      const cleanName = name?.trim();
      const cleanPrefix = code_prefix?.trim()?.toUpperCase();

      try {
        const { data, error } = await supabase
          .from("accessory_categories")
          .update({
            ...(cleanName ? { name: cleanName } : {}),
            ...(cleanPrefix ? { code_prefix: cleanPrefix } : {})
          })
          .eq("id", id)
          .select()
          .single();

        if (!error && data) {
          return res.json(data);
        }
      } catch (dbErr) {
        // Fallback
      }

      // Check in-memory custom categories
      const inMemIndex = inMemoryCustomAccessoryCategories.findIndex(c => String(c.id) === String(id));
      if (inMemIndex >= 0) {
        if (cleanName) inMemoryCustomAccessoryCategories[inMemIndex].name = cleanName;
        if (cleanPrefix) inMemoryCustomAccessoryCategories[inMemIndex].code_prefix = cleanPrefix;
        return res.json(inMemoryCustomAccessoryCategories[inMemIndex]);
      }

      // Check default categories
      const defIndex = DEFAULT_ACCESSORY_CATEGORIES.findIndex(c => String(c.id) === String(id));
      if (defIndex >= 0) {
        if (cleanName) DEFAULT_ACCESSORY_CATEGORIES[defIndex].name = cleanName;
        if (cleanPrefix) DEFAULT_ACCESSORY_CATEGORIES[defIndex].code_prefix = cleanPrefix;
        return res.json(DEFAULT_ACCESSORY_CATEGORIES[defIndex]);
      }

      return res.status(404).json({ error: "Category not found" });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },
  delete: async (req, res) => {
    const { id } = req.params;
    try {
      try {
        const { error } = await supabase
          .from("accessory_categories")
          .delete()
          .eq("id", id);

        if (!error) return res.json({ success: true });
      } catch (dbErr) {
        // Fallback
      }

      inMemoryCustomAccessoryCategories = inMemoryCustomAccessoryCategories.filter(
        c => String(c.id) !== String(id)
      );
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
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
        console.error('❌ [DATABASE ERROR] Table "trims" query failed:');
        console.error('  Code:', error.code, '| Message:', error.message);
        if (error.code === "42P01") {
          console.error('  Hint: Table public.trims does not exist in database.');
          return res.status(404).json({
            error: "SCHEMA_MISSING",
            message: "trims table not created yet.",
          });
        }
        return res.status(500).json({ error: error.message, code: error.code });
      }
      // Live data directly from database! Enrich thread UOM with 'Cones' if not specified
      const enriched = (data || []).map(t => {
        const catName = (t.category?.name || t.trim_categories?.name || '').toLowerCase();
        const isThread = catName.includes('thread') || (t.name || '').toLowerCase().includes('thread') || (t.code || '').toUpperCase().startsWith('THR-');
        const defaultUom = t.category?.default_uom || (isThread ? 'Cones' : 'Pcs');
        return {
          ...t,
          uom: (isThread && (!t.uom || t.uom.toLowerCase() === 'pcs')) ? defaultUom : (t.uom || defaultUom)
        };
      });
      res.json(enriched);
    } catch (err) {
      console.error('❌ [DATABASE ERROR] trims.list exception:', err.message);
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
      // Parallelize queries across product, stock, fabric, and trims
      const [productsRes, stockRes, fabricsRes, trimsRes] = await Promise.all([
        supabase
          .from("products")
          .select("*, product_types(id, name)")
          .order("created_at", { ascending: false }),
        supabase
          .from("product_stocks")
          .select("*"),
        supabase
          .from("fabrics")
          .select("*")
          .order("code", { ascending: true }),
        supabase
          .from("trims")
          .select("*, category:trim_categories(id, name, code_prefix, default_uom)")
          .order("code", { ascending: true }),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (stockRes.error) throw stockRes.error;
      if (fabricsRes.error) throw fabricsRes.error;

      const products = productsRes.data || [];
      const stockRecords = stockRes.data || [];
      const fabrics = fabricsRes.data || [];
      const trims = trimsRes.data || [];

      // Map products with their stock entries
      const enrichedProducts = products.map((p) => {
        const matchedStocks = stockRecords.filter(
          (s) => String(s.product_id) === String(p.id),
        );
        return {
          ...p,
          stocks: matchedStocks || [],
        };
      });

      // Filter or populate legacy threads and buttons from trims for backwards compatibility
      const threads = trims.filter((t) => {
        const catName = (t.category?.name || "").toLowerCase();
        return catName === "thread" || (t.code || "").toUpperCase().startsWith("THR-");
      });

      const buttons = trims.filter((t) => {
        const catName = (t.category?.name || "").toLowerCase();
        return catName === "button" || (t.code || "").toUpperCase().startsWith("BTN-");
      });

      res.json({
        products: enrichedProducts,
        fabrics: fabrics,
        threads: threads,
        buttons: buttons,
        trims: trims,
      });
    } catch (err) {
      console.error("❌ [INVENTORY ERROR] stocks.list failed:", err.message);
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

      // Case 2 & 3: Trims / Buttons / Threads Stock/Threshold Adjustment
      const { trim_id } = req.body;
      const effectiveTrimId = trim_id || button_id || thread_id;
      if (effectiveTrimId) {
        const { data: trim, error: fetchErr } = await supabase
          .from("trims")
          .select("*")
          .eq("id", effectiveTrimId)
          .maybeSingle();

        if (trim) {
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
            .eq("id", effectiveTrimId)
            .select(
              "*, category:trim_categories(id, name, code_prefix, default_uom)",
            )
            .single();

          if (updateErr) throw updateErr;

          return res.json(updatedTrim);
        }

        return res.status(404).json({ error: "Trim, button, or thread item not found." });
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

      // Fetch items with fabric and trim metadata
      const { data: rawItems, error: itemsErr } = await supabase
        .from("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", id);

      if (itemsErr) throw itemsErr;

      // Populate fabric and trim references safely
      const fabricIds = (rawItems || []).map(i => i.fabric_id).filter(Boolean);
      const trimIds = (rawItems || []).map(i => i.trim_id).filter(Boolean);

      const fabricsMap = new Map();
      if (fabricIds.length > 0) {
        const { data: fabData } = await supabase
          .from("fabrics")
          .select("id, name, code, brand_name, shade, width, unit_price")
          .in("id", fabricIds);
        (fabData || []).forEach(f => fabricsMap.set(String(f.id), f));
      }

      const trimsMap = new Map();
      if (trimIds.length > 0) {
        const { data: trimData } = await supabase
          .from("trims")
          .select("id, name, code, uom, unit_price")
          .in("id", trimIds);
        (trimData || []).forEach(t => trimsMap.set(String(t.id), t));

        // Fallback to buttons and threads tables for legacy or specialized items
        const missingTrimIds = trimIds.filter(id => !trimsMap.has(String(id)));
        if (missingTrimIds.length > 0) {
          try {
            const { data: btnData } = await supabase
              .from("buttons")
              .select("id, name, code, unit_price")
              .in("id", missingTrimIds);
            (btnData || []).forEach(b => trimsMap.set(String(b.id), { ...b, uom: 'pcs' }));
          } catch (e) {}

          const stillMissing = missingTrimIds.filter(id => !trimsMap.has(String(id)));
          if (stillMissing.length > 0) {
            try {
              const { data: thrdData } = await supabase
                .from("threads")
                .select("id, name, code, unit_price, uom")
                .in("id", stillMissing);
              (thrdData || []).forEach(th => trimsMap.set(String(th.id), { ...th, uom: th.uom || 'cones' }));
            } catch (e) {}
          }
        }
      }

      const populatedItems = (rawItems || []).map(item => ({
        ...item,
        fabrics: item.fabric_id ? fabricsMap.get(String(item.fabric_id)) : null,
        trims: item.trim_id ? trimsMap.get(String(item.trim_id)) : null
      }));

      res.json({
        ...po,
        items: populatedItems,
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

      // If PO is received, credit raw fabric and trim quantities and close items
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

          // Add physical stock quantity for Fabrics
          if (item.fabric_id) {
            const { data: fabric } = await supabase
              .from("fabrics")
              .select("quantity")
              .eq("id", item.fabric_id)
              .maybeSingle();

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

          // Add physical stock quantity for Trims
          if (item.trim_id) {
            const { data: trim } = await supabase
              .from("trims")
              .select("quantity")
              .eq("id", item.trim_id)
              .maybeSingle();

            if (trim) {
              const newQty =
                parseFloat(trim.quantity || 0) + parseFloat(item.quantity || 0);
              await supabase
                .from("trims")
                .update({
                  quantity: newQty,
                })
                .eq("id", item.trim_id);
            }
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
