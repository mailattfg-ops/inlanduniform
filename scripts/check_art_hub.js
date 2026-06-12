require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
    console.log('==================================================');
    console.log('  Art Number Hub - Automated Database Validation  ');
    console.log('==================================================\n');

    let allPassed = true;
    const tables = ['art_dresses', 'art_genders', 'art_patterns', 'art_numbers'];
    const results = {};

    for (const table of tables) {
        console.log(`Checking public.${table} registry...`);
        const { data: rows, error } = await supabase
            .from(table)
            .select('id')
            .limit(1);

        if (error) {
            console.log(`❌ Table public.${table} error: ${error.message}`);
            results[table] = { status: 'MISSING/ERROR', details: error.message };
            allPassed = false;
        } else {
            console.log(`✅ Table public.${table} exists!`);
            const { data: sampleRows } = await supabase.from(table).select('*').limit(3);
            results[table] = { status: 'OK', count: sampleRows?.length || 0, sample: sampleRows };
        }
        console.log('--------------------------------------------------');
    }

    if (!allPassed) {
        console.log('\n>>> ⚠️ STATE RED: Missing Art Number Hub database tables!');
        console.log('>>> ACTION REQUIRED: Please execute the SQL migration script:');
        console.log('>>> "backend/migrations/create_art_number_hub_tables.sql"');
        console.log('>>> in your Supabase Project SQL Editor to seed the 4 tables.');
    } else {
        console.log('\n>>> 🎉 STATE GREEN: All 4 Art Number Hub tables exist and are verified!');
        console.log('\nDetails of Seeded Components:');
        
        console.log('\n1. Dress Prefixes (art_dresses):');
        results.art_dresses.sample?.forEach(d => console.log(`  - Code: "${d.code}" | Category: "${d.name}"`));
        
        console.log('\n2. Gender Codes (art_genders):');
        results.art_genders.sample?.forEach(g => console.log(`  - Code: "${g.code}" | Description: "${g.name}"`));
        
        console.log('\n3. Pattern Codes (art_patterns):');
        results.art_patterns.sample?.forEach(p => console.log(`  - Code: "${p.code}" | Description: "${p.name}"`));
        
        console.log('\n4. Pre-registered Art Numbers (art_numbers):');
        results.art_numbers.sample?.forEach(an => console.log(`  - Combined Art Number: "${an.code}"`));
        
        console.log('\n>>> All systems configured and fully operational!');
    }
    console.log('\n==================================================');
}

check();
