require('dotenv').config();
console.log('Environment keys:', Object.keys(process.env));
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
if (process.env.DATABASE_URL) {
  console.log('DATABASE_URL exists');
} else {
  console.log('DATABASE_URL does not exist');
}
