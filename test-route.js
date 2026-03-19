import http from 'http';

http.get('http://localhost:3000/admin/sms-gateway', (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  res.on('data', (chunk) => {
    // console.log(`BODY: ${chunk}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
}).on('error', (e) => {
  console.error(`Got error: ${e.message}`);
});
