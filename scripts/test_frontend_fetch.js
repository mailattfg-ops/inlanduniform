require('dotenv').config({ path: './.env' });
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.SUPABASE_KEY || 'uniform-system-secret-2024';

async function testFetch() {
  try {
    const token = jwt.sign({
      id: 58,
      username: 'admin',
      permissions: ['all']
    }, JWT_SECRET, { expiresIn: '1h' });

    const http = require('http');

    const fetchJson = (path) => new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 5005,
        path,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.end();
    });

    const quotations = await fetchJson('/api/quotations');
    const orders = await fetchJson('/api/orders');

    console.log('Total Quotations returned:', quotations.length);
    console.log('Total Orders returned:', orders.length);

    // Run frontend filter logic
    const paidQuotes = quotations.filter(
      (q) => q.status === 'Approved' && (q.payment_status === 'Paid' || q.payment_status === 'Partially Paid')
    );
    console.log('After Approved && (Paid || Partially Paid) filter:', paidQuotes.map(q => ({ id: q.id, no: q.quotation_no, payment_status: q.payment_status })));

    const awaitingOrders = paidQuotes.filter(q => !orders.some(o => o.quotation_id === q.id));
    console.log('Awaiting Orders (to be displayed):', awaitingOrders.map(q => ({ id: q.id, no: q.quotation_no, payment_status: q.payment_status })));

  } catch (err) {
    console.error('Error:', err);
  }
}

testFetch();
