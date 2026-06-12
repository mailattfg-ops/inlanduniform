const http = require('http');

const payload = JSON.stringify({
  title: "Test Quote from Script",
  organization_id: 1,
  items: [
    {
      product_type_id: 3,
      quantity: 10,
      unit_price: 100,
      total_price: 1000,
      size_breakdown: {
        design_number: "DN-0001"
      }
    }
  ]
});

const options = {
  hostname: 'localhost',
  port: 5005,
  path: '/api/quotations',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    console.log('Response body:', data);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(payload);
req.end();
