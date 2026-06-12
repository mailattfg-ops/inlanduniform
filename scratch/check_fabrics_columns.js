require('dotenv').config();
const supabase = require('../config/supabase');

async function check() {
    try {
        const { data, error } = await supabase
            .from('fabrics')
            .select('*')
            .limit(1);
        if (error) {
            console.error('Error fetching fabrics:', error);
        } else {
            console.log('Fabric record:', data);
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}

check();
