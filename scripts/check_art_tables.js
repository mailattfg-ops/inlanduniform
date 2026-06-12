require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
    console.log('Checking for art_dresses table...');
    const { data: dressData, error: dressError } = await supabase
        .from('art_dresses')
        .select('id')
        .limit(1);

    if (dressError) {
        console.log('art_dresses table: NOT FOUND or error:', dressError.message);
    } else {
        console.log('art_dresses table: EXISTS! Row count:', dressData.length);
    }

    console.log('Checking for art_numbers table...');
    const { data: numData, error: numError } = await supabase
        .from('art_numbers')
        .select('id, code')
        .limit(1);

    if (numError) {
        console.log('art_numbers table: NOT FOUND or error:', numError.message);
    } else {
        console.log('art_numbers table: EXISTS! First row:', numData);
    }
}

check();
