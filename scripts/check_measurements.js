require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
  try {
    console.log('--- Checking organizations ---');
    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .limit(5);
    console.log('Orgs:', orgs || orgError);

    console.log('--- Checking registry_members ---');
    const { data: members, error: memError } = await supabase
      .from('registry_members')
      .select('id, full_name, organization_id, department_id')
      .limit(5);
    console.log('Members:', members || memError);

    console.log('--- Checking measurements ---');
    const { data: meas, error: measError } = await supabase
      .from('measurements')
      .select('id, member_id, suggested_size, status, dynamic_data')
      .limit(5);
    console.log('Measurements:', meas || measError);
  } catch (err) {
    console.error('Error during check:', err);
  }
}

check();
