const http = require('http');

http.get('http://localhost:5005/api/products', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response Status:', res.statusCode);
    try {
      const json = JSON.parse(data);
      console.log('Successfully fetched products API! Sample row:');
      if (Array.isArray(json) && json.length > 0) {
        console.log(json[0]);
      } else {
        console.log('No products or response details:', json);
      }
    } catch (e) {
      console.log('Error parsing response:', e.message);
      console.log('Raw Data:', data);
    }
  });
}).on('error', (err) => {
  console.error('Request error:', err.message);
});
