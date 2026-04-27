require('dotenv').config();
const supabase = require('./config/supabase');

async function checkMember() {
    const { data, error } = await supabase
        .from('registry_members')
        .select('*')
        .eq('user_id', 175)
        .maybeSingle();
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('Member Record:', data);
}

checkMember();
