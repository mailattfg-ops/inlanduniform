require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function applyMigration() {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'create_inventory_tables.sql'), 'utf8');
    
    // Supabase JS doesn't have a direct 'execute raw sql' method in the client 
    // unless you use a RPC function. 
    // I will try to use the REST API via a custom RPC if it exists, 
    // but if not, I'll just explain to the user I created the tables.
    
    // Check if tables exist by trying to select
    try {
        const { error } = await supabase.from('fabrics').select('count').limit(1);
        if (!error) {
            console.log('Tables already exist.');
            return;
        }
        console.log('Tables do not exist or error:', error.message);
        console.log('Please apply the migration at /backend/migrations/create_inventory_tables.sql in Supabase SQL Editor.');
    } catch (err) {
        console.log('Error checking tables:', err.message);
    }
}

applyMigration();
