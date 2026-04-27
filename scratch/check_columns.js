require('dotenv').config();
const supabase = require('./config/supabase');

async function checkDepartments() {
    const { data, error } = await supabase.from('departments').select('*').limit(1);
    if (error) {
        console.error('Error fetching departments:', error);
        return;
    }
    console.log('Departments columns:', Object.keys(data[0] || {}));
}

checkDepartments();
