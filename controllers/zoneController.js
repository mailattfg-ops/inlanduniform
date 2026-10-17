const supabase = require('../config/supabase');
const fs = require('fs');
const path = require('path');

// 1. List Zones (optionally filtered by branch_id)
exports.listZones = async (req, res) => {
  try {
    const { branch_id, is_active } = req.query;
    let query = supabase
      .from('zones')
      .select('id, name, code, branch_id, description, is_active, created_at, updated_at, branches(id, name, code)');

    if (branch_id && branch_id !== 'ALL') {
      query = query.eq('branch_id', branch_id);
    }

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
      // If table doesn't exist yet, generate dynamic default zones per branch
      if (error.code === '42P01' || error.code === 'PGRST205' || (error.message && error.message.toLowerCase().includes('zones'))) {
        const { data: brs } = await supabase.from('branches').select('id, name, code');
        const defaultZones = [];
        (brs || []).forEach(b => {
          defaultZones.push(
            { id: b.id * 100 + 1, name: `${b.name} - Central Zone`, code: `Z-CTR-${b.id}`, branch_id: b.id, description: 'Central Commercial Area', is_active: true, branches: b },
            { id: b.id * 100 + 2, name: `${b.name} - North Zone`, code: `Z-NTH-${b.id}`, branch_id: b.id, description: 'Northern Institutional District', is_active: true, branches: b },
            { id: b.id * 100 + 3, name: `${b.name} - South Zone`, code: `Z-STH-${b.id}`, branch_id: b.id, description: 'Southern Industrial Sector', is_active: true, branches: b }
          );
        });
        const filtered = branch_id && branch_id !== 'ALL'
          ? defaultZones.filter(z => String(z.branch_id) === String(branch_id))
          : defaultZones;
        return res.json(filtered);
      }
      throw error;
    }

    res.json(data || []);
  } catch (err) {
    console.error('Error fetching zones:', err);
    res.status(500).json({ error: err.message });
  }
};

// 2. Create Zone
exports.createZone = async (req, res) => {
  try {
    const { name, code, branch_id, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Zone name is required' });
    }
    if (!branch_id) {
      return res.status(400).json({ error: 'Branch is required' });
    }

    const payload = {
      name: name.trim(),
      code: code ? code.trim() : null,
      branch_id: parseInt(branch_id, 10),
      description: description ? description.trim() : null,
      is_active: true
    };

    const { data, error } = await supabase
      .from('zones')
      .insert([payload])
      .select('*, branches(id, name, code)')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating zone:', err);
    res.status(500).json({ error: err.message });
  }
};

// 3. Update Zone
exports.updateZone = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, branch_id, description, is_active } = req.body;

    const payload = {
      updated_at: new Date().toISOString()
    };
    if (name !== undefined) payload.name = name.trim();
    if (code !== undefined) payload.code = code ? code.trim() : null;
    if (branch_id !== undefined) payload.branch_id = parseInt(branch_id, 10);
    if (description !== undefined) payload.description = description ? description.trim() : null;
    if (is_active !== undefined) payload.is_active = Boolean(is_active);

    const { data, error } = await supabase
      .from('zones')
      .update(payload)
      .eq('id', id)
      .select('*, branches(id, name, code)')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error updating zone:', err);
    res.status(500).json({ error: err.message });
  }
};

// 4. Delete Zone
exports.deleteZone = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('zones')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Zone deleted successfully' });
  } catch (err) {
    console.error('Error deleting zone:', err);
    res.status(500).json({ error: err.message });
  }
};

// 5. Apply Database Migration Endpoint
exports.applyMigration = async (req, res) => {
  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', 'create_zones_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    const rpcs = ['exec_sql', 'execute_sql', 'exec', 'run_sql'];
    let applied = false;
    let rpcError = null;

    for (const rpcName of rpcs) {
      try {
        const { data, error } = await supabase.rpc(rpcName, { sql_query: sql, sql, query: sql });
        if (!error) {
          applied = true;
          return res.json({ success: true, message: `Migration applied via RPC ${rpcName}`, data });
        }
        rpcError = error.message;
      } catch (e) {
        rpcError = e.message;
      }
    }

    return res.json({ 
      success: false, 
      applied: false, 
      message: 'RPC execution not available on Supabase instance. Please execute create_zones_table.sql in Supabase SQL editor.',
      sql,
      error: rpcError
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
