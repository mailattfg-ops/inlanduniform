require('dotenv').config();
const supabase = require('./config/supabase');

async function check() {
    const { data, error } = await supabase.from('user_profiles').select('*').limit(1);
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log(Object.keys(data[0] || {}));
}

check();
