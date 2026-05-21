require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
    console.log('Checking for product_types table in Supabase...');
    const { data, error } = await supabase
        .from('product_types')
        .select('id, name')
        .limit(5);

    if (error) {
        console.log('\n--- SYSTEM STATE: TABLES NOT DETECTED ---');
        console.log('Code:', error.code);
        console.log('Message:', error.message);
        if (error.code === '42P01') {
            console.log('\n>>> ACTION REQUIRED: The product_types table is MISSING.');
            console.log('>>> Please open your Supabase SQL Editor and execute the migration file:');
            console.log('>>> /backend/migrations/create_product_types_table.sql\n');
        } else {
            console.log('>>> Error details:', error);
        }
    } else {
        console.log('\n--- SUCCESS: TABLES DETECTED ---');
        console.log(`Successfully verified! Table exists and found ${data.length} seeded types:`);
        data.forEach(item => {
            console.log(` - ID: ${item.id} | Name: ${item.name}`);
        });
        console.log('\n>>> Everything is ready and working flawlessly!');
    }
}

check();
