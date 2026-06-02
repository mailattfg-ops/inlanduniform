const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'c:/Users/shiju/Desktop/uniform/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- Database Cleanup Started ---');

  // 1. Fetch all product design variants
  const { data: variants, error: vErr } = await supabase
      .from('product_design_variants')
      .select('*');

  if (vErr) {
      console.error('Error fetching variants:', vErr);
      return;
  }

  console.log(`Fetched ${variants.length} design variants.`);

  // 2. Identify duplicates. A duplicate is defined by same (product_id, button_id, thread_id, button_count, thread_count)
  const variantGroups = {};
  variants.forEach(v => {
      const key = `${v.product_id}_${v.button_id || 'null'}_${v.thread_id || 'null'}_${v.button_count || 0}_${v.thread_count || 0}`;
      if (!variantGroups[key]) {
          variantGroups[key] = [];
      }
      variantGroups[key].push(v);
  });

  const duplicatesToProcess = [];
  for (const key of Object.keys(variantGroups)) {
      const group = variantGroups[key];
      if (group.length > 1) {
          // Sort by id ascending so the first one (earliest) is kept
          group.sort((a, b) => a.id - b.id);
          const kept = group[0];
          const dups = group.slice(1);
          duplicatesToProcess.push({ kept, dups });
          console.log(`Found duplicate group for key "${key}". Keeping Variant ID ${kept.id} (DN Code ID ${kept.design_number_id}). Duplicates to remove: ${dups.map(d => d.id).join(', ')}`);
      }
  }

  // 3. For each duplicate variant, update references in group_design_mappings and delete the duplicates
  for (const item of duplicatesToProcess) {
      const keptDnId = item.kept.design_number_id;
      for (const dup of item.dups) {
          const dupDnId = dup.design_number_id;

          // Find mapping referencing the duplicate DN
          const { data: mappings, error: mapFetchErr } = await supabase
              .from('group_design_mappings')
              .select('*')
              .eq('child_id', dupDnId);

          if (mapFetchErr) {
              console.error(`Error fetching mappings for duplicate DN ID ${dupDnId}:`, mapFetchErr);
              continue;
          }

          for (const mapping of (mappings || [])) {
              // Check if mapping for (parent_id, keptDnId) already exists to avoid unique constraint violations
              const { data: existingMap } = await supabase
                  .from('group_design_mappings')
                  .select('*')
                  .eq('parent_id', mapping.parent_id)
                  .eq('child_id', keptDnId)
                  .maybeSingle();

              if (existingMap) {
                  // If it already exists, just delete this duplicate mapping
                  await supabase
                      .from('group_design_mappings')
                      .delete()
                      .eq('id', mapping.id);
              } else {
                  // Otherwise, update child_id to the kept DN ID
                  await supabase
                      .from('group_design_mappings')
                      .update({ child_id: keptDnId })
                      .eq('id', mapping.id);
              }
          }

          // Delete the duplicate variant record
          const { error: delVarErr } = await supabase
              .from('product_design_variants')
              .delete()
              .eq('id', dup.id);

          if (delVarErr) {
              console.error(`Error deleting variant ${dup.id}:`, delVarErr);
          } else {
              console.log(`Deleted duplicate Variant ID ${dup.id}.`);
          }

          // Delete the duplicate design number record
          const { error: delDnErr } = await supabase
              .from('design_numbers')
              .delete()
              .eq('id', dupDnId);

          if (delDnErr) {
              console.error(`Error deleting Design Number ID ${dupDnId}:`, delDnErr);
          } else {
              console.log(`Deleted duplicate Design Number ID ${dupDnId}.`);
          }
      }
  }

  // 4. Clean up unused group_design_numbers (those not linked to any quotation)
  console.log('\n--- Cleaning up Unused Group Design Numbers ---');

  // Fetch all active quotations' group design number IDs
  const { data: quotations, error: qErr } = await supabase
      .from('quotations')
      .select('group_design_number_id')
      .not('group_design_number_id', 'is', null);

  if (qErr) {
      console.error('Error fetching quotations:', qErr);
      return;
  }

  const referencedGdnIds = new Set(quotations.map(q => q.group_design_number_id));
  console.log(`Referenced Group Design Number IDs count: ${referencedGdnIds.size}`);

  // Fetch all group design numbers
  const { data: allGdns, error: gdnErr } = await supabase
      .from('group_design_numbers')
      .select('id, code');

  if (gdnErr) {
      console.error('Error fetching group design numbers:', gdnErr);
      return;
  }

  const unusedGdns = allGdns.filter(g => !referencedGdnIds.has(g.id));
  console.log(`Found ${unusedGdns.length} unused Group Design Numbers.`);

  for (const unused of unusedGdns) {
      console.log(`Removing unused GDN: ${unused.code} (ID: ${unused.id})`);

      // 1. Delete associated mappings first
      const { error: mapDelErr } = await supabase
          .from('group_design_mappings')
          .delete()
          .eq('parent_id', unused.id);

      if (mapDelErr) {
          console.error(`Error deleting mappings for parent ${unused.id}:`, mapDelErr);
          continue;
      }

      // 2. Delete the group design number record itself
      const { error: gdnDelErr } = await supabase
          .from('group_design_numbers')
          .delete()
          .eq('id', unused.id);

      if (gdnDelErr) {
          console.error(`Error deleting GDN ${unused.id}:`, gdnDelErr);
      } else {
          console.log(`Successfully deleted ${unused.code}.`);
      }
  }

  console.log('\n--- Database Cleanup Completed Successfully ---');
}

run();
