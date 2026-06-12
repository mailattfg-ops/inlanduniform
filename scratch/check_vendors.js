require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
    try {
        const { data, error } = await supabase
            .from('vendors')
            .select('*')
            .limit(5);
        if (error) {
            console.error('Error fetching vendors:', error);
        } else {
            console.log('Vendors list:', data);
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}

check();
