const path = require('path');
// Load environment variables from the .env file in the parent directory
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const supabase = require('../config/supabase');

async function pingSupabase() {
  console.log(`[${new Date().toISOString()}] Initiating Supabase keep-alive ping...`);
  try {
    const { data, error } = await supabase
      .from('user_types')
      .select('id')
      .limit(1);

    if (error) {
      throw error;
    }

    console.log(`[${new Date().toISOString()}] Ping successful! Database is active.`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Ping failed:`, error.message);
    return false;
  }
}

// If run directly
if (require.main === module) {
  pingSupabase().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = pingSupabase;
