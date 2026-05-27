require('dotenv').config();
const supabase = require('./config/supabase');

async function findOrCreateGroupDesignNumber(designCodes) {
    if (!designCodes || !Array.isArray(designCodes)) return null;

    // Filter, trim, uppercase, and get unique design numbers
    const uniqueCodes = [...new Set(
        designCodes
            .map(code => (code || '').trim())
            .filter(code => code !== '')
    )].sort();

    console.log('uniqueCodes:', uniqueCodes);
    if (uniqueCodes.length === 0) return null;

    // 1. Ensure all individual design numbers exist in public.design_numbers
    const { data: existingDNs, error: fetchError } = await supabase
        .from('design_numbers')
        .select('*')
        .eq('type', 'Design')
        .in('code', uniqueCodes);

    if (fetchError) throw fetchError;
    console.log('existingDNs:', existingDNs);

    const existingCodes = existingDNs ? existingDNs.map(dn => dn.code) : [];
    const missingCodes = uniqueCodes.filter(code => !existingCodes.includes(code));
    console.log('missingCodes:', missingCodes);

    // Insert missing design numbers
    if (missingCodes.length > 0) {
        const insertPayload = missingCodes.map(code => ({ code, type: 'Design' }));
        const { error: insertError } = await supabase
            .from('design_numbers')
            .insert(insertPayload);
        if (insertError) throw insertError;
        console.log('Inserted missing codes successfully.');
    }

    // Fetch all of them again to get IDs
    const { data: allDNs, error: fetchAllError } = await supabase
        .from('design_numbers')
        .select('id, code')
        .eq('type', 'Design')
        .in('code', uniqueCodes);

    if (fetchAllError) throw fetchAllError;
    console.log('allDNs:', allDNs);

    const dnMap = {};
    allDNs.forEach(dn => {
        dnMap[dn.code] = dn.id;
    });

    const targetIds = uniqueCodes.map(code => dnMap[code]).sort();
    console.log('targetIds:', targetIds);

    // 2. Find if an existing Group Design Number matches this exact set of child IDs
    const { data: mappings, error: mapErr } = await supabase
        .from('group_design_mappings')
        .select('parent_id, child_id');

    if (mapErr) throw mapErr;

    const groupMap = {};
    (mappings || []).forEach(m => {
        if (!groupMap[m.parent_id]) groupMap[m.parent_id] = [];
        groupMap[m.parent_id].push(m.child_id);
    });

    let matchedParentId = null;
    for (const parentId of Object.keys(groupMap)) {
        const childIds = groupMap[parentId].sort();
        if (childIds.length === targetIds.length && childIds.every((val, index) => val === targetIds[index])) {
            matchedParentId = Number(parentId);
            break;
        }
    }

    if (matchedParentId !== null) {
        console.log('Found existing match:', matchedParentId);
        return matchedParentId;
    }

    // 3. Create a new Group Design Number
    const { data: latestGDN, error: latestError } = await supabase
        .from('design_numbers')
        .select('code')
        .eq('type', 'Group Design')
        .ilike('code', 'GDN-%')
        .order('code', { ascending: false })
        .limit(1);

    if (latestError) throw latestError;
    console.log('latestGDN:', latestGDN);

    let nextNum = 1;
    if (latestGDN && latestGDN.length > 0) {
        const match = latestGDN[0].code.match(/GDN-(\d+)/);
        if (match) {
            nextNum = parseInt(match[1], 10) + 1;
        }
    }
    const nextCode = `GDN-${String(nextNum).padStart(4, '0')}`;
    console.log('nextCode:', nextCode);

    // Insert new GDN record
    const { data: newGDN, error: newGDNError } = await supabase
        .from('design_numbers')
        .insert([{ code: nextCode, type: 'Group Design' }])
        .select()
        .single();

    if (newGDNError) throw newGDNError;
    console.log('New GDN created:', newGDN);

    // Insert mappings
    const mappingsToInsert = targetIds.map(childId => ({
        parent_id: newGDN.id,
        child_id: childId
    }));

    const { error: mapInsertError } = await supabase
        .from('group_design_mappings')
        .insert(mappingsToInsert);

    if (mapInsertError) throw mapInsertError;

    console.log('Mappings inserted successfully.');
    return newGDN.id;
}

findOrCreateGroupDesignNumber(['1-4J012 - shirt - cotton'])
  .then(res => console.log('Result:', res))
  .catch(err => console.error(err));
