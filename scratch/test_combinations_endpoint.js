require('dotenv').config();
const supabase = require('../config/supabase');

async function testCombinations() {
  try {
    const { data: groupDesigns, error: gdError } = await supabase
        .from('design_numbers')
        .select('id, code')
        .eq('type', 'Group Design');

    if (gdError) throw gdError;

    const { data: mappings, error: mapError } = await supabase
        .from('group_design_mappings')
        .select('parent_id, child_id');

    if (mapError) throw mapError;

    const { data: products, error: prodError } = await supabase
        .from('products')
        .select(`
            *,
            product_types(id, name),
            design_number_ref:design_numbers(id, code)
        `);

    if (prodError) throw prodError;

    const mappingsByParent = {};
    (mappings || []).forEach(m => {
        if (!mappingsByParent[m.parent_id]) {
            mappingsByParent[m.parent_id] = [];
        }
        mappingsByParent[m.parent_id].push(m.child_id);
    });

    const formattedProducts = (products || []).map(p => ({
        ...p,
        design_number: p.design_number_ref?.code || null,
        design_number_id: p.design_number_ref?.id || null,
        design_number_ref: undefined
    }));

    const results = (groupDesigns || []).map(gd => {
        const childIds = mappingsByParent[gd.id] || [];
        const associatedProducts = formattedProducts.filter(p => p.design_number_id && childIds.includes(p.design_number_id));
        return {
            id: gd.id,
            code: gd.code,
            products: associatedProducts
        };
    }).filter(item => item.products.length > 0);

    console.log('SUCCESS! Combinations found:', results.length);
    if (results.length > 0) {
      console.log('First combination:', JSON.stringify(results[0], null, 2));
    }
  } catch (err) {
    console.error('ERROR running test:', err);
  }
}

testCombinations();
