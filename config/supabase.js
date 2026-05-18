const { createClient } = require('@supabase/supabase-js');

let supabaseInstance = null;

const getSupabase = () => {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('CRITICAL ERROR: SUPABASE_URL or SUPABASE_KEY is missing.');
    // Return a dummy client or throw a controlled error inside the request
    if (process.env.NODE_ENV === 'production') {
       throw new Error('Supabase configuration missing on server.');
    }
  }

  supabaseInstance = createClient(supabaseUrl || 'http://placeholder.url', supabaseKey || 'placeholder-key', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  return supabaseInstance;
};

module.exports = getSupabase();
