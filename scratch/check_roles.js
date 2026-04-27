require('dotenv').config();
const supabase = require('./config/supabase');

async function checkRoles() {
    const { data, error } = await supabase.from('user_types').select('*');
    if (error) {
        console.error('Error fetching roles:', error);
        return;
    }
    console.log('Roles in DB:', data.map(r => r.name));
}

checkRoles();
