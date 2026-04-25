require('dotenv').config();
const supabase = require('./config/supabase');

async function check() {
    const { data, error } = await supabase.from('user_types').select('*');
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}

check();
