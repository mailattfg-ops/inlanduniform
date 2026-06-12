require('dotenv').config({ path: './.env' });
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.SUPABASE_KEY || 'uniform-system-secret-2024';

async function testLiveApi() {
  try {
    console.log('--- Testing Live API Endpoint: POST /api/orders ---');

    // Create a mock admin token
    const token = jwt.sign({
      id: 58,
      username: 'admin',
      permissions: ['all']
    }, JWT_SECRET, { expiresIn: '1h' });

    console.log('Generated JWT Admin Token successfully.');

    // We want to hit POST http://localhost:5005/api/orders
    // quotation_id: 2
    // order_notes: 'Live API test notes'

    const postData = JSON.stringify({
      quotation_id: 2,
      order_notes: 'Live API test notes'
    });

    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: 5005,
      path: '/api/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', async () => {
        console.log(`Response Status: ${res.statusCode}`);
        console.log('Response Body:', data);
        
        try {
          const body = JSON.parse(data);
          if (res.statusCode === 200 && body.id) {
            console.log('✅ Live API test succeeded! Successfully placed order on partially paid quotation ID 2.');
            
            // Clean up the created order in the DB
            const supabase = require('../config/supabase');
            await supabase.from('orders').delete().eq('id', body.id);
            console.log('✅ Cleaned up live test order.');
          } else {
            console.error('❌ Live API test failed with body:', body);
          }
        } catch (e) {
          console.error('❌ Failed to parse response JSON:', e);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ HTTP Request Error: ${e.message}`);
    });

    req.write(postData);
    req.end();

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testLiveApi();
