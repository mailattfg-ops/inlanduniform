require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
    console.log('Checking for audit_logs table...');
    const { data, error } = await supabase
        .from('audit_logs')
        .select('id')
        .limit(1);

    if (error) {
        console.log('--- ERROR DETECTED ---');
        console.log('Code:', error.code);
        console.log('Message:', error.message);
        if (error.code === '42P01') {
            console.log('\n>>> ACTION REQUIRED: The audit_logs table IS MISSING.');
            console.log('>>> Please run the SQL migration in your Supabase SQL Editor.\n');
        }
    } else {
        console.log('SUCCESS: table exists. Row count found (limit 1):', data.length);
    }
}

check();
