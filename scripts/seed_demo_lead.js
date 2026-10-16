const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const supabase = require('../config/supabase');

async function seedDemoLead() {
  const resultFile = path.resolve(__dirname, '../seed_result.json');
  try {
    console.log('[SEED] Checking for existing demo lead Zenith Apex Technologies Pvt Ltd...');
    const { data: existing } = await supabase
      .from('leads')
      .select('*')
      .eq('name', 'Zenith Apex Technologies Pvt Ltd')
      .maybeSingle();

    const threeDaysAgoMs = Date.now() - (3 * 24 * 60 * 60 * 1000);
    const threeDaysAgoIso = new Date(threeDaysAgoMs).toISOString();

    if (existing) {
      console.log('[SEED] Demo lead already exists:', existing.lead_code, 'id:', existing.id);
      // Ensure timestamps and status are exactly 3 days ago and Sales Leads
      const { data: updated, error: updateErr } = await supabase
        .from('leads')
        .update({
          status: 'Sales Leads',
          branch_id: 3,
          assigned_staff_id: 4,
          created_at: threeDaysAgoIso,
          updated_at: threeDaysAgoIso
        })
        .eq('id', existing.id)
        .select(`
          *,
          industries ( id, name ),
          employees ( id, full_name, employee_id, branch_id )
        `)
        .single();

      const res = { success: true, action: 'updated', lead: updated || existing, error: updateErr };
      fs.writeFileSync(resultFile, JSON.stringify(res, null, 2));
      console.log('[SEED] Result written to seed_result.json');
      return res;
    }

    // Get next lead code
    const { data: allLeads } = await supabase.from('leads').select('lead_code');
    let maxNum = 0;
    (allLeads || []).forEach(l => {
      if (l.lead_code && l.lead_code.startsWith('LN')) {
        const n = parseInt(l.lead_code.substring(2), 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    });
    const nextLeadCode = 'LN' + String(maxNum + 1).padStart(3, '0');

    const leadPayload = {
      lead_code: nextLeadCode,
      name: 'Zenith Apex Technologies Pvt Ltd',
      contact_title: 'Mr.',
      contact_person: 'Vikram Malhotra',
      contact_designation: 'Procurement & Admin Head',
      phone: '+91 98450 12345',
      contact_number: '+91 98450 12345',
      email: 'vikram.malhotra@zenithapex.com',
      industry_id: 2, // Corporate
      branch_id: 3, // Main Branch
      assigned_staff_id: 4, // Hafiz Muhammed (EMP-2026-003)
      status: 'Sales Leads',
      requirements: 'Custom corporate uniforms & blazers for 150 staff members. Demo lead assigned to salesperson with no follow-up for 3 days.',
      address: 'Zenith Tower, Infopark Expressway, Kakkanad',
      area: 'Infopark Campus',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682042',
      country: 'India',
      origin: 'BRANCH',
      is_cold: false,
      remarks: [
        {
          stage: 'Sales Leads',
          text: 'Lead registered and assigned to salesperson Hafiz Muhammed (EMP-2026-003) at Main Branch. Pending initial client follow-up (3 days elapsed with no follow-up).',
          date: '12 Oct 2026',
          time: '10:00 AM',
          author: {
            name: 'Branch Manager',
            employee_id: 'MGR-001',
            designation: 'Branch Manager',
            department: 'Commercial Sales'
          }
        }
      ],
      created_at: threeDaysAgoIso,
      updated_at: threeDaysAgoIso
    };

    const { data: newLead, error: insertErr } = await supabase
      .from('leads')
      .insert([leadPayload])
      .select(`
        *,
        industries ( id, name ),
        employees ( id, full_name, employee_id, branch_id )
      `)
      .single();

    if (insertErr) {
      console.error('[SEED] Insert error:', insertErr);
      const res = { success: false, error: insertErr };
      fs.writeFileSync(resultFile, JSON.stringify(res, null, 2));
      return res;
    }

    console.log('[SEED] Successfully created demo lead:', newLead.lead_code, newLead.name);

    // Record stage history
    try {
      await supabase.from('lead_stage_history').insert([{
        lead_id: newLead.id,
        stage: 'Sales Leads',
        entered_at: threeDaysAgoIso,
        transition_reason: 'Assigned to salesperson Hafiz Muhammed at Main Branch',
        performed_by: 4
      }]);
    } catch (shErr) {
      console.warn('[SEED] Stage history warning:', shErr.message);
    }

    const res = { success: true, action: 'created', lead: newLead };
    fs.writeFileSync(resultFile, JSON.stringify(res, null, 2));
    console.log('[SEED] Result written to seed_result.json');
    return res;
  } catch (err) {
    console.error('[SEED] Exception:', err);
    const res = { success: false, error: err.message };
    fs.writeFileSync(resultFile, JSON.stringify(res, null, 2));
    return res;
  }
}

if (require.main === module) {
  seedDemoLead().then(() => process.exit(0));
}

module.exports = seedDemoLead;
